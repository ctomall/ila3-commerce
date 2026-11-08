import { describe, expect, it } from '@jest/globals'
import {
  canSend,
  canTransition,
  classifyReply,
  nextActionFor,
  recipientHash,
  sendKey,
  suppressionFromReply,
  type Approval,
  type Draft,
} from '../outreach'

const NOW = '2026-11-08T10:00:00Z'

const draft: Draft = {
  id: 'draft-1',
  bodyHash: 'hash-a',
  recipientEmail: 'marta@nordwind-energie.de',
  channel: 'email',
  state: 'approved',
}

const approval: Approval = {
  id: 'appr-1',
  draftId: 'draft-1',
  draftHash: 'hash-a',
  decision: 'approved',
  expiresAt: '2026-11-08T12:00:00Z',
}

describe('canSend', () => {
  it('allows a draft with a matching, unexpired approval', () => {
    const decision = canSend({ draft, approval, now: NOW })
    expect(decision.allowed).toBe(true)
    if (decision.allowed) expect(decision.sendKey).toBe(sendKey({
      draftId: 'draft-1', draftHash: 'hash-a', approvalId: 'appr-1',
      recipientHash: recipientHash(draft.recipientEmail) as string, channel: 'email',
    }))
  })

  it('refuses without an approval', () => {
    const decision = canSend({ draft, approval: null, now: NOW })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.reasons.join()).toContain('没有审批记录')
  })

  it('invalidates the approval when the body changed', () => {
    const decision = canSend({ draft: { ...draft, bodyHash: 'hash-b' }, approval, now: NOW })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.reasons.join()).toContain('正文已变化')
  })

  it('refuses an expired approval', () => {
    const decision = canSend({ draft, approval, now: '2026-11-08T12:00:01Z' })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.reasons.join()).toContain('已过期')
  })

  it('refuses a revoked approval', () => {
    const decision = canSend({ draft, approval: { ...approval, revokedAt: NOW }, now: NOW })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.reasons.join()).toContain('撤销')
  })

  it('refuses a rejected approval or an approval bound to another draft', () => {
    const rejected = canSend({ draft, approval: { ...approval, decision: 'rejected' }, now: NOW })
    expect(rejected.allowed).toBe(false)
    const otherDraft = canSend({ draft, approval: { ...approval, draftId: 'draft-2' }, now: NOW })
    expect(otherDraft.allowed).toBe(false)
  })

  it('refuses a suppressed recipient even with a valid approval', () => {
    const decision = canSend({ draft, approval, suppressed: true, now: NOW })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.reasons.join()).toContain('抑制')
  })

  it('is idempotent: an existing send blocks a second one', () => {
    const decision = canSend({ draft, approval, existingSendId: 'send-9', now: NOW })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.reasons.join()).toContain('幂等拦截')
  })

  it('refuses an address-less draft and a superseded draft', () => {
    expect(canSend({ draft: { ...draft, recipientEmail: null }, approval, now: NOW }).allowed).toBe(false)
    expect(canSend({ draft: { ...draft, state: 'superseded' }, approval, now: NOW }).allowed).toBe(false)
  })
})

describe('send state machine', () => {
  it('allows only the declared transitions', () => {
    expect(canTransition('queued', 'dispatching')).toBe(true)
    expect(canTransition('queued', 'delivered')).toBe(false)
    expect(canTransition('accepted', 'delivered')).toBe(true)
    expect(canTransition('delivered', 'replied')).toBe(true)
    expect(canTransition('bounced', 'accepted')).toBe(false)
  })

  it('never retries on unknown: it looks up first', () => {
    expect(nextActionFor('unknown')).toBe('lookup')
    expect(nextActionFor('queued')).toBe('wait')
    expect(nextActionFor('delivered')).toBe('classify')
    expect(nextActionFor('bounced')).toBe('stop')
  })
})

describe('reply classification', () => {
  it('separates human reply from machine replies', () => {
    expect(classifyReply({ fromMatchesRecipient: true, subject: 'Re: cooperation' })).toBe('human_reply')
    expect(classifyReply({ fromMatchesRecipient: true, autoSubmitted: true })).toBe('ooo')
    expect(classifyReply({ fromMatchesRecipient: true, body: 'Out of office until Monday' })).toBe('ooo')
  })

  it('detects unsubscribe and negative replies, which must also suppress', () => {
    const unsub = classifyReply({ fromMatchesRecipient: true, body: 'please unsubscribe me' })
    expect(unsub).toBe('unsubscribe')
    expect(suppressionFromReply(unsub)).toBe('unsubscribe')

    const negative = classifyReply({ fromMatchesRecipient: true, body: 'not interested, remove us' })
    expect(['negative', 'unsubscribe']).toContain(negative)

    expect(classifyReply({ fromMatchesRecipient: true, subject: 'hello' })).toBe('human_reply')
    expect(suppressionFromReply('human_reply')).toBeNull()
  })
})
