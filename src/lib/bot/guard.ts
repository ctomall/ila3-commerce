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
  /** Signed when present: relabelling a group read as a direct write must invalidate it. */
  chat?: 'dm' | 'group'
  action?: 'read' | 'write' | 'approve' | 'send'
  signature: string
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'bad_signature' | 'stale_timestamp' | 'missing_fields' }

/**
 * HMAC-SHA256 over `timestamp.nonce.body`, compared in constant time. The timestamp is
 * part of the signed payload so a captured signature cannot be replayed later.
 */
/**
 * Canonical payload for the HMAC.
 *
 * `chat` and `action` are part of it because they decide whether the message may write and
 * whether it is redacted. They used to sit outside the signature, so a captured
 * group/read event could be relabelled `dm`/`write` after signing and still verify — the
 * runtime would then allow a write from a group chat and skip redaction entirely.
 */
function canonicalPayload(event: SignedEvent): string {
  return [event.timestamp, event.nonce, event.body, event.chat ?? '', event.action ?? ''].join('.')
}

export function verifySignature(event: SignedEvent, secret: string, now: Date): VerifyResult {
  if (!event?.body || !event.timestamp || !event.nonce || !event.signature) {
    return { ok: false, reason: 'missing_fields' }
  }
  const expected = Buffer.from(createHmac('sha256', secret).update(canonicalPayload(event)).digest('hex'), 'hex')
  // Decode hex before comparing. Comparing hex *strings* looked constant-time but compared
  // by character: a 64-character non-ASCII signature passed the length check and made
  // timingSafeEqual throw (ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH), i.e. an unauthenticated
  // request could raise instead of being refused.
  let provided: Buffer
  try {
    provided = Buffer.from(String(event.signature).trim().toLowerCase(), 'hex')
  } catch {
    return { ok: false, reason: 'bad_signature' }
  }
  if (provided.length !== expected.length) return { ok: false, reason: 'bad_signature' }
  let same = false
  try {
    same = timingSafeEqual(expected, provided)
  } catch {
    return { ok: false, reason: 'bad_signature' }
  }
  if (!same) return { ok: false, reason: 'bad_signature' }

  if (!isFresh(event.timestamp, now)) return { ok: false, reason: 'stale_timestamp' }
  return { ok: true }
}

export function sign(event: Omit<SignedEvent, 'signature'>, secret: string): string {
  return createHmac('sha256', secret)
    .update(canonicalPayload(event as SignedEvent))
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

const SENSITIVE_PATTERNS: Array<{ name: string; pattern: RegExp; requires?: string }> = [
  // Whitespace-tolerant around `@` and the dots: after a line break is collapsed to a
  // space, `ops@acme. test` is still the same address to a reader. Over-redacting prose
  // like "ops @ acme . test" is the acceptable side of that trade.
  //
  // `requires` is a cheap pre-check, not a filter: `[\w.+-]+` retried at every offset makes
  // a string with no `@` quadratic (20k characters took 1.7 s, 80k took 27 s — enough to
  // block the event loop). If the literal is absent the scan is skipped entirely.
  { name: 'email', pattern: /[\w.+-]+\s*@\s*[\w-]+(?:\s*\.\s*[\w-]+)+/g, requires: '@' },
  // Dots and parentheses are how phone numbers are actually written: `138.0000.0000` and
  // `(138) 0000 0000` both walked through the old `[\d\s-]` class.
  { name: 'phone', pattern: /\+?[\d(][\d\s().-]{7,}\d/g },
  // Currency before the number, and the `元/块` suffix form. `RMB`, `€`, `£` and
  // `人民币` were simply not in the alternation.
  {
    name: 'amount',
    pattern: /(?:(?:USD|EUR|CNY|RMB|JPY|GBP|人民币|美元|欧元)\s?|¥|\$|€|£)\s?\d[\d,]*(?:\.\d+)?/gi,
  },
  { name: 'amount', pattern: /\d[\d,]*(?:\.\d+)?\s*(?:元|块|万元)/g },
]

/**
 * Longest message the group renderer will touch.
 *
 * The patterns are linear in practice, but a pathological input still costs time and — more
 * importantly — text past the cap would never be redacted. Refusing to render is the only
 * answer that neither blocks the loop nor leaks the tail.
 */
export const MAX_GROUP_RENDER_LENGTH = 20_000

/**
 * Group-chat rendering: the CRM never dumps a record into a group. Sensitive fields are
 * replaced with a marker, and the caller keeps the original for the private view.
 */
export function redactForGroup(text: string, allow: Array<'email' | 'phone' | 'amount'> = []): string {
  // Normalise before matching. A value written with full-width punctuation (`ｏｐｓ＠…`) or
  // split by a newline (`ops@acme.\ntest`) is the same string to a human reader, and both
  // shapes walked straight through the patterns. NFKC folds the width, and collapsing
  // whitespace rejoins a token that was broken across lines. The returned text is the
  // normalised one: a redactor that preserves formatting is a redactor you can bypass.
  let output = (text ?? '').normalize('NFKC').replace(/\s+/g, ' ')
  if (output.length > MAX_GROUP_RENDER_LENGTH) {
    return '〔消息过长，群聊不渲染，请到私聊查看〕'
  }
  for (const rule of SENSITIVE_PATTERNS) {
    if (allow.includes(rule.name as 'email' | 'phone' | 'amount')) continue
    if (rule.requires && !output.includes(rule.requires)) continue
    output = output.replace(rule.pattern, `〔${rule.name} 已隐藏〕`)
  }
  return output
}
