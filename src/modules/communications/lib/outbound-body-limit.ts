/**
 * Per-channel outbound text limit, resolved from the connector's own capability
 * declaration (design rev2 `F3-01`).
 *
 * The BFF used to accept any text up to the transport schema (50k chars) and let
 * the platform reject it: WhatsApp Cloud allows 4096, Messenger 2000. A platform
 * 4xx then surfaced as a generic "send failed" instead of an actionable limit, and
 * the message had already gone through the ledger/hub path.
 *
 * The capability is the single source of truth: nothing here hard-codes a provider
 * length. `resolveMaxBodyLength` returns `null` when the provider declares no limit
 * (email) or the adapter is absent from this process, so a missing adapter keeps the
 * old permissive behaviour instead of inventing a limit.
 */
import { getChannelAdapter } from '@open-mercato/core/modules/communication_channels/lib/adapter-registry-singleton'

export const BODY_TOO_LONG = 'BODY_TOO_LONG'

export type BodyLimitViolation = {
  code: typeof BODY_TOO_LONG
  providerKey: string
  maxLength: number
  actual: number
}

/** Provider-declared maximum plain-text length, or `null` when there is none. */
export function resolveMaxBodyLength(providerKey: string | null | undefined): number | null {
  if (!providerKey) return null
  try {
    const declared = getChannelAdapter(providerKey)?.capabilities?.maxBodyLength
    return typeof declared === 'number' && Number.isFinite(declared) && declared > 0 ? declared : null
  } catch {
    // A broken registry must not turn every send into a 500.
    return null
  }
}

/**
 * Length that counts against the provider limit: the plain body. Providers read
 * `plain`; HTML is an email-only alternative and email declares no limit.
 */
export function outboundTextLength(body: { plain?: string; html?: string }): number {
  return body.plain?.length ?? 0
}

export function checkOutboundBodyLength(input: {
  providerKey: string | null | undefined
  body: { plain?: string; html?: string }
}): BodyLimitViolation | null {
  const maxLength = resolveMaxBodyLength(input.providerKey)
  if (maxLength === null) return null
  const actual = outboundTextLength(input.body)
  if (actual <= maxLength) return null
  return {
    code: BODY_TOO_LONG,
    providerKey: input.providerKey as string,
    maxLength,
    actual,
  }
}
