/**
 * Bot ingress pipeline (M7) — the four gates of 08-bot.md §2 as one ordered decision.
 *
 * The individual rules live in `guard.ts`; this module fixes the order, because the order
 * is the security property. Two ways it used to be possible to get this wrong by hand:
 *
 *   1. Recording the nonce before verifying the signature. Then anyone can burn a nonce
 *      (and grow the ledger) with an unsigned request, and a legitimate bot message that
 *      happens to reuse the nonce is later refused as a replay.
 *   2. Checking replay only after the binding, so a revoked binding hides a replay and an
 *      attacker learns which identities are revoked.
 *
 * This file has no I/O: the caller supplies the clock, the seen-nonce window and a
 * `rememberNonce` hook, so a test can assert *when* the hook was called and not just
 * whether the message was accepted.
 */
import {
  canAct,
  isReplay,
  redactForGroup,
  verifySignature,
  type BotBinding,
  type SignedEvent,
} from './guard'

export type InboundAction = 'read' | 'write' | 'approve' | 'send'

export type InboundEvent = SignedEvent & {
  chat: 'dm' | 'group'
  action: InboundAction
}

export type RejectReason =
  | 'missing_fields'
  | 'bad_signature'
  | 'stale_timestamp'
  | 'replay'
  | 'identity_unbound'
  | 'binding_revoked'
  | 'employee_inactive'
  | 'group_unsafe_action'

export type InboundContext = {
  secret: string
  now: Date
  /** Null when the external identity maps to no binding at all. */
  binding: BotBinding | null
  employeeActive: boolean
  seenNonces: readonly string[]
  /** Called exactly once, and only after signature + freshness both pass. */
  rememberNonce: (nonce: string) => void
  /** Text the bot resolved from CRM data; redacted when the chat is a group. */
  text: string
  allowInGroup?: Array<'email' | 'phone' | 'amount'>
}

export type InboundAudit = {
  at: string
  nonce: string
  chat: 'dm' | 'group'
  action: InboundAction
  bindingId: string | null
  employeeUserId: string | null
  outcome: 'allowed' | 'refused'
  reason: RejectReason | null
}

export type InboundResult =
  | { allowed: true; text: string; audit: InboundAudit }
  | { allowed: false; reason: RejectReason; audit: InboundAudit }

export function handleInbound(event: InboundEvent, context: InboundContext): InboundResult {
  const audit = (outcome: InboundAudit['outcome'], reason: RejectReason | null): InboundAudit => ({
    at: context.now.toISOString(),
    nonce: event?.nonce ?? '',
    chat: event?.chat ?? 'dm',
    action: event?.action ?? 'read',
    bindingId: context.binding?.id ?? null,
    employeeUserId: context.binding?.employeeUserId ?? null,
    outcome,
    reason,
  })
  const refuse = (reason: RejectReason): InboundResult => ({ allowed: false, reason, audit: audit('refused', reason) })

  // Gate 1+2: signature and freshness. `verifySignature` checks both — the timestamp is
  // part of the signed payload, so a stale-but-valid event is refused here.
  const verified = verifySignature(event, context.secret, context.now)
  if (!verified.ok) return refuse(verified.reason)

  // Gate 3: replay. Recording happens here, after authentication and before the rest of
  // the decision, so an authenticated event consumes its nonce even when a later gate
  // refuses it — but an unsigned or stale request never touches the ledger.
  if (isReplay(event.nonce, context.seenNonces)) return refuse('replay')
  context.rememberNonce(event.nonce)

  // Gate 4: identity. No binding means the external identity is not linked to an employee.
  if (!context.binding) return refuse('identity_unbound')
  const act = canAct({
    binding: context.binding,
    employeeActive: context.employeeActive,
    isGroup: event.chat === 'group',
    action: event.action,
  })
  if (!act.allowed) return refuse(act.reason)

  // Only a group read reaches this point with text leaving the CRM; redact there.
  const text = event.chat === 'group' ? redactForGroup(context.text, context.allowInGroup ?? []) : context.text
  return { allowed: true, text, audit: audit('allowed', null) }
}
