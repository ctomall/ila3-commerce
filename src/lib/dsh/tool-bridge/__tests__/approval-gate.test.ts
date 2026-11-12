/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals'
import { runWriteGate } from '../approval-gate'
import type { ApprovalStore } from '@/modules/dsh_approvals/services/orm-repository'
import type { WriteApproval } from '@/modules/dsh_approvals/services/approval-store'

const NOW = '2026-11-12T00:00:00.000Z'
const LATER = '2026-11-12T00:05:00.000Z'

function approval(overrides: Partial<WriteApproval> = {}): WriteApproval {
  return {
    id: 'approval-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    userId: 'user-1',
    bindingId: 'binding-1',
    runId: 'run-1',
    tool: 'crm.update_company',
    argsHash: 'hash-1',
    argsPreview: { companyId: 'c-1' },
    status: 'pending',
    requestedAt: NOW,
    expiresAt: LATER,
    decidedAt: null,
    decidedBy: null,
    consumedAt: null,
    ...overrides,
  }
}

function store(initial: WriteApproval | null, consumeResult = true) {
  const createPending = jest.fn(async (input: Parameters<ApprovalStore['createPending']>[0]) => ({
    ...approval({ id: 'approval-new', argsPreview: input.argsPreview }),
  }))
  const claim = jest.fn(async (_input: { id: string; now: string }) => consumeResult)
  const settle = jest.fn(async (_input: { id: string; status: 'consumed' | 'approved'; now: string }) => true)
  const value: ApprovalStore = {
    loadForGate: jest.fn(async () => initial),
    createPending,
    claim,
    settle,
    decide: jest.fn() as unknown as ApprovalStore['decide'],
    listPending: jest.fn() as unknown as ApprovalStore['listPending'],
  }
  return { value, createPending, claim, settle }
}

const base = {
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  userId: 'user-1',
  bindingId: 'binding-1',
  runId: 'run-1',
  tool: 'crm.update_company',
  args: { id: 'c-1', fields: { industry: 'Software' } },
  preview: { companyId: 'c-1' },
  now: NOW,
}

describe('runWriteGate', () => {
  it('opens a request when there is no approval yet', async () => {
    const s = store(null)
    await expect(runWriteGate({ ...base, store: s.value })).resolves.toMatchObject({
      action: 'approval_required',
      approvalId: 'approval-new',
      summary: { companyId: 'c-1' },
    })
    expect(s.createPending).toHaveBeenCalledTimes(1)
    // Fingerprint is over canonical arguments, not object identity.
    expect(s.createPending.mock.calls[0][0]).toMatchObject({
      bindingId: 'binding-1',
      tool: 'crm.update_company',
    })
  })

  it('reuses an existing pending request instead of creating a second one', async () => {
    const s = store(approval())
    await expect(runWriteGate({ ...base, store: s.value })).resolves.toMatchObject({
      action: 'approval_required',
      approvalId: 'approval-1',
    })
    expect(s.createPending).not.toHaveBeenCalled()
  })

  it('executes exactly once for an approved, unexpired request', async () => {
    const s = store(approval({ status: 'approved' }))
    await expect(runWriteGate({ ...base, store: s.value })).resolves.toMatchObject({
      action: 'execute',
    })
    expect(s.claim).toHaveBeenCalledWith({ id: 'approval-1', now: NOW })
  })

  it('does not execute when another call consumed the approval first', async () => {
    const s = store(approval({ status: 'approved' }), false)
    await expect(runWriteGate({ ...base, store: s.value })).resolves.toMatchObject({
      action: 'approval_consumed',
      approvalId: 'approval-1',
    })
  })

  it('opens a fresh request when the approval expired', async () => {
    const s = store(approval({ status: 'approved', expiresAt: NOW }))
    await expect(runWriteGate({ ...base, store: s.value })).resolves.toMatchObject({
      action: 'approval_required',
      approvalId: 'approval-new',
    })
    expect(s.createPending).toHaveBeenCalledTimes(1)
  })

  it('refuses a rejected request without opening another one', async () => {
    const s = store(approval({ status: 'rejected' }))
    await expect(runWriteGate({ ...base, store: s.value })).resolves.toMatchObject({
      action: 'approval_rejected',
    })
    expect(s.createPending).not.toHaveBeenCalled()
  })

  it('refuses a consumed approval', async () => {
    const s = store(approval({ status: 'consumed' }))
    await expect(runWriteGate({ ...base, store: s.value })).resolves.toMatchObject({
      action: 'approval_consumed',
    })
  })
})
