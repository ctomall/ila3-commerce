/**
 * Outbound gate and send-state machine (M6), as pure functions.
 *
 * The rule the contract states: a message may only leave after an approval that is
 * bound to the exact draft hash, and any change to recipient, body or attachments
 * invalidates that approval. This module makes that check executable and testable
 * before any provider is wired in.
 *
 * Nothing here sends anything; it decides whether sending is allowed and how a state
 * transition is recorded. Unknown provider state never becomes "retry".
 */

export type DraftState = 'editing' | 'ready' | 'approved' | 'sent' | 'superseded' | 'blocked'

export type Draft = {
  id: string
  bodyHash: string
  recipientEmail: string | null
  channel: string
  state: DraftState
}

export type Approval = {
  id: string
  draftId: string
  draftHash: string
  decision: 'approved' | 'rejected'
  expiresAt: string
  revokedAt?: string | null
}

export type SendGateInput = {
  draft: Draft
  approval: Approval | null
  suppressed?: boolean
  /** Present when this (draft, approval, recipient, channel) already produced a send. */
  existingSendId?: string | null
  now: string
}

export type SendDecision =
  | { allowed: true; sendKey: string; reasons: [] }
  | { allowed: false; reasons: string[] }

/** One key across approve -> enqueue -> provider, so a retry cannot double-send. */
export function sendKey(input: {
  draftId: string
  draftHash: string
  approvalId: string
  recipientHash: string
  channel: string
}): string {
  return [
    'send',
    input.draftId,
    input.draftHash,
    input.approvalId,
    input.recipientHash,
    input.channel,
  ].join(':')
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const value = String(email).trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null
}

/** Cheap stable hash for key composition in this layer (the DB stores sha256). */
function localHash(value: string): string {
  let h = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function recipientHash(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email)
  return normalized ? localHash(normalized) : null
}

/**
 * All-or-nothing gate. Every reason is returned so the UI can explain what to fix
 * instead of showing a bare "cannot send".
 */
export function canSend(input: SendGateInput): SendDecision {
  const reasons: string[] = []
  const { draft, approval, now } = input

  if (draft.state === 'superseded') reasons.push('草稿已失效：正文改过，需要重新审批')
  if (draft.state === 'blocked') reasons.push('草稿被阻止（收件人或内容命中抑制规则）')
  if (draft.state === 'sent') reasons.push('该草稿已发送，不能重复发送')

  if (!recipientHash(draft.recipientEmail)) reasons.push('没有有效收件人')
  if (input.suppressed) reasons.push('收件人在抑制名单（退订/投诉/退信）')

  if (!approval) {
    reasons.push('没有审批记录：发送前必须先审批')
  } else {
    if (approval.decision !== 'approved') reasons.push('审批结论不是「批准」')
    if (approval.draftId !== draft.id) reasons.push('审批绑定的不是这份草稿')
    if (approval.draftHash !== draft.bodyHash) reasons.push('正文已变化：审批失效，必须重批')
    if (approval.revokedAt) reasons.push('审批已被撤销')
    const expires = Date.parse(approval.expiresAt)
    const current = Date.parse(now)
    if (!Number.isFinite(expires) || !Number.isFinite(current)) reasons.push('时间无法解析，拒绝发送')
    else if (expires <= current) reasons.push('审批已过期')
  }

  if (input.existingSendId) reasons.push(`已存在发送记录 ${input.existingSendId}：幂等拦截，不重发`)

  if (reasons.length > 0) return { allowed: false, reasons }

  const hash = recipientHash(draft.recipientEmail) as string
  return {
    allowed: true,
    sendKey: sendKey({
      draftId: draft.id,
      draftHash: draft.bodyHash,
      approvalId: (approval as Approval).id,
      recipientHash: hash,
      channel: draft.channel,
    }),
    reasons: [],
  }
}

export type SendState =
  | 'queued'
  | 'dispatching'
  | 'accepted'
  | 'delivered'
  | 'replied'
  | 'unknown'
  | 'bounced'
  | 'complained'
  | 'failed'
  | 'suppressed'

const LEGAL_TRANSITIONS: Record<SendState, SendState[]> = {
  queued: ['dispatching', 'failed', 'suppressed'],
  dispatching: ['accepted', 'unknown', 'failed'],
  accepted: ['delivered', 'bounced', 'complained', 'failed', 'unknown'],
  delivered: ['replied', 'complained'],
  replied: [],
  // Unknown is not a resting place: the next step is a lookup, never a resend.
  unknown: ['accepted', 'delivered', 'bounced', 'failed'],
  bounced: [],
  complained: [],
  failed: [],
  suppressed: [],
}

export function canTransition(from: SendState, to: SendState): boolean {
  return (LEGAL_TRANSITIONS[from] ?? []).includes(to)
}

/**
 * What to do when the provider has not confirmed. Deliberately returns "look up",
 * never "send again": a duplicate message to a real contact is worse than a delay.
 */
export function nextActionFor(state: SendState): 'wait' | 'lookup' | 'stop' | 'classify' {
  switch (state) {
    case 'queued':
    case 'dispatching':
      return 'wait'
    case 'unknown':
      return 'lookup'
    case 'delivered':
      return 'classify'
    default:
      return 'stop'
  }
}

export type ReplyClass = 'human_reply' | 'auto_reply' | 'ooo' | 'unsubscribe' | 'negative'

/**
 * Reply classification. A reply is not intent: this returns a label, and the caller
 * must not move the deal stage on the strength of it.
 */
export function classifyReply(input: {
  fromMatchesRecipient: boolean
  autoSubmitted?: boolean
  subject?: string | null
  body?: string | null
}): ReplyClass {
  const text = `${input.subject ?? ''}\n${input.body ?? ''}`.toLowerCase()
  if (/unsubscribe|退订|停止发送|remove me/.test(text)) return 'unsubscribe'
  if (/out of office|automatic reply|自动回复|auto-reply|on leave/.test(text) || input.autoSubmitted) return 'ooo'
  if (/no longer interested|not interested|不考虑|没有兴趣|不要联系/.test(text)) return 'negative'
  if (/undeliverable|delivery status|mailer-daemon/.test(text)) return 'auto_reply'
  return input.fromMatchesRecipient ? 'human_reply' : 'auto_reply'
}

/** Unsubscribe/negative replies must land in the suppression list, not just a label. */
export function suppressionFromReply(reply: ReplyClass): 'unsubscribe' | 'complaint' | null {
  if (reply === 'unsubscribe') return 'unsubscribe'
  if (reply === 'negative') return 'complaint'
  return null
}
