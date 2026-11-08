/**
 * The candidate -> send decision, composed from the four pure rule modules.
 *
 * Each of `verification`, `quota`, `outreach` and `robots` is unit-tested on its own,
 * but on their own they prove nothing about the flow: order matters (a quota unit must
 * not be spent on a candidate that fails verification), the vocabulary has to line up
 * (a `needs_review` verdict is a human hand-off, not an approval), and the two human
 * gates in this product — 审核入库 and 审批触达 — have to be visible as hand-offs
 * rather than something an agent can paper over.
 *
 * Everything here is pure: no IO, no clock, no provider, no database. `now` is an
 * argument. The result is a trace of stages plus one terminal decision, so a reviewer
 * can see *why* a candidate stopped where it stopped.
 *
 * What this deliberately does NOT do:
 * - it never sends, queues or marks anything sent;
 * - it never turns `deliverability` away from 'unknown' (no provider confirmation has
 *   happened at decision time);
 * - it never advances a deal stage on the strength of a reply label.
 */
import {
  canEmail,
  verifyCandidate,
  type CandidateInput,
  type Verification,
} from './verification'
import { reserve, type Bucket } from './quota'
import {
  canSend,
  classifyReply,
  nextActionFor,
  suppressionFromReply,
  type Approval,
  type Draft,
  type ReplyClass,
  type SendState,
} from './outreach'

export type StageName = 'verify' | 'review' | 'reachability' | 'quota' | 'draft' | 'approval' | 'send'

/** `handoff` means a human owes the next move; it is not a failure and not a pass. */
export type StageOutcome = 'continue' | 'handoff' | 'stop'

export type Stage = {
  name: StageName
  outcome: StageOutcome
  detail: string
}

export type PipelineDecision =
  | { kind: 'rejected'; why: string; reasons: string[] }
  | { kind: 'awaiting_review'; verification: Verification }
  | { kind: 'stored_only'; why: string }
  | { kind: 'quota_blocked'; why: string; available: number }
  | { kind: 'awaiting_draft' }
  | { kind: 'awaiting_approval'; why: string }
  | { kind: 'blocked'; reasons: string[] }
  | { kind: 'sendable'; sendKey: string }

export type PipelineInput = {
  candidate: CandidateInput
  /** True only when MX was actually looked up; a guess must not reach the verifier. */
  mxChecked?: boolean
  suppressed?: boolean
  /** One bucket per level; the effective limit is the smallest headroom across them. */
  buckets: Bucket[]
  draft?: Draft | null
  approval?: Approval | null
  existingSendId?: string | null
  /**
   * A reviewer's explicit call on a `needs_review` candidate. Omitted means nobody has
   * looked yet, which is a hand-off — never an implicit approve.
   */
  reviewDecision?: 'approve' | 'reject' | null
  now: string
}

export type PipelineResult = {
  stages: Stage[]
  decision: PipelineDecision
  dedupeKey: string | null
  deliverability: 'unknown'
  verification: Verification
}

