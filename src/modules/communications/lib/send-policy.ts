/**
 * Send policy for providers with a customer-service window.
 *
 * WhatsApp Business and Messenger only allow free-form text within 24 hours of
 * the customer's last inbound message; outside that window the platform requires
 * a pre-approved template. The hub's `sendAsUser` facade does not know about
 * provider windows (it validates ownership and channel state only), so the mobile
 * facade enforces the policy before it calls the hub. A template send is recorded
 * via channelMetadata.template and skips the window check; whether the provider
 * adapter can actually deliver it is a later slice (ADR-005 G4).
 *
 * Kept as a pure function so the rules are testable without a database or a
 * provider: the route only loads the facts (channel type, last inbound time).
 */

export const CUSTOMER_WINDOW_MS = 24 * 60 * 60 * 1000

export type SendPolicyInput = {
  channelType: string | null
  lastInboundAt: Date | null
  hasTemplate: boolean
  now?: Date
}

export type SendPolicyResult =
  | { allowed: true; reason: 'no_window' | 'within_window' | 'template' }
  | { allowed: false; code: 'WINDOW_CLOSED'; message: string; lastInboundAt: string | null }

const WINDOWED_TYPES = new Set(['whatsapp', 'messenger'])

export function evaluateSendPolicy(input: SendPolicyInput): SendPolicyResult {
  const type = (input.channelType || '').toLowerCase()
  if (!WINDOWED_TYPES.has(type)) return {allowed: true, reason: 'no_window'}
  if (input.hasTemplate) return {allowed: true, reason: 'template'}
  const now = input.now ?? new Date()
  const last = input.lastInboundAt
  if (last && now.getTime() - last.getTime() <= CUSTOMER_WINDOW_MS) {
    return {allowed: true, reason: 'within_window'}
  }
  return {
    allowed: false,
    code: 'WINDOW_CLOSED',
    message:
      'Outside the 24h customer-service window: send an approved template instead of free-form text',
    lastInboundAt: last ? last.toISOString() : null,
  }
}

