import { describe, expect, it } from '@jest/globals'

import { decideAfterReply, decideCandidateToSend, describeDecision, type PipelineInput } from '../pipeline'
import type { Approval, Draft } from '../outreach'
import type { CandidateInput } from '../verification'

const complete: CandidateInput = {
  companyName: 'Nordwind Energie GmbH',
  domain: 'https://www.nordwind-energie.de/impressum',
  country: 'DE',
  email: 'marta@nordwind-energie.de',
  sourceUrl: 'https://nordwind-energie.de/team',
  evidence: [
    {
      url: 'https://nordwind-energie.de/team',
      fetchedAt: '2026-11-08T10:00:00Z',
      contentHash: 'a'.repeat(64),
      fields: { companyName: 'Nordwind Energie GmbH', email: 'Marta@Nordwind-Energie.de' },
    },
  ],
}

const NOW = '2026-11-08T12:00:00Z'

const draft: Draft = {
  id: 'draft-1',
  bodyHash: 'hash-1',
  recipientEmail: 'marta@nordwind-energie.de',
  channel: 'email',
  state: 'approved',
}

const approval: Approval = {
  id: 'approval-1',
  draftId: 'draft-1',
  draftHash: 'hash-1',
  decision: 'approved',
  expiresAt: '2026-11-09T00:00:00Z',
  revokedAt: null,
}

const buckets = [
  { scope: 'tenant' as const, limit: 10, reserved: 0, consumed: 0 },
  { scope: 'employee' as const, limit: 2, reserved: 0, consumed: 0 },
]

const baseInput = (over: Partial<PipelineInput> = {}): PipelineInput => ({
  candidate: complete,
  buckets,
  draft,
  approval,
  now: NOW,
  ...over,
})

/** The stage names that ran, so a test can assert where the flow stopped. */
const stageNames = (result: ReturnType<typeof decideCandidateToSend>) => result.stages.map((s) => s.name)

describe('decideCandidateToSend — the whole chain', () => {
  it('walks a fully evidenced candidate to a sendable decision with a stable idempotency key', () => {
    const result = decideCandidateToSend(baseInput())
    expect(result.decision.kind).toBe('sendable')
    if (result.decision.kind !== 'sendable') throw new Error('unreachable')
    expect(result.decision.sendKey.startsWith('send:draft-1:hash-1:approval-1:')).toBe(true)
    expect(result.decision.sendKey.endsWith(':email')).toBe(true)
    expect(stageNames(result)).toEqual(['verify', 'reachability', 'quota', 'send'])
  })

  it('never upgrades deliverability, even on the happy path', () => {
    const result = decideCandidateToSend(baseInput({ mxChecked: true }))
    expect(result.deliverability).toBe('unknown')
    expect(result.verification.deliverability).toBe('unknown')
  })

  it('produces the same key for the same decision and a different one when the body changes', () => {
    const a = decideCandidateToSend(baseInput())
    const b = decideCandidateToSend(baseInput())
    const c = decideCandidateToSend(
      baseInput({ draft: { ...draft, bodyHash: 'hash-2' }, approval: { ...approval, draftHash: 'hash-2' } }),
    )
    if (a.decision.kind !== 'sendable' || b.decision.kind !== 'sendable' || c.decision.kind !== 'sendable') {
      throw new Error('expected sendable')
    }
    expect(a.decision.sendKey).toBe(b.decision.sendKey)
    expect(a.decision.sendKey).not.toBe(c.decision.sendKey)
  })
})

