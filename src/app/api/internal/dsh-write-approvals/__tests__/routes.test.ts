/** @jest-environment node */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Mock } from 'jest-mock'
import { NextRequest } from 'next/server'

jest.mock('@/bootstrap-api', () => ({ bootstrap: jest.fn() }))
jest.mock('@open-mercato/shared/lib/auth/server', () => ({ getAuthFromRequest: jest.fn() }))
jest.mock('@open-mercato/shared/lib/logger', () => {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { createLogger: () => logger }
})
jest.mock('@/modules/dsh_approvals/services/orm-repository', () => ({
  createRequestApprovalStore: jest.fn(),
  ApprovalUnavailableError: class ApprovalUnavailableError extends Error {},
}))

import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import {
  ApprovalUnavailableError,
  createRequestApprovalStore,
} from '@/modules/dsh_approvals/services/orm-repository'
import { GET } from '../route'
import { POST } from '../[id]/route'

const mockAuth = getAuthFromRequest as unknown as Mock<typeof getAuthFromRequest>
const mockStore = createRequestApprovalStore as unknown as Mock<typeof createRequestApprovalStore>

const APPROVAL_ID = '22222222-2222-4222-8222-222222222222'

const record = {
  id: APPROVAL_ID,
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  userId: 'user-1',
  bindingId: 'binding-1',
  runId: 'run-1',
  tool: 'crm.update_company',
  argsHash: 'hash',
  argsPreview: { companyId: 'c-1', fields: { industry: 'Software' } },
  status: 'pending' as const,
  requestedAt: '2026-11-12T00:00:00.000Z',
  expiresAt: '2026-11-12T00:10:00.000Z',
  decidedAt: null,
  decidedBy: null,
  consumedAt: null,
}

type ListPending = (input: {
  userId: string
  tenantId: string | null
  organizationId: string | null
  now: string
  limit: number
}) => Promise<unknown[]>
type Decide = (input: {
  id: string
  userId: string
  tenantId: string | null
  organizationId: string | null
  decision: 'approve' | 'reject'
  now: string
}) => Promise<unknown>

function listStore(overrides: Record<string, unknown> = {}) {
  return {
    listPending: jest.fn(async (_input: Parameters<ListPending>[0]) => [record]),
    decide: jest.fn(async (_input: Parameters<Decide>[0]) => ({
      ok: true,
      approval: { ...record, status: 'approved' },
    })),
    ...overrides,
  }
}

function request(url: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ sub: 'user-1', tenantId: 'tenant-1', orgId: 'org-1' } as never)
  mockStore.mockResolvedValue(listStore() as never)
})

afterEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/internal/dsh-write-approvals', () => {
  it('requires a session', async () => {
    mockAuth.mockResolvedValue(null)
    const response = await GET(request('/api/internal/dsh-write-approvals'))
    expect(response.status).toBe(401)
    expect(mockStore).not.toHaveBeenCalled()
  })

  it('lists only the caller scope and returns no raw identity', async () => {
    const store = listStore()
    mockStore.mockResolvedValue(store as never)
    const response = await GET(request('/api/internal/dsh-write-approvals'))
    expect(response.status).toBe(200)
    const payload = (await response.json()) as { approvals: Array<Record<string, unknown>> }
    expect(payload.approvals).toHaveLength(1)
    expect(payload.approvals[0]).toMatchObject({ id: APPROVAL_ID, tool: 'crm.update_company' })
    expect(payload.approvals[0]).not.toHaveProperty('userId')
    expect(store.listPending).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', tenantId: 'tenant-1', organizationId: 'org-1' }),
    )
  })

  it('fails closed with 503 when the store is unavailable', async () => {
    mockStore.mockRejectedValue(new ApprovalUnavailableError())
    const response = await GET(request('/api/internal/dsh-write-approvals'))
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ code: 'approval_unavailable' })
  })
})

describe('POST /api/internal/dsh-write-approvals/[id]', () => {
  it('rejects an unknown decision before touching the store', async () => {
    const response = await POST(
      request(`/api/internal/dsh-write-approvals/${APPROVAL_ID}`, { decision: 'maybe' }),
      params(APPROVAL_ID),
    )
    expect(response.status).toBe(400)
    expect(mockStore).not.toHaveBeenCalled()
  })

  it('404s a non-uuid approval id', async () => {
    const response = await POST(
      request('/api/internal/dsh-write-approvals/nope', { decision: 'approve' }),
      params('nope'),
    )
    expect(response.status).toBe(404)
    expect(mockStore).not.toHaveBeenCalled()
  })

  it('approves with the session identity only', async () => {
    const store = listStore()
    mockStore.mockResolvedValue(store as never)
    const response = await POST(
      request(`/api/internal/dsh-write-approvals/${APPROVAL_ID}`, { decision: 'approve' }),
      params(APPROVAL_ID),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      approval: { id: APPROVAL_ID, status: 'approved' },
    })
    expect(store.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        id: APPROVAL_ID,
        userId: 'user-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        decision: 'approve',
      }),
    )
  })

  it.each([
    ['approval_forbidden', 403],
    ['approval_not_pending', 403],
    ['approval_expired', 410],
    ['binding_inactive', 403],
    ['approval_not_found', 404],
  ])('maps %s to HTTP %i', async (code, status) => {
    const store = listStore({ decide: jest.fn(async () => ({ ok: false, code })) })
    mockStore.mockResolvedValue(store as never)
    const response = await POST(
      request(`/api/internal/dsh-write-approvals/${APPROVAL_ID}`, { decision: 'approve' }),
      params(APPROVAL_ID),
    )
    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toMatchObject({ code })
  })

  it('fails closed with 503 when the store is unavailable', async () => {
    mockStore.mockRejectedValue(new ApprovalUnavailableError())
    const response = await POST(
      request(`/api/internal/dsh-write-approvals/${APPROVAL_ID}`, { decision: 'approve' }),
      params(APPROVAL_ID),
    )
    expect(response.status).toBe(503)
  })
})
