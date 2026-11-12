/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals'
import {
  bodyHashOf,
  createOutreachService,
  type ApprovalRow,
  type DraftRow,
  type OutreachRepository,
} from '../services/outreach-service'

const NOW = '2026-11-12T10:00:00.000Z'

function makeRepo(candidateStatus = 'approved') {
  const state = { drafts: [] as DraftRow[], approvals: [] as ApprovalRow[] }
  let seq = 0
  const repo: OutreachRepository = {
    getCandidateScope: jest.fn(async () => ({ id: 'cand-1', status: candidateStatus })),
    findDraftByCandidateAndHash: jest.fn(async (input: { candidateId: string; bodyHash: string }) =>
      state.drafts.find((d) => d.candidateId === input.candidateId && d.bodyHash === input.bodyHash) ?? null),
    insertDraft: jest.fn(async (input: Omit<DraftRow, 'createdAt' | 'updatedAt'> & { now: string }) => {
      const row: DraftRow = { ...input, createdAt: input.now, updatedAt: input.now }
      state.drafts.push(row)
      return row
    }),
    getDraft: jest.fn(async (input: { id: string }) => state.drafts.find((d) => d.id === input.id) ?? null),
    markDraftApproved: jest.fn(async (input: { id: string }) => {
      const draft = state.drafts.find((d) => d.id === input.id)
      if (!draft || !['ready', 'editing'].includes(draft.status)) return false
      draft.status = 'approved'
      return true
    }),
    findApprovalByKey: jest.fn(async (input: { idempotencyKey: string }) =>
      state.approvals.find((a) => a.idempotencyKey === input.idempotencyKey) ?? null),
    insertApproval: jest.fn(async (input: Omit<ApprovalRow, 'createdAt'> & { now: string; id: string }) => {
      const row: ApprovalRow = { ...input, createdAt: input.now }
      state.approvals.push(row)
      return row
    }),
  }
  const service = createOutreachService({ repo, now: () => NOW, newId: () => `id-${++seq}`, approvalTtlMs: 3600_000 })
  return { repo, state, service }
}

const baseDraft = {
  tenantId: 't', organizationId: 'o', candidateId: 'cand-1',
  recipientEmail: 'li.wei@acme.example', subject: 'Hello', bodyMarkdown: 'Body text',
}

describe('outreach draft/approval', () => {
  it('creates the same draft once for the same candidate and body', async () => {
    const { service, state } = makeRepo()
    const first = await service.createDraft(baseDraft)
    const second = await service.createDraft(baseDraft)
    expect(first.ok && first.value.created).toBe(true)
    expect(second.ok && second.value.created).toBe(false)
    expect(state.drafts).toHaveLength(1)
  })

  it('refuses a draft for a candidate that is not approved', async () => {
    const { service } = makeRepo('submitted')
    await expect(service.createDraft(baseDraft)).resolves.toMatchObject({ ok: false, code: 'not_approved_candidate' })
  })

  it('binds the approval to the exact body hash', async () => {
    const { service } = makeRepo()
    const draftResult = await service.createDraft(baseDraft)
    if (!draftResult.ok) throw new Error('draft failed')
    const draft = draftResult.value.draft
    const wrongHash = bodyHashOf(draft.subject, `${draft.bodyMarkdown} (edited after review)`)
    await expect(
      service.approveDraft({
        tenantId: 't', organizationId: 'o', draftId: draft.id, draftHash: wrongHash,
        approverUserId: 'u1', idempotencyKey: 'approve:1', decision: 'approved',
      }),
    ).resolves.toMatchObject({ ok: false, code: 'body_hash_mismatch' })
    const good = await service.approveDraft({
      tenantId: 't', organizationId: 'o', draftId: draft.id, draftHash: draft.bodyHash,
      approverUserId: 'u1', idempotencyKey: 'approve:2', decision: 'approved',
    })
    expect(good.ok).toBe(true)
  })

  it('refuses even the replay of an approval after the draft was dispatched', async () => {
    const { service, state } = makeRepo()
    const created = await service.createDraft(baseDraft)
    if (!created.ok) throw new Error('draft failed')
    const input = {
      tenantId: 't', organizationId: 'o', draftId: created.value.draft.id, draftHash: created.value.draft.bodyHash,
      approverUserId: 'u1', idempotencyKey: 'approve:consumed', decision: 'approved' as const,
    }
    const first = await service.approveDraft(input)
    expect(first.ok).toBe(true)
    const draft = state.drafts.find((row) => row.id === created.value.draft.id)
    if (!draft) throw new Error('draft vanished')
    draft.status = 'sent'
    await expect(service.approveDraft(input)).resolves.toMatchObject({ ok: false, code: 'already_sent' })
    // A different approver is refused for the same reason, not given a fresh token.
    await expect(
      service.approveDraft({ ...input, approverUserId: 'u2', idempotencyKey: 'approve:consumed:u2' }),
    ).resolves.toMatchObject({ ok: false, code: 'already_sent' })
    expect(state.approvals).toHaveLength(1)
  })

  it('replays the same approval key instead of approving twice', async () => {
    const { service, state } = makeRepo()
    const created = await service.createDraft(baseDraft)
    if (!created.ok) throw new Error('draft failed')
    const input = {
      tenantId: 't', organizationId: 'o', draftId: created.value.draft.id, draftHash: created.value.draft.bodyHash,
      approverUserId: 'u1', idempotencyKey: 'approve:same', decision: 'approved' as const,
    }
    const first = await service.approveDraft(input)
    const second = await service.approveDraft(input)
    expect(first.ok && first.value.replayed).toBe(false)
    expect(second.ok && second.value.replayed).toBe(true)
    expect(state.approvals).toHaveLength(1)
  })
})
