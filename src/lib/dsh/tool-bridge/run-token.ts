/**
 * Run tokens for the DSH tool bridge (C1).
 *
 * The bridge is not called by a browser with a CRM session cookie: the DSH
 * runtime calls it, and the caller is a model. The only identity a tool call may
 * use is the identity the CRM itself signed into the token before the run
 * started. A userId / tenantId / organizationId in the request body — or one the
 * model claims in prose — is never read.
 *
 * Format: `<version>.<base64url(payload)>.<base64url(HMAC-SHA256)>`. The
 * signature covers `<version>.<payload>` so a version downgrade is not free.
 *
 * Deliberate properties:
 *   - the secret comes from `OM_DSH_RUN_TOKEN_SECRET`; when it is missing the
 *     verifier refuses every token instead of falling back to a default;
 *   - the secret and the token are never logged by this module, and never
 *     written anywhere (no persistence here);
 *   - `exp` is an absolute Unix timestamp in seconds and is checked before any
 *     caller can act on the claims;
 *   - the payload is parsed only after the signature verifies, so an attacker
 *     cannot spend JSON-parser work before authentication;
 *   - unknown payload fields are rejected, so a future field cannot be smuggled
 *     in behind an older verifier's back.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

export const RUN_TOKEN_VERSION = 'omdsh1'
export const RUN_TOKEN_SECRET_ENV = 'OM_DSH_RUN_TOKEN_SECRET'

/** Cheap upper bound before any decoding; a legitimate token is well below this. */
const MAX_TOKEN_LENGTH = 4096
const MAX_IDENTIFIER_LENGTH = 128
const MAX_TOOLS = 64

const claimsSchema = z
  .object({
    runId: z.string().trim().min(1).max(MAX_IDENTIFIER_LENGTH),
    bindingId: z.string().trim().min(1).max(MAX_IDENTIFIER_LENGTH),
    userId: z.string().trim().min(1).max(MAX_IDENTIFIER_LENGTH),
    tenantId: z.string().trim().min(1).max(MAX_IDENTIFIER_LENGTH),
    organizationId: z.string().trim().min(1).max(MAX_IDENTIFIER_LENGTH),
    /** Absolute Unix timestamp in seconds. */
    exp: z.number().int().positive(),
    /** Tools this run may call; the bridge checks membership per call. */
    tools: z.array(z.string().trim().min(1).max(MAX_IDENTIFIER_LENGTH)).max(MAX_TOOLS),
  })
  .strict()

export type RunTokenClaims = z.infer<typeof claimsSchema>

export type RunTokenRejection = 'missing-secret' | 'invalid-token' | 'expired'

export type RunTokenVerification =
  | { ok: true; claims: RunTokenClaims }
  | { ok: false; reason: RunTokenRejection }

/** Read the signing secret without logging it or inventing a fallback. */
export function resolveRunTokenSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env[RUN_TOKEN_SECRET_ENV]?.trim()
  return value ? value : null
}

function sign(encodedPayload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(`${RUN_TOKEN_VERSION}.${encodedPayload}`).digest()
}

/**
 * Sign claims for one run. Throws on missing secret or malformed claims; the
 * thrown messages never include the secret itself.
 */
export function signRunToken(input: RunTokenClaims, secret: string): string {
  const normalizedSecret = typeof secret === 'string' ? secret.trim() : ''
  if (normalizedSecret === '') {
    throw new Error(`${RUN_TOKEN_SECRET_ENV} is not configured; refusing to sign a run token`)
  }
  const claims = claimsSchema.parse(input)
  const encodedPayload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
  // Trim here as well as in the verifier: an env value read with a trailing
  // newline must not sign a token the verifier then rejects.
  const signature = sign(encodedPayload, normalizedSecret).toString('base64url')
  return `${RUN_TOKEN_VERSION}.${encodedPayload}.${signature}`
}

/**
 * Verify signature and expiry, in that order. `now` is in Unix seconds and is
 * injectable so tests do not depend on the wall clock.
 */
export function verifyRunToken(
  token: unknown,
  options: { secret: string | null | undefined; now?: number },
): RunTokenVerification {
  const secret = typeof options.secret === 'string' ? options.secret.trim() : ''
  if (secret === '') return { ok: false, reason: 'missing-secret' }
  if (typeof token !== 'string') return { ok: false, reason: 'invalid-token' }
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: 'invalid-token' }

  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'invalid-token' }
  const [version, encodedPayload, encodedSignature] = parts
  if (version !== RUN_TOKEN_VERSION || encodedPayload === '' || encodedSignature === '') {
    return { ok: false, reason: 'invalid-token' }
  }

  const expected = sign(encodedPayload, secret)
  const provided = Buffer.from(encodedSignature, 'base64url')
  // Length check first: timingSafeEqual throws on different lengths, and an
  // exception here would turn a malformed token into a 500.
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: 'invalid-token' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as unknown
  } catch {
    return { ok: false, reason: 'invalid-token' }
  }

  const claims = claimsSchema.safeParse(parsed)
  if (!claims.success) return { ok: false, reason: 'invalid-token' }

  const now = options.now ?? Math.floor(Date.now() / 1000)
  if (claims.data.exp <= now) return { ok: false, reason: 'expired' }

  return { ok: true, claims: claims.data }
}
