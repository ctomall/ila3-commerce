/** @jest-environment node */

import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { NextRequest } from 'next/server'

import type { RunIdentity } from '@/modules/dsh_runs/services/run-service'
import type {
  BindingRecord,
  RevokeBindingOptions,
  RevokeBindingResult,
  RunRecord,
} from '@/modules/dsh_runs/services/run-store'

type FakeRevokeService = {
  getBinding: jest.Mock<(identity: RunIdentity) => Promise<BindingRecord | null>>
  revokeBinding: jest.Mock<
    (bindingId: string, options?: RevokeBindingOptions) => Promise<RevokeBindingResult>
  >
}

const mockCreateRequestRunService = jest.fn<() => Promise<FakeRevokeService>>()

jest.mock('@/modules/dsh_runs/services/run-service', () => ({
  createRequestRunService: mockCreateRequestRunService,
}))

jest.mock('@/bootstrap-api', () => ({ bootstrap: jest.fn() }))

const mockGetAuthFromRequest = jest.fn<
  () => Promise<{ sub: string; tenantId: string | null; orgId: string | null } | null>
>()

jest.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: mockGetAuthFromRequest,
}))

const mockLog = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
jest.mock('@open-mercato/shared/lib/logger', () => ({ createLogger: () => mockLog }))

const mockUserHasAllFeatures = jest.fn<
  (userId: string, features: string[], scope: { tenantId: string; organizationId: string }) => Promise<boolean>
>()

const mockResolve = jest.fn((key: string) =>
  key === 'rbacService' ? { userHasAllFeatures: mockUserHasAllFeatures } : undefined,
)

jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: jest.fn(async () => ({ resolve: mockResolve })),
}))

import { POST } from '../route'

const BINDING_ID = 'binding-1'

function bindingRecord(overrides: Partial<BindingRecord> = {}): BindingRecord {
  return {
    id: BINDING_ID,
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    userId: 'target-user',
    assistantId: 'crm-assistant',
    status: 'active',
    revision: 1,
    createdAt: '2026-11-11T09:00:00.000Z',
    updatedAt: '2026-11-11T09:00:00.000Z',
    ...overrides,
  }
}

function runRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: 'run-1',
    bindingId: BINDING_ID,
    userId: 'target-user',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    sessionId: 'dsh-session-1',
    status: 'cancelled',
    idempotencyKey: 'key-1',
    requestHash: 'hash-1',
    cursor: 1,
    resultJson: null,
    error: 'principal_revoked',
    startedAt: '2026-11-11T09:00:00.000Z',
    finishedAt: '2026-11-11T09:00:05.000Z',
    createdAt: '2026-11-11T09:00:00.000Z',
    ...overrides,
  }
}

function fakeService(): FakeRevokeService {
  return {
    getBinding: jest.fn(async () => bindingRecord()),
    revokeBinding: jest.fn(async () => ({
      binding: bindingRecord({ status: 'revoked', revision: 2 }),
      cancelled: [runRecord()],
      revokedAt: '2026-11-11T09:00:05.000Z',
    })),
  }
}

function revokeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/internal/dsh-bindings/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCreateRequestRunService.mockReset()
  mockCreateRequestRunService.mockResolvedValue(fakeService())
  mockUserHasAllFeatures.mockResolvedValue(true)
  process.env.OM_DSH_PERSIST = 'orm'
  mockGetAuthFromRequest.mockResolvedValue({ sub: 'admin-1', tenantId: 'tenant-1', orgId: 'org-1' })
})

afterAll(() => {
  delete process.env.OM_DSH_PERSIST
})

describe('POST /api/internal/dsh-bindings/revoke', () => {
  it('is a 404 when persistence is disabled', async () => {
    delete process.env.OM_DSH_PERSIST

    const response = await POST(revokeRequest({ targetUserId: 'target-user' }))

    expect(response.status).toBe(404)
    expect(mockGetAuthFromRequest).not.toHaveBeenCalled()
  })

  it('returns 401 without a CRM session', async () => {
    mockGetAuthFromRequest.mockResolvedValueOnce(null)

    const response = await POST(revokeRequest({ targetUserId: 'target-user' }))

    expect(response.status).toBe(401)
  })

  it.each([
    ['invalid JSON', 'not-json'],
    ['missing targetUserId', {}],
    ['blank targetUserId', { targetUserId: '  ' }],
    ['non-string reason', { targetUserId: 'target-user', reason: 7 }],
    ['over-long reason', { targetUserId: 'target-user', reason: 'x'.repeat(201) }],
  ])('returns 400 invalid_request for %s', async (_label, body) => {
    const response = await POST(revokeRequest(body))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'invalid_request' })
    expect(mockCreateRequestRunService).not.toHaveBeenCalled()
  })

  it('returns 403 when the session has no tenant/organization scope', async () => {
    mockGetAuthFromRequest.mockResolvedValueOnce({ sub: 'admin-1', tenantId: null, orgId: null })

    const response = await POST(revokeRequest({ targetUserId: 'target-user' }))

    expect(response.status).toBe(403)
    expect(mockUserHasAllFeatures).not.toHaveBeenCalled()
  })

  it('checks the real dsh_runs.cancel feature and refuses when it is missing', async () => {
    mockUserHasAllFeatures.mockResolvedValueOnce(false)

    const response = await POST(revokeRequest({ targetUserId: 'target-user' }))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ code: 'feature_denied' })
    expect(mockUserHasAllFeatures).toHaveBeenCalledWith('admin-1', ['dsh_runs.cancel'], {
      tenantId: 'tenant-1',
      organizationId: 'org-1',
    })
    expect(mockCreateRequestRunService).not.toHaveBeenCalled()
  })

  it('returns 503 authorization_unavailable when RBAC fails', async () => {
    mockUserHasAllFeatures.mockRejectedValueOnce(new Error('rbac down'))

    const response = await POST(revokeRequest({ targetUserId: 'target-user' }))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ code: 'authorization_unavailable' })
  })

  it('returns 404 binding_not_found when the target has no binding in this scope', async () => {
    const service = fakeService()
    service.getBinding.mockResolvedValueOnce(null)
    mockCreateRequestRunService.mockResolvedValueOnce(service)

    const response = await POST(revokeRequest({ targetUserId: 'target-user' }))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ code: 'binding_not_found' })
    expect(service.getBinding).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'target-user',
    })
    expect(service.revokeBinding).not.toHaveBeenCalled()
  })

  it('revokes the binding and reports how many runs it cancelled', async () => {
    const response = await POST(
      revokeRequest({ targetUserId: 'target-user', reason: 'offboarding' }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ bindingId: BINDING_ID, revokedRuns: 1 })
    const service = (await mockCreateRequestRunService.mock.results[0].value) as ReturnType<
      typeof fakeService
    >
    expect(service.revokeBinding).toHaveBeenCalledWith(BINDING_ID, { reason: 'offboarding' })
  })

  it('uses the store default reason when the body omits it', async () => {
    await POST(revokeRequest({ targetUserId: 'target-user' }))

    const service = (await mockCreateRequestRunService.mock.results[0].value) as ReturnType<
      typeof fakeService
    >
    expect(service.revokeBinding).toHaveBeenCalledWith(BINDING_ID, {})
  })

  it('returns 503 persistence_unavailable when the revoke transition fails', async () => {
    const service = fakeService()
    service.revokeBinding.mockRejectedValueOnce(new Error('connection refused'))
    mockCreateRequestRunService.mockResolvedValueOnce(service)

    const response = await POST(revokeRequest({ targetUserId: 'target-user' }))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ code: 'persistence_unavailable' })
  })
})
