/** @jest-environment node */

import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { NextRequest } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { Mock } from 'jest-mock'
import type { BindingState } from '@/lib/dsh/run'

jest.mock('@/bootstrap-api', () => ({ bootstrap: jest.fn() }))
jest.mock('@/lib/dsh/tool-bridge/deps', () => ({ buildToolBridgeDeps: jest.fn() }))
jest.mock('@/lib/dsh/tool-bridge/approval-gate', () => ({ runWriteGate: jest.fn() }))
jest.mock('@/modules/dsh_approvals/services/orm-repository', () => ({
  createRequestApprovalStore: jest.fn(async () => ({
    claim: jest.fn(async () => true),
    settle: jest.fn(async () => true),
  })),
  ApprovalUnavailableError: class ApprovalUnavailableError extends Error {},
}))
jest.mock('@open-mercato/shared/lib/logger', () => {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { createLogger: () => logger }
})

import { buildToolBridgeDeps } from '@/lib/dsh/tool-bridge/deps'
import { runWriteGate } from '@/lib/dsh/tool-bridge/approval-gate'
import { createRequestApprovalStore } from '@/modules/dsh_approvals/services/orm-repository'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { signRunToken, type RunTokenClaims } from '@/lib/dsh/tool-bridge/run-token'
import { POST } from '../[tool]/route'

const SECRET = 'route-test-secret-not-real'
const mockBuildDeps = buildToolBridgeDeps as unknown as Mock<typeof buildToolBridgeDeps>
const mockRunWriteGate = runWriteGate as unknown as Mock<typeof runWriteGate>
const mockCreateStore = createRequestApprovalStore as unknown as Mock<typeof createRequestApprovalStore>
const mockLogger = createLogger('test') as unknown as {
  info: Mock
  error: Mock
  debug: Mock
  warn: Mock
}

const claims: RunTokenClaims = {
  runId: 'run-1',
  bindingId: 'binding-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  exp: 2_000_000_000,
  tools: ['crm.find_companies'],
}

const activeBinding = {
  id: 'binding-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  state: 'active' as BindingState,
}

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'

const companyRow = {
  id: 'c-1',
  legalName: 'Acme GmbH',
  brandName: '',
  domain: 'acme.example',
  websiteUrl: null,
  industry: 'Software',
  sizeBucket: null,
}

function makeHarness() {
  const emFind = jest.fn(async (..._args: unknown[]) => [companyRow])
  const bindings = jest.fn(async (..._args: unknown[]) => ({ ...activeBinding }))
  const checkFeatures = jest.fn(async (..._args: unknown[]) => true)
  const resolveCustomerScope = jest.fn(async (..._args: unknown[]) => ({
    mode: 'organization' as const,
    ownerUserIds: [] as string[],
  }))
  const emFindOne = jest.fn(async (..._args: unknown[]) => ({
    id: COMPANY_ID,
    ownerUserId: 'user-1',
    displayName: 'Acme GmbH',
  }))
  const commandExecute = jest.fn(async (..._args: unknown[]) => ({ entityId: COMPANY_ID }))
  const container = {
    resolve: jest.fn(() => ({ execute: commandExecute })),
  }
  const canWriteToCrm = jest.fn(async (..._args: unknown[]) => false)
  const deps = {
    em: { find: emFind, findOne: emFindOne, fork: () => ({ findOne: emFindOne }) } as unknown as EntityManager,
    container,
    canWriteToCrm,
    bindings,
    checkFeatures,
    resolveCustomerScope,
  }
  return { deps, emFind, emFindOne, commandExecute, canWriteToCrm, bindings, checkFeatures, resolveCustomerScope }
}

let harness = makeHarness()

function tokenFor(overrides: Partial<RunTokenClaims> = {}): string {
  return signRunToken({ ...claims, ...overrides }, SECRET)
}