export function decideCandidateToSend(input: PipelineInput): PipelineResult {
  const stages: Stage[] = []
  const verification = verifyCandidate(input.candidate, { mxChecked: input.mxChecked })
  const stopAt = (stage: Stage, decision: PipelineDecision): PipelineResult => {
    stages.push(stage)
    return { stages, decision, dedupeKey: verification.dedupeKey, deliverability: 'unknown', verification }
  }

  // 1. Deterministic verification. A fail never spends quota or asks for a draft.
  if (verification.verdict === 'fail') {
    return stopAt(
      { name: 'verify', outcome: 'stop', detail: `验证不通过：${verification.reasons.join('；') || '无理由'}` },
      { kind: 'rejected', why: '验证不通过', reasons: verification.reasons },
    )
  }

  // 2. needs_review is a human gate. Only an explicit approve moves past it.
  if (verification.verdict === 'needs_review') {
    if (input.reviewDecision === 'reject') {
      return stopAt(
        { name: 'review', outcome: 'stop', detail: '复核人已驳回' },
        { kind: 'rejected', why: '复核驳回', reasons: verification.reasons },
      )
    }
    if (input.reviewDecision !== 'approve') {
      return stopAt(
        {
          name: 'review',
          outcome: 'handoff',
          detail: `待人工复核：${verification.reasons.join('；') || '存在弱信号'}`,
        },
        { kind: 'awaiting_review', verification },
      )
    }
    stages.push({ name: 'review', outcome: 'continue', detail: '复核人已批准入库' })
  } else {
    stages.push({ name: 'verify', outcome: 'continue', detail: '验证通过' })
  }

  // 3. Reachability is separate from "the company is real": store-only is a valid end.
  const reach = canEmail({ email: input.candidate.email, suppressed: input.suppressed })
  if (!reach.reachable) {
    return stopAt(
      { name: 'reachability', outcome: 'stop', detail: `可入库但不可触达：${reach.reason}` },
      { kind: 'stored_only', why: reach.reason },
    )
  }
  stages.push({ name: 'reachability', outcome: 'continue', detail: reach.reason })

  // 4. Quota is reserved before any draft work, so a blocked candidate costs nothing.
  const reservation = reserve(input.buckets, 1)
  if (!reservation.ok) {
    return stopAt(
      { name: 'quota', outcome: 'stop', detail: reservation.reason },
      { kind: 'quota_blocked', why: reservation.reason, available: reservation.available },
    )
  }
  stages.push({ name: 'quota', outcome: 'continue', detail: `已预留 1 单位，各层剩余最小 ${reservation.remainingAfter}` })

  // 5. A draft is a human artefact; the pipeline waits rather than generating one.
  const draft = input.draft ?? null
  if (!draft) {
    return stopAt({ name: 'draft', outcome: 'handoff', detail: '等待草稿（正文由人写，不由流程猜）' }, { kind: 'awaiting_draft' })
  }
  if (draft.state === 'editing' || draft.state === 'ready') {
    return stopAt(
      { name: 'draft', outcome: 'handoff', detail: `草稿状态 ${draft.state}，需要审批后才可发送` },
      { kind: 'awaiting_approval', why: `草稿状态 ${draft.state}` },
    )
  }

  // 6. Approval + send gate: canSend reports every reason at once, so one call decides.
  const decision = canSend({
    draft,
    approval: input.approval ?? null,
    suppressed: input.suppressed,
    existingSendId: input.existingSendId ?? null,
    now: input.now,
  })
  if (!decision.allowed) {
    return stopAt(
      { name: 'approval', outcome: 'stop', detail: decision.reasons.join('；') },
      { kind: 'blocked', reasons: decision.reasons },
    )
  }
  return stopAt(
    { name: 'send', outcome: 'continue', detail: `可发送，幂等键已确定（${draft.channel}）` },
    { kind: 'sendable', sendKey: decision.sendKey },
  )
}

export type ReplyOutcome = {
  replyClass: ReplyClass
  nextAction: ReturnType<typeof nextActionFor>
  suppression: ReturnType<typeof suppressionFromReply>
  /** Set when the reply means "never contact again"; the caller must persist it. */
  mustSuppress: boolean
}

/**
 * What a reply means for the flow. Deliberately narrow: a label, the next action for
 * the send state, and whether suppression must be persisted. It does not move a deal.
 */
export function decideAfterReply(input: {
  state: SendState
  fromMatchesRecipient: boolean
  autoSubmitted?: boolean
  subject?: string | null
  body?: string | null
}): ReplyOutcome {
  const replyClass = classifyReply({
    fromMatchesRecipient: input.fromMatchesRecipient,
    autoSubmitted: input.autoSubmitted,
    subject: input.subject,
    body: input.body,
  })
  const suppression = suppressionFromReply(replyClass)
  return {
    replyClass,
    nextAction: nextActionFor(input.state),
    suppression,
    mustSuppress: suppression !== null,
  }
}

/** One line for the UI/log: the terminal decision with its reason, never just "ok". */
export function describeDecision(decision: PipelineDecision): string {
  switch (decision.kind) {
    case 'rejected':
      return `拒绝：${decision.why}`
    case 'awaiting_review':
      return `待人审：${decision.verification.reasons.join('；') || '弱信号'}`
    case 'stored_only':
      return `仅入库：${decision.why}`
    case 'quota_blocked':
      return `额度阻塞：${decision.why}`
    case 'awaiting_draft':
      return '等待草稿'
    case 'awaiting_approval':
      return `等待审批：${decision.why}`
    case 'blocked':
      return `发送被拦：${decision.reasons.join('；')}`
    case 'sendable':
      return '可发送（幂等键已确定，尚未发送）'
  }
}
