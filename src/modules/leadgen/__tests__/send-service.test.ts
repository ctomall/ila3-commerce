/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals'
import type { ApprovalRow, DraftRow } from '../services/outreach-service'
import {
  createSendService,
  sendIdempotencyKey,
  type OutboundTransport,
  type SendRepository,
  type SendRow,
} from '../services/send-service'

const NOW = '2026-11-12T10:00:00.000Z'
const TENANT = 'tenant-1'
const ORG = 'org-1'

function draft(overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    id: 'draft-1',
    tenantId: TENANT,
    organizationId: ORG,
    candidateId: 'cand-1',
    recipientEmail: 'qa@example.com',
    recipientHash: 'recipient-hash',
    channel: 'email',
    subject: 'Hello',
    bodyMarkdown: 'Body',
    bodyHash: 'hash-1',
    status: 'approved',
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function approval(overrides: Partial<ApprovalRow> = {}): ApprovalRow {
  return {
    id: 'approval-1',
    tenantId: TENANT,
    organizationId: ORG,
    draftId: 'draft-1',
    draftHash: 'hash-1',
    decision: 'approved',
    approverUserId: 'user-1',
    idempotencyKey: 'approve:draft-1:hash-1:user-1',
    expiresAt: '2026-11-13T10:00:00.000Z',
    revokedAt: null,
    createdAt: NOW,
    ...overrides,
  }
}

function makeRepo(seed: { drafts?: DraftRow[]; approvals?: ApprovalRow[]; sends?: SendRow[] } = {}) {
  const state = {
    drafts: seed.drafts ?? [draft()],
    approvals: seed.approvals ?? [approval()],
    sends: seed.sends ?? ([] as SendRow[]),
  }
  const visible = (row: { tenantId: string; organizationId: string }) =>
    row.tenantId === TENANT && row.organizationId === ORG
  const repo: SendRepository = {
    getDraft: jest.fn(async (input: { tenantId: string; organizationId: string; id: string }) =>
      state.drafts.find((row) => visible(row) && row.id === input.id) ?? null),
    getApproval: jest.fn(async (input: { tenantId: string; organizationId: string; id: string }) =>
      state.approvals.find((row) => visible(row) && row.id === input.id) ?? null),
    claimDraftForSend: jest.fn(async (input: { id: string; now: string }) => {
      const row = state.drafts.find((item) => item.id === input.id)
      if (!row || row.status !== 'approved') return false
      row.status = 'sent'
      row.updatedAt = input.now
      return true
    }),
    releaseDraftClaim: jest.fn(async (input: { id: string; now: string }) => {
      const row = state.drafts.find((item) => item.id === input.id)
      if (!row || row.status !== 'sent') return false
      row.status = 'approved'
      row.updatedAt = input.now
      return true
    }),
    findSendByKey: jest.fn(async (input: { idempotencyKey: string }) =>
      state.sends.find((row) => visible(row) && row.idempotencyKey === input.idempotencyKey) ?? null),
    insertSend: jest.fn(async (input: Parameters<SendRepository['insertSend']>[0]) => {
      const row: SendRow = {
        id: input.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        draftId: input.draftId,
        approvalId: input.approvalId,
        draftHash: input.draftHash,
        idempotencyKey: input.idempotencyKey,
        providerKey: input.providerKey,
        channel: input.channel,
        providerMessageId: null,
        state: input.state,
        attempt: input.attempt,
        leaseExpiresAt: input.leaseExpiresAt,
        enqueuedAt: input.now,
        sentAt: null,
        errorCode: null,
        updatedAt: input.now,
      }
      state.sends.push(row)
      return row
    }),
    markSendDispatching: jest.fn(async (input: { id: string; attempt: number; leaseExpiresAt: string; now: string }) => {
      const row = state.sends.find((item) => item.id === input.id)
      if (!row) return false
      row.state = 'dispatching'
      row.attempt = input.attempt
      row.leaseExpiresAt = input.leaseExpiresAt
      row.updatedAt = input.now
      return true
    }),
    markSendSettled: jest.fn(async (input: { id: string; state: 'simulated' | 'accepted'; providerMessageId: string | null; sentAt: string; now: string }) => {
      const row = state.sends.find((item) => item.id === input.id)
      if (!row) return
      row.state = input.state
      row.providerMessageId = input.providerMessageId
      row.sentAt = input.sentAt
      row.leaseExpiresAt = null
      row.updatedAt = input.now
    }),
    markSendFailed: jest.fn(async (input: { id: string; errorCode: string; now: string }) => {
      const row = state.sends.find((item) => item.id === input.id)
      if (!row) return
      row.state = 'failed'
      row.errorCode = input.errorCode
      row.leaseExpiresAt = null
      row.updatedAt = input.now
    }),
  }
  return { repo, state }
}

function transport(overrides: Partial<OutboundTransport> = {}): OutboundTransport {
  return {
    key: 'simulated',
    externalEffect: false,
    deliver: jest.fn(async () => ({ providerMessageId: null })),
    ...overrides,
  }
}

function service(repo: SendRepository, outbound = transport()) {
  // The service only needs a unique id per insert.
  let idSeq = 0
  return {
    send: createSendService({ repo, transport: outbound, now: () => NOW, newId: () => `send-${++idSeq}` }),
    outbound,
  }
}

const target = { tenantId: TENANT, organizationId: ORG, draftId: 'draft-1', approvalId: 'approval-1' }

describe('leadgen dispatch boundary (simulated transport)', () => {
  it('dispatching an approved draft records one simulated send and claims the draft', async () => {
    const { repo, state } = makeRepo()
    const { send, outbound } = service(repo)

    const result = await send.dispatch(target)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.replayed).toBe(false)
    expect(result.send.state).toBe('simulated')
    expect(result.send.providerMessageId).toBeNull()
    expect(result.send.attempt).toBe(1)
    expect(result.transport).toEqual({ key: 'simulated', externalEffect: false })
    expect(outbound.externalEffect).toBe(false)
    expect(state.drafts[0].status).toBe('sent')
    expect(state.sends).toHaveLength(1)
    expect(state.sends[0].idempotencyKey).toBe(
      sendIdempotencyKey({ draftId: 'draft-1', draftHash: 'hash-1', approvalId: 'approval-1' }),
    )
  })

  it('a retry of the same approval replays the same send row instead of dispatching twice', async () => {
    const { repo, state } = makeRepo()
    const { send, outbound } = service(repo)

    const first = await send.dispatch(target)
    const second = await send.dispatch(target)

    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(second.replayed).toBe(true)
    expect(second.send.id).toBe(first.send.id)
    expect(state.sends).toHaveLength(1)
    expect(outbound.deliver).toHaveBeenCalledTimes(1)
  })

  it('derives the idempotency key on the server, so the approval cannot be pointed at another body', async () => {
    expect(sendIdempotencyKey({ draftId: 'd', draftHash: 'h', approvalId: 'a' })).toBe('send:d:h:a')
  })

  it('refuses an approval that belongs to a different draft', async () => {
    const { repo } = makeRepo({ approvals: [approval({ draftId: 'draft-other' })] })
    const { send } = service(repo)

    await expect(send.dispatch(target)).resolves.toEqual({ ok: false, code: 'approval_not_found' })
  })

  it('refuses a rejected approval', async () => {
    const { repo } = makeRepo({ approvals: [approval({ decision: 'rejected' })] })
    const { send } = service(repo)

    await expect(send.dispatch(target)).resolves.toEqual({ ok: false, code: 'approval_not_approved' })
  })

  it('refuses an expired approval', async () => {
    const { repo } = makeRepo({ approvals: [approval({ expiresAt: '2026-11-12T09:59:59.000Z' })] })
    const { send } = service(repo)

    await expect(send.dispatch(target)).resolves.toEqual({ ok: false, code: 'approval_expired' })
  })

  it('refuses a revoked approval', async () => {
    const { repo } = makeRepo({ approvals: [approval({ revokedAt: '2026-11-12T09:30:00.000Z' })] })
    const { send } = service(repo)

    await expect(send.dispatch(target)).resolves.toEqual({ ok: false, code: 'approval_revoked' })
  })

  it('refuses a body edited after the approval', async () => {
    const { repo } = makeRepo({ drafts: [draft({ bodyHash: 'hash-edited' })] })
    const { send } = service(repo)

    await expect(send.dispatch(target)).resolves.toEqual({ ok: false, code: 'body_hash_mismatch' })
  })

  it('refuses a draft that was never approved', async () => {
    const { repo } = makeRepo({ drafts: [draft({ status: 'ready' })] })
    const { send } = service(repo)

    await expect(send.dispatch(target)).resolves.toEqual({ ok: false, code: 'draft_not_approved' })
  })

  it('refuses a second dispatch of a draft whose approval is already consumed', async () => {
    const { repo, state } = makeRepo()
    const { send } = service(repo)

    const first = await send.dispatch(target)
    expect(first.ok).toBe(true)
    // A second, different approval minted for the same body after dispatch.
    state.approvals.push(approval({ id: 'approval-2', idempotencyKey: 'approve:2' }))

    await expect(send.dispatch({ ...target, approvalId: 'approval-2' })).resolves.toEqual({
      ok: false,
      code: 'already_sent',
    })
    expect(state.sends).toHaveLength(1)
  })

  it('refuses while another dispatch holds a live lease', async () => {
    const dispatching: SendRow = {
      id: 'send-live',
      tenantId: TENANT,
      organizationId: ORG,
      draftId: 'draft-1',
      approvalId: 'approval-1',
      draftHash: 'hash-1',
      idempotencyKey: sendIdempotencyKey({ draftId: 'draft-1', draftHash: 'hash-1', approvalId: 'approval-1' }),
      providerKey: 'simulated',
      channel: 'email',
      providerMessageId: null,
      state: 'dispatching',
      attempt: 1,
      leaseExpiresAt: '2026-11-12T10:00:30.000Z',
      enqueuedAt: NOW,
      sentAt: null,
      errorCode: null,
      updatedAt: NOW,
    }
    const { repo } = makeRepo({ sends: [dispatching] })
    const { send } = service(repo)

    await expect(send.dispatch(target)).resolves.toEqual({ ok: false, code: 'send_in_progress' })
  })

  it('a transport failure releases the claim so the approval is not burned', async () => {
    const { repo, state } = makeRepo()
    const failing = transport({
      deliver: jest.fn(async () => {
        throw new Error('provider down')
      }),
    })
    const { send } = service(repo, failing)

    const failed = await send.dispatch(target)
    expect(failed).toEqual({ ok: false, code: 'transport_failed' })
    expect(state.sends[0].state).toBe('failed')
    expect(state.drafts[0].status).toBe('approved')

    const retry = createSendService({ repo, transport: transport(), now: () => NOW, newId: () => 'send-retry' })
    const retried = await retry.dispatch(target)
    expect(retried.ok).toBe(true)
    if (!retried.ok) return
    expect(retried.send.attempt).toBe(2)
    expect(state.sends).toHaveLength(1)
    expect(state.drafts[0].status).toBe('sent')
  })

  it('does not see a draft from another scope', async () => {
    const { repo } = makeRepo({ drafts: [draft({ organizationId: 'org-other' })] })
    const { send } = service(repo)

    await expect(send.dispatch(target)).resolves.toEqual({ ok: false, code: 'draft_not_found' })
  })
})
