/** @jest-environment node */

import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { NextRequest } from 'next/server'

import type { RunRecord } from '@/modules/dsh_runs/services/run-store'

type FakeCancelService = {
  getRun: jest.Mock<(runId: string) => Promise<RunRecord | null>>
  cancel: jest.Mock<(runId: string, reason?: string) => Promise<RunRecord>>
}

const mockCreateRequestRunService = jest.fn<() => Promise<FakeCancelService>>()

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

import { POST } from '../route'

const RUN_ID = 'run-1'

function runRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: RUN_ID,
    bindingId: 'binding-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    sessionId: 'dsh-session-1',
    status: 'running',
    idempotencyKey: 'key-1',
    requestHash: 'hash-1',
    cursor: 1,
    resultJson: null,
    error: null,
    startedAt: '2026-11-11T09:00:00.000Z',
    finishedAt: null,
    createdAt: '2026-11-11T09:00:00.000Z',
    ...overrides,
  }
}

function fakeService(): FakeCancelService {
  return {
    getRun: jest.fn(async () => runRecord()),
    cancel: jest.fn(async (runId: string) => runRecord({ id: runId, status: 'cancelled' })),
  }
}

function cancelRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/internal/ai-assistant-dsh-runs/${RUN_ID}/cancel`, {
    method: 'POST',
  })
}

const context = { params: Promise.resolve({ runId: RUN_ID }) }

beforeEach(() => {
  jest.clearAllMocks()
  mockCreateRequestRunService.mockReset()
  mockCreateRequestRunService.mockResolvedValue(fakeService())
  process.env.OM_DSH_PERSIST = 'orm'
  mockGetAuthFromRequest.mockResolvedValue({ sub: 'user-1', tenantId: 'tenant-1', orgId: 'org-1' })
})

afterAll(() => {
  delete process.env.OM_DSH_PERSIST
})

describe('POST /api/internal/ai-assistant-dsh-runs/[runId]/cancel', () => {
  it('is a 404 when persistence is disabled', async () => {
    delete process.env.OM_DSH_PERSIST

    const response = await POST(cancelRequest(), context)

    expect(response.status).toBe(404)
    expect(mockGetAuthFromRequest).not.toHaveBeenCalled()
    expect(mockCreateRequestRunService).not.toHaveBeenCalled()
  })

  it('returns 401 without a CRM session', async () => {
    mockGetAuthFromRequest.mockResolvedValueOnce(null)

    const response = await POST(cancelRequest(), context)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 403 run_forbidden for another employee’s run', async () => {
    const service = fakeService()
    service.getRun.mockResolvedValueOnce(runRecord({ userId: 'someone-else' }))
    mockCreateRequestRunService.mockResolvedValueOnce(service)

    const response = await POST(cancelRequest(), context)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden', code: 'run_forbidden' })
    expect(service.cancel).not.toHaveBeenCalled()
  })

  it('returns 404 run_not_found for an unknown run id', async () => {
    const service = fakeService()
    service.getRun.mockResolvedValueOnce(null)
    mockCreateRequestRunService.mockResolvedValueOnce(service)

    const response = await POST(cancelRequest(), context)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Run not found', code: 'run_not_found' })
    expect(service.cancel).not.toHaveBeenCalled()
  })

  it('cancels an in-flight run with reason user_cancelled', async () => {
    const service = fakeService()
    mockCreateRequestRunService.mockResolvedValueOnce(service)

    const response = await POST(cancelRequest(), context)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ runId: RUN_ID, status: 'cancelled' })
    expect(service.cancel).toHaveBeenCalledWith(RUN_ID, 'user_cancelled')
  })

  it('is idempotent for an already-terminal run', async () => {
    const service = fakeService()
    service.getRun.mockResolvedValueOnce(runRecord({ status: 'completed' }))
    mockCreateRequestRunService.mockResolvedValueOnce(service)

    const response = await POST(cancelRequest(), context)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ runId: RUN_ID, status: 'completed' })
    expect(service.cancel).not.toHaveBeenCalled()
  })

  it('returns 200 with the cancelled status when a concurrent cancel already settled the row', async () => {
    const service = fakeService()
    // The service re-reads and returns the terminal row instead of failing.
    service.cancel.mockResolvedValueOnce(runRecord({ status: 'cancelled', error: 'user_cancelled' }))
    mockCreateRequestRunService.mockResolvedValueOnce(service)

    const response = await POST(cancelRequest(), context)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ runId: RUN_ID, status: 'cancelled' })
  })

  it('returns 503 persistence_unavailable when the run lookup fails', async () => {
    const service = fakeService()
    service.getRun.mockRejectedValueOnce(new Error('connection refused'))
    mockCreateRequestRunService.mockResolvedValueOnce(service)

    const response = await POST(cancelRequest(), context)

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ code: 'persistence_unavailable' })
  })

  it('returns 503 persistence_unavailable when the cancel transition fails', async () => {
    const service = fakeService()
    service.cancel.mockRejectedValueOnce(new Error('deadlock detected'))
    mockCreateRequestRunService.mockResolvedValueOnce(service)

    const response = await POST(cancelRequest(), context)

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ code: 'persistence_unavailable' })
  })
})
