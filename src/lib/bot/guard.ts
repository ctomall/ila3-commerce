/**
 * Bot ingress guard (M7), as pure functions.
 *
 * A bot message is untrusted input on a shared surface: it must be signature-verified,
 * inside a replay window, bound to an active employee, and — in a group chat —
 * stripped of anything the policy does not allow to leave the CRM.
 *
 * Nothing here sends or stores anything; it decides whether an inbound event may act.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export type SignedEvent = {
  body: string
  timestamp: string
  nonce: string
  signature: string
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'bad_signature' | 'stale_timestamp' | 'missing_fields' }

/**
 * HMAC-SHA256 over `timestamp.nonce.body`, compared in constant time. The timestamp is
 * part of the signed payload so a captured signature cannot be replayed later.
 */
export function verifySignature(event: SignedEvent, secret: string, now: Date): VerifyResult {
  if (!event?.body || !event.timestamp || !event.nonce || !event.signature) {
    return { ok: false, reason: 'missing_fields' }
  }
  const expected = createHmac('sha256', secret)
    .update(`${event.timestamp}.${event.nonce}.${event.body}`)
    .digest('hex')
  const provided = event.signature.toLowerCase()
  if (expected.length !== provided.length) return { ok: false, reason: 'bad_signature' }
  const same = timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(provided, 'utf8'))
  if (!same) return { ok: false, reason: 'bad_signature' }

  if (!isFresh(event.timestamp, now)) return { ok: false, reason: 'stale_timestamp' }
  return { ok: true }
}

export function sign(event: Omit<SignedEvent, 'signature'>, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${event.timestamp}.${event.nonce}.${event.body}`)
    .digest('hex')
}

/** Default tolerance: five minutes. Anything older is refused, not queued. */
export function isFresh(timestamp: string, now: Date, windowSeconds = 300): boolean {
  const parsed = Date.parse(timestamp)
  if (!Number.isFinite(parsed)) return false
  const delta = Math.abs(now.getTime() - parsed)
  return delta <= windowSeconds * 1000
}

/** Replay protection: the first sighting of a nonce may act; the rest are dropped. */
export function isReplay(nonce: string, seen: readonly string[]): boolean {
  return seen.includes(nonce)
}

export type BotBinding = {
  id: string
  channelId: string
  externalIdentity: string
  employeeUserId: string | null
  state: 'active' | 'revoked' | 'offboarded'
}

export type ActDecision =
  | { allowed: true }
  | { allowed: false; reason: 'binding_revoked' | 'employee_inactive' | 'identity_unbound' | 'replay' | 'group_unsafe_action' }

/**
 * Whether an inbound event may act on behalf of an employee. The decision is per
 * message, not per session: revoking a binding takes effect on the next message.
 */
export function canAct(input: {
  binding: BotBinding
  employeeActive: boolean
  isGroup: boolean
  action: 'read' | 'write' | 'approve' | 'send'
  replay?: boolean
}): ActDecision {
  if (input.replay) return { allowed: false, reason: 'replay' }
  if (input.binding.state !== 'active') return { allowed: false, reason: 'binding_revoked' }
  if (!input.binding.employeeUserId) return { allowed: false, reason: 'identity_unbound' }
  if (!input.employeeActive) return { allowed: false, reason: 'employee_inactive' }
  // Group chats are a shared surface: no writes, no approvals, no sends from there.
  if (input.isGroup && input.action !== 'read') {
    return { allowed: false, reason: 'group_unsafe_action' }
  }
  return { allowed: true }
}

const SENSITIVE_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'email', pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  { name: 'phone', pattern: /\+?\d[\d\s-]{7,}\d/g },
  { name: 'amount', pattern: /(?:USD|EUR|CNY|¥|\$)\s?\d[\d,]*(?:\.\d+)?/gi },
]

/**
 * Group-chat rendering: the CRM never dumps a record into a group. Sensitive fields are
 * replaced with a marker, and the caller keeps the original for the private view.
 */
export function redactForGroup(text: string, allow: Array<'email' | 'phone' | 'amount'> = []): string {
  let output = text
  for (const rule of SENSITIVE_PATTERNS) {
    if (allow.includes(rule.name as 'email' | 'phone' | 'amount')) continue
    output = output.replace(rule.pattern, `〔${rule.name} 已隐藏〕`)
  }
  return output
}