function post(tool: string, body: unknown, token: string | null): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token !== null) headers.authorization = `Bearer ${token}`
  return new NextRequest(`http://localhost/api/internal/dsh-tools/${tool}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

const context = (tool: string) => ({ params: Promise.resolve({ tool }) })

function auditCalls(): unknown[][] {
  return mockLogger.info.mock.calls.filter(([message]) => message === 'dsh.tool_call')
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.OM_DSH_RUN_TOKEN_SECRET = SECRET
  harness = makeHarness()
  mockBuildDeps.mockResolvedValue(harness.deps as never)
})

afterAll(() => {
  delete process.env.OM_DSH_RUN_TOKEN_SECRET
  delete process.env.OM_DSH_WRITES
})

describe('POST /api/internal/dsh-tools/[tool]', () => {
  it('returns 401 without a bearer token and never builds the bridge', async () => {
    const response = await POST(post('crm.find_companies', {}, null), context('crm.find_companies'))
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized', code: 'unauthorized' })
    expect(mockBuildDeps).not.toHaveBeenCalled()
    expect(auditCalls()).toHaveLength(1)
    expect(auditCalls()[0][1]).toMatchObject({ runId: null, tool: 'crm.find_companies', decision: 'unauthorized' })
  })

  it('returns 401 for a token signed with another secret', async () => {
    const forged = signRunToken(claims, 'attacker-secret')
    const response = await POST(post('crm.find_companies', {}, forged), context('crm.find_companies'))
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized', code: 'unauthorized' })
    expect(mockBuildDeps).not.toHaveBeenCalled()
  })

  it('returns 401 for an expired token', async () => {
    const expired = tokenFor({ exp: 1 })
    const response = await POST(post('crm.find_companies', {}, expired), context('crm.find_companies'))
    expect(response.status).toBe(401)
    expect(mockBuildDeps).not.toHaveBeenCalled()
  })

  it('returns 404 unknown_tool for a tool the registry does not know', async () => {
    const response = await POST(post('crm.delete_everything', {}, tokenFor()), context('crm.delete_everything'))
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Unknown tool', code: 'unknown_tool' })
    expect(mockBuildDeps).not.toHaveBeenCalled()
    expect(auditCalls()[0][1]).toMatchObject({ decision: 'unknown_tool' })
  })

  it('returns 403 write_denied for a write tool after identity checks', async () => {
    const response = await POST(
      post('crm.update_company', {}, tokenFor({ tools: ['crm.update_company'] })),
      context('crm.update_company'),
    )
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'CRM writes are not allowed for this run',
      code: 'write_denied',
    })
    expect(harness.bindings).toHaveBeenCalledWith('binding-1')
  })

  it('returns 403 feature_denied when RBAC no longer grants the real feature', async () => {
    harness.checkFeatures.mockResolvedValue(false)
    const response = await POST(post('crm.find_companies', {}, tokenFor()), context('crm.find_companies'))
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden', code: 'feature_denied' })
    expect(harness.emFind).not.toHaveBeenCalled()
  })

  it('returns 403 binding_inactive when the binding was revoked', async () => {
    harness.bindings.mockResolvedValue({ ...activeBinding, state: 'revoked' })
    const response = await POST(post('crm.find_companies', {}, tokenFor()), context('crm.find_companies'))
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Assistant binding is not active',
      code: 'binding_inactive',
    })
  })

  it('returns 400 invalid_input for an out-of-range limit and does not query', async () => {
    const response = await POST(post('crm.find_companies', { limit: 21 }, tokenFor()), context('crm.find_companies'))
    expect(response.status).toBe(400)
    const payload = (await response.json()) as { code: string; issues: unknown[] }
    expect(payload.code).toBe('invalid_input')
    expect(payload.issues.length).toBeGreaterThan(0)
    expect(harness.emFind).not.toHaveBeenCalled()
  })

  it('does not adopt identity fields from the body (the strict schema rejects them)', async () => {
    const response = await POST(
      post('crm.find_companies', { tenantId: 'other-tenant' }, tokenFor()),
      context('crm.find_companies'),
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'invalid_input' })
    expect(harness.emFind).not.toHaveBeenCalled()
  })

  it('runs the read with the token identity and returns the shaped result', async () => {
    const token = tokenFor()
    const response = await POST(
      post('crm.find_companies', { query: 'acme', limit: 5 }, token),
      context('crm.find_companies'),
    )
    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      ok: boolean
      tool: string
      result: { companies: Array<{ id: string; name: string }>; scope: { mode: string } }
    }
    expect(payload.ok).toBe(true)
    expect(payload.tool).toBe('crm.find_companies')
    expect(payload.result.companies).toEqual([
      { id: 'c-1', name: 'Acme GmbH', domain: 'acme.example', websiteUrl: null, industry: 'Software', sizeBucket: null },
    ])
    expect(payload.result.scope.mode).toBe('organization')

    const [, where] = harness.emFind.mock.calls[0] as [unknown, Record<string, unknown>, unknown]
    expect(where).toEqual({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      entity: { deletedAt: null },
    })
  })

  it('audits only runId/tool/decision/duration and never the token or the secret', async () => {
    const token = tokenFor()
    const response = await POST(post('crm.find_companies', {}, token), context('crm.find_companies'))
    expect(response.status).toBe(200)

    const audit = auditCalls()
    expect(audit).toHaveLength(1)
    expect(audit[0][1]).toEqual({
      runId: 'run-1',
      tool: 'crm.find_companies',
      decision: 'allowed',
      durationMs: expect.any(Number),
    })

    const serialized = JSON.stringify([mockLogger.info.mock.calls, mockLogger.error.mock.calls])
    expect(serialized).not.toContain(token)
    expect(serialized).not.toContain(SECRET)
  })

  it('returns 503 tool_unavailable when the bridge wiring is unavailable', async () => {
    mockBuildDeps.mockRejectedValue(new Error('no database'))
    const response = await POST(post('crm.find_companies', {}, tokenFor()), context('crm.find_companies'))
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'Tool bridge unavailable', code: 'tool_unavailable' })
    expect(auditCalls()[0][1]).toMatchObject({ decision: 'tool_unavailable' })
  })

  it('returns 503 tool_unavailable (without leaking the driver error) when the handler throws', async () => {
    harness.emFind.mockRejectedValue(new Error('relation "customer_companies" does not exist'))
    const response = await POST(post('crm.find_companies', {}, tokenFor()), context('crm.find_companies'))
    expect(response.status).toBe(503)
    const text = await response.text()
    expect(text).toContain('tool_unavailable')
    expect(text).not.toContain('customer_companies')
    expect(auditCalls()[0][1]).toMatchObject({ decision: 'tool_error' })
  })
})

describe('POST /api/internal/dsh-tools/[tool] — write approval gate', () => {
  const writeToken = () => tokenFor({ tools: ['crm.update_company'] })
  const writeBody = { id: COMPANY_ID, fields: { industry: 'Software' } }

  afterEach(() => {
    delete process.env.OM_DSH_WRITES
  })

  it('stays read-only while OM_DSH_WRITES is off, even when the run may write', async () => {
    harness.canWriteToCrm.mockResolvedValue(true)
    const response = await POST(post('crm.update_company', writeBody, writeToken()), context('crm.update_company'))
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'CRM writes are disabled on this instance',
      code: 'write_not_enabled',
    })
    expect(mockCreateStore).not.toHaveBeenCalled()
    expect(harness.commandExecute).not.toHaveBeenCalled()
  })

  it('returns approval_required with the pending approval id', async () => {
    process.env.OM_DSH_WRITES = '1'
    harness.canWriteToCrm.mockResolvedValue(true)
    mockRunWriteGate.mockResolvedValue({
      action: 'approval_required',
      approvalId: 'a-1',
      expiresAt: '2026-11-12T00:10:00.000Z',
      summary: { companyId: COMPANY_ID, companyName: 'Acme GmbH' },
    })
    const response = await POST(post('crm.update_company', writeBody, writeToken()), context('crm.update_company'))
    expect(response.status).toBe(403)
    const payload = (await response.json()) as Record<string, unknown>
    expect(payload).toMatchObject({ code: 'approval_required', approvalId: 'a-1' })
    expect(harness.commandExecute).not.toHaveBeenCalled()
  })

  it('executes the command once an approved request is consumed', async () => {
    process.env.OM_DSH_WRITES = '1'
    harness.canWriteToCrm.mockResolvedValue(true)
    mockRunWriteGate.mockResolvedValue({
      action: 'execute',
      approval: {
        id: 'a-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        bindingId: 'binding-1',
        runId: 'run-1',
        tool: 'crm.update_company',
        argsHash: 'h',
        argsPreview: {},
        status: 'approved',
        requestedAt: '2026-11-12T00:00:00.000Z',
        expiresAt: '2026-11-12T00:10:00.000Z',
        decidedAt: '2026-11-12T00:01:00.000Z',
        decidedBy: 'user-1',
        consumedAt: null,
      },
    })
    const response = await POST(post('crm.update_company', writeBody, writeToken()), context('crm.update_company'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      tool: 'crm.update_company',
      result: { ok: true, companyId: COMPANY_ID, updatedFields: ['industry'] },
    })
    expect(harness.commandExecute).toHaveBeenCalledTimes(1)
    expect(harness.commandExecute.mock.calls[0][0]).toBe('customers.companies.update')
  })

  it('fails closed with 503 when the approval gate is unavailable', async () => {
    process.env.OM_DSH_WRITES = '1'
    harness.canWriteToCrm.mockResolvedValue(true)
    mockRunWriteGate.mockRejectedValue(new Error('store down'))
    const response = await POST(post('crm.update_company', writeBody, writeToken()), context('crm.update_company'))
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'Write approval is unavailable',
      code: 'approval_unavailable',
    })
    expect(harness.commandExecute).not.toHaveBeenCalled()
  })
})