describe('decideCandidateToSend — stops at the right stage', () => {
  it('rejects a candidate with no evidence before touching quota', () => {
    const result = decideCandidateToSend(baseInput({ candidate: { ...complete, evidence: [] } }))
    expect(result.decision.kind).toBe('rejected')
    expect(stageNames(result)).toEqual(['verify'])
  })

  it('hands a needs-review candidate to a human and spends no quota', () => {
    const result = decideCandidateToSend(
      baseInput({ candidate: { ...complete, email: 'guessed@nordwind-energie.de' } }),
    )
    expect(result.decision.kind).toBe('awaiting_review')
    expect(stageNames(result)).toEqual(['review'])
    expect(result.stages[0].outcome).toBe('handoff')
  })

  it('continues past needs-review only on an explicit approve', () => {
    const reviewed = baseInput({
      candidate: { ...complete, email: 'guessed@nordwind-energie.de' },
      reviewDecision: 'approve',
    })
    const result = decideCandidateToSend(reviewed)
    expect(result.decision.kind).not.toBe('awaiting_review')
    expect(stageNames(result)[0]).toBe('review')
  })

  it('stops at review when the reviewer rejects', () => {
    const result = decideCandidateToSend(
      baseInput({ candidate: { ...complete, email: 'guessed@nordwind-energie.de' }, reviewDecision: 'reject' }),
    )
    expect(result.decision.kind).toBe('rejected')
    expect(stageNames(result)).toEqual(['review'])
  })

  it('stores a company that cannot be reached instead of dropping it or inventing an address', () => {
    const result = decideCandidateToSend(baseInput({ candidate: { ...complete, email: null } }))
    expect(result.decision.kind).toBe('stored_only')
    expect(stageNames(result)).toEqual(['verify', 'reachability'])
    expect(result.dedupeKey).toBe('d:nordwind-energie.de')
  })

  it('reports which level blocked the quota, using the tightest headroom', () => {
    const result = decideCandidateToSend(
      baseInput({ buckets: [{ scope: 'employee', limit: 1, reserved: 1, consumed: 0 }] }),
    )
    expect(result.decision.kind).toBe('quota_blocked')
    if (result.decision.kind !== 'quota_blocked') throw new Error('unreachable')
    expect(result.decision.available).toBe(0)
    expect(result.decision.why).toContain('employee')
    expect(stageNames(result)).toEqual(['verify', 'reachability', 'quota'])
  })

  it('waits for a human to write the draft rather than generating one', () => {
    const result = decideCandidateToSend(baseInput({ draft: null }))
    expect(result.decision.kind).toBe('awaiting_draft')
    // Quota is already reserved at this point: that cost is deliberate and documented.
    expect(stageNames(result)).toEqual(['verify', 'reachability', 'quota', 'draft'])
  })

  it('does not send an unapproved draft', () => {
    const result = decideCandidateToSend(baseInput({ draft: { ...draft, state: 'editing' } }))
    expect(result.decision.kind).toBe('awaiting_approval')
  })

  it('blocks an expired approval', () => {
    const result = decideCandidateToSend(baseInput({ now: '2026-11-10T00:00:00Z' }))
    expect(result.decision.kind).toBe('blocked')
    if (result.decision.kind !== 'blocked') throw new Error('unreachable')
    expect(result.decision.reasons.join()).toContain('审批已过期')
  })

  it('blocks a retry when a send already exists', () => {
    const result = decideCandidateToSend(baseInput({ existingSendId: 'send-9' }))
    expect(result.decision.kind).toBe('blocked')
    if (result.decision.kind !== 'blocked') throw new Error('unreachable')
    expect(result.decision.reasons.join()).toContain('send-9')
  })

  it('collects every blocking reason in one pass instead of one at a time', () => {
    const result = decideCandidateToSend(
      baseInput({
        approval: { ...approval, decision: 'rejected', revokedAt: NOW, expiresAt: '2026-11-01T00:00:00Z' },
      }),
    )
    expect(result.decision.kind).toBe('blocked')
    if (result.decision.kind !== 'blocked') throw new Error('unreachable')
    expect(result.decision.reasons.length).toBeGreaterThanOrEqual(3)
  })

  it('stops a suppressed recipient at reachability, before the send gate is even asked', () => {
    const result = decideCandidateToSend(baseInput({ suppressed: true }))
    expect(result.decision.kind).toBe('stored_only')
    expect(stageNames(result)).toEqual(['verify', 'reachability'])
  })
})

describe('decideAfterReply', () => {
  it('turns an unsubscribe into a suppression that must be persisted', () => {
    const outcome = decideAfterReply({
      state: 'replied',
      fromMatchesRecipient: true,
      subject: 'Re: Angebot',
      body: 'Please unsubscribe me.',
    })
    expect(outcome.replyClass).toBe('unsubscribe')
    expect(outcome.suppression).toBe('unsubscribe')
    expect(outcome.mustSuppress).toBe(true)
  })

  it('treats a negative answer as a complaint-level suppression', () => {
    const outcome = decideAfterReply({
      state: 'replied',
      fromMatchesRecipient: true,
      body: '我们不考虑，请不要联系',
    })
    expect(outcome.replyClass).toBe('negative')
    expect(outcome.suppression).toBe('complaint')
  })

  it('classifies a normal reply without suppressing anything', () => {
    const outcome = decideAfterReply({ state: 'delivered', fromMatchesRecipient: true, body: 'Bitte senden Sie Details.' })
    expect(outcome.replyClass).toBe('human_reply')
    expect(outcome.mustSuppress).toBe(false)
    expect(outcome.nextAction).toBe('classify')
  })

  it('asks for a lookup, never a resend, when the provider state is unknown', () => {
    const outcome = decideAfterReply({ state: 'unknown', fromMatchesRecipient: false, body: '' })
    expect(outcome.nextAction).toBe('lookup')
  })
})

describe('describeDecision', () => {
  it('always names a reason, never a bare ok', () => {
    const sendable = decideCandidateToSend(baseInput())
    expect(describeDecision(sendable.decision)).toContain('尚未发送')
    const rejected = decideCandidateToSend(baseInput({ candidate: { ...complete, evidence: [] } }))
    expect(describeDecision(rejected.decision)).toContain('拒绝')
    const storedOnly = decideCandidateToSend(baseInput({ candidate: { ...complete, email: null } }))
    expect(describeDecision(storedOnly.decision)).toContain('仅入库')
  })
})
