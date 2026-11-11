import { describe, expect, it } from '@jest/globals'
import { createHmac } from 'node:crypto'
import {
  resolveRunTokenSecret,
  RUN_TOKEN_SECRET_ENV,
  RUN_TOKEN_VERSION,
  signRunToken,
  verifyRunToken,
  type RunTokenClaims,
} from '../run-token'

const SECRET = 'unit-test-secret-not-real'
const NOW = 1_800_000_000

const claims: RunTokenClaims = {
  runId: 'run-1',
  bindingId: 'binding-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  exp: NOW + 60,
  tools: ['crm.find_companies'],
}

/** Sign a payload the verifier would normally receive from signRunToken(). */
function forge(payload: unknown, secret = SECRET): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = createHmac('sha256', secret).update(`${RUN_TOKEN_VERSION}.${encoded}`).digest('base64url')
  return `${RUN_TOKEN_VERSION}.${encoded}.${signature}`
}

describe('run token', () => {
  it('round-trips the identity, tools and expiry', () => {
    const token = signRunToken(claims, SECRET)
    expect(verifyRunToken(token, { secret: SECRET, now: NOW })).toEqual({ ok: true, claims })
  })

  it('keeps the identity server-signed; a caller cannot inject fields into the payload', () => {
    const token = signRunToken(claims, SECRET)
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as unknown
    expect(payload).toEqual(claims)
  })

  it('rejects an expired token even with a valid signature', () => {
    const token = signRunToken({ ...claims, exp: NOW }, SECRET)
    expect(verifyRunToken(token, { secret: SECRET, now: NOW })).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects a tampered payload (same identity, new user) as a bad signature', () => {
    const token = signRunToken(claims, SECRET)
    const [version, , signature] = token.split('.')
    const payload = Buffer.from(JSON.stringify({ ...claims, userId: 'attacker' }), 'utf8').toString('base64url')
    expect(verifyRunToken(`${version}.${payload}.${signature}`, { secret: SECRET, now: NOW })).toEqual({
      ok: false,
      reason: 'invalid-token',
    })
  })

  it('rejects a tampered signature', () => {
    const token = signRunToken(claims, SECRET)
    const parts = token.split('.')
    const signature = parts[2]
    const flipped = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
    expect(verifyRunToken(`${parts[0]}.${parts[1]}.${flipped}`, { secret: SECRET, now: NOW })).toEqual({
      ok: false,
      reason: 'invalid-token',
    })
  })

  it('normalizes whitespace around the secret the same way on both sides', () => {
    const token = signRunToken(claims, '  padded-secret  ')
    expect(verifyRunToken(token, { secret: 'padded-secret', now: NOW })).toEqual({ ok: true, claims })
  })

  it('rejects a token signed with a different secret', () => {
    const token = signRunToken(claims, 'some-other-secret')
    expect(verifyRunToken(token, { secret: SECRET, now: NOW })).toEqual({ ok: false, reason: 'invalid-token' })
  })

  it('fails closed when the signing secret is missing or blank', () => {
    const token = signRunToken(claims, SECRET)
    expect(verifyRunToken(token, { secret: undefined, now: NOW })).toEqual({ ok: false, reason: 'missing-secret' })
    expect(verifyRunToken(token, { secret: '   ', now: NOW })).toEqual({ ok: false, reason: 'missing-secret' })
    expect(() => signRunToken(claims, '')).toThrow(/not configured/)
  })

  it('rejects malformed tokens without throwing', () => {
    const token = signRunToken(claims, SECRET)
    const [version, payload] = token.split('.')
    for (const malformed of ['', 'not-a-token', `${version}.${payload}`, `omdsh2.${payload}.sig`, 'x'.repeat(5000)]) {
      expect(verifyRunToken(malformed, { secret: SECRET, now: NOW })).toEqual({ ok: false, reason: 'invalid-token' })
    }
  })

  it('rejects unknown or missing claims even when the signature is valid', () => {
    expect(verifyRunToken(forge({ ...claims, extra: 'smuggled' }), { secret: SECRET, now: NOW })).toEqual({
      ok: false,
      reason: 'invalid-token',
    })
    const { userId: _omitted, ...withoutUser } = claims
    expect(verifyRunToken(forge(withoutUser), { secret: SECRET, now: NOW })).toEqual({
      ok: false,
      reason: 'invalid-token',
    })
    expect(verifyRunToken(forge({ ...claims, tools: 'crm.find_companies' }), { secret: SECRET, now: NOW })).toEqual({
      ok: false,
      reason: 'invalid-token',
    })
  })

  it('refuses to sign malformed claims', () => {
    expect(() => signRunToken({ ...claims, userId: '   ' }, SECRET)).toThrow()
    expect(() => signRunToken({ ...claims, exp: 0 }, SECRET)).toThrow()
  })

  it('reads the secret from OM_DSH_RUN_TOKEN_SECRET without inventing a fallback', () => {
    expect(RUN_TOKEN_SECRET_ENV).toBe('OM_DSH_RUN_TOKEN_SECRET')
    expect(
      resolveRunTokenSecret({ [RUN_TOKEN_SECRET_ENV]: '  s3cret  ' } as unknown as NodeJS.ProcessEnv),
    ).toBe('s3cret')
    expect(resolveRunTokenSecret({} as unknown as NodeJS.ProcessEnv)).toBeNull()
    expect(
      resolveRunTokenSecret({ [RUN_TOKEN_SECRET_ENV]: '   ' } as unknown as NodeJS.ProcessEnv),
    ).toBeNull()
  })
})
