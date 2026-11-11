import { describe, expect, it, jest } from '@jest/globals'
import {
  authorizeToolCall,
  type AuthorizeDeps,
  type BindingRecord,
  type ToolDescriptor,
} from '../authorize'
import type { RunTokenClaims } from '../run-token'

const claims: RunTokenClaims = {
  runId: 'run-1',
  bindingId: 'binding-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  exp: 2_000_000_000,
  tools: ['crm.find_companies'],
}

const readTool: ToolDescriptor = {
  name: 'crm.find_companies',
  readOnly: true,
  requiredFeatures: ['customers.companies.view'],
}

const activeBinding: BindingRecord = {
  id: 'binding-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  state: 'active',
}

function deps(overrides: Partial<AuthorizeDeps> = {}): AuthorizeDeps {
  return {
    bindings: jest.fn(async () => activeBinding),
    checkFeatures: jest.fn(async () => true),
    resolveCustomerScope: jest.fn(async () => ({ mode: 'organization' as const, ownerUserIds: [] as string[] })),
    ...overrides,
  }
}

const call = (input: {
  claims?: RunTokenClaims
  tool?: string
  descriptor?: ToolDescriptor | null
  deps: AuthorizeDeps
}) =>
  authorizeToolCall({
    claims: input.claims ?? claims,
    tool: input.tool ?? 'crm.find_companies',
    descriptor: input.descriptor === undefined ? readTool : input.descriptor,
    deps: input.deps,
  })

describe('authorizeToolCall', () => {
  it('allows a read-only tool with an active matching binding, the real feature and a scope', async () => {
    const d = deps()
    await expect(call({ deps: d })).resolves.toEqual({
      ok: true,
      descriptor: readTool,
      scope: { mode: 'organization', ownerUserIds: [] },
    })
    expect(d.checkFeatures).toHaveBeenCalledWith({
      userId: 'user-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      features: ['customers.companies.view'],
    })
    expect(d.resolveCustomerScope).toHaveBeenCalledWith({
      userId: 'user-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
    })
  })

  it('returns 404 unknown_tool for a tool the registry does not know', async () => {
    const d = deps()
    await expect(call({ descriptor: null, deps: d })).resolves.toMatchObject({
      ok: false,
      status: 404,
      code: 'unknown_tool',
    })
    expect(d.bindings).not.toHaveBeenCalled()
  })

  it('refuses a write tool after identity checks when the write gate is unavailable', async () => {
    const writeTool: ToolDescriptor = {
      name: 'crm.update_company',
      readOnly: false,
      requiredFeatures: ['customers.companies.manage'],
    }
    const d = deps()
    await expect(
      call({
        tool: 'crm.update_company',
        descriptor: writeTool,
        claims: { ...claims, tools: ['crm.update_company'] },
        deps: d,
      }),
    ).resolves.toMatchObject({ ok: false, status: 403, code: 'write_denied' })
    expect(d.bindings).toHaveBeenCalled()
    expect(d.checkFeatures).toHaveBeenCalled()
  })

  it('still fails closed when the write gate allows but no handler exists', async () => {
    const writeTool: ToolDescriptor = {
      name: 'crm.update_company',
      readOnly: false,
      requiredFeatures: ['customers.companies.manage'],
    }
    const d = deps({ canWriteToCrm: jest.fn(async () => true) })
    await expect(
      call({
        tool: 'crm.update_company',
        descriptor: writeTool,
        claims: { ...claims, tools: ['crm.update_company'] },
        deps: d,
      }),
    ).resolves.toMatchObject({ ok: false, status: 403, code: 'write_not_enabled' })
  })

  it('refuses a tool that is not in the run token tools[]', async () => {
    const d = deps()
    await expect(call({ claims: { ...claims, tools: [] }, deps: d })).resolves.toMatchObject({
      ok: false,
      status: 403,
      code: 'tool_not_allowed',
    })
    expect(d.bindings).not.toHaveBeenCalled()
  })

  it('refuses a missing binding', async () => {
    const d = deps({ bindings: jest.fn(async () => null) })
    await expect(call({ deps: d })).resolves.toMatchObject({ ok: false, status: 403, code: 'binding_inactive' })
    expect(d.checkFeatures).not.toHaveBeenCalled()
  })

  it.each(['suspended', 'revoked'] as const)('refuses a %s binding', async (state) => {
    const d = deps({ bindings: jest.fn(async () => ({ ...activeBinding, state })) })
    await expect(call({ deps: d })).resolves.toMatchObject({ ok: false, status: 403, code: 'binding_inactive' })
  })

  it('refuses a binding whose identity differs from the token', async () => {
    for (const field of ['userId', 'tenantId', 'organizationId'] as const) {
      const d = deps({ bindings: jest.fn(async () => ({ ...activeBinding, [field]: 'other' })) })
      await expect(call({ deps: d })).resolves.toMatchObject({
        ok: false,
        status: 403,
        code: 'binding_mismatch',
      })
    }
  })

  it('fails closed when the binding repository throws', async () => {
    const d = deps({
      bindings: jest.fn(async () => {
        throw new Error('database down')
      }),
    })
    await expect(call({ deps: d })).resolves.toMatchObject({ ok: false, status: 403, code: 'binding_unavailable' })
  })

  it('refuses when the caller no longer holds the real feature id', async () => {
    const d = deps({ checkFeatures: jest.fn(async () => false) })
    await expect(call({ deps: d })).resolves.toMatchObject({ ok: false, status: 403, code: 'feature_denied' })
    expect(d.resolveCustomerScope).not.toHaveBeenCalled()
  })

  it('fails closed when the feature check throws', async () => {
    const d = deps({
      checkFeatures: jest.fn(async () => {
        throw new Error('rbac down')
      }),
    })
    await expect(call({ deps: d })).resolves.toMatchObject({ ok: false, status: 403, code: 'feature_unavailable' })
  })

  it('refuses a read tool that declares no feature (would be an implicit grant)', async () => {
    const d = deps()
    await expect(
      call({ descriptor: { ...readTool, requiredFeatures: [] }, deps: d }),
    ).resolves.toMatchObject({ ok: false, status: 403, code: 'feature_denied' })
    expect(d.checkFeatures).not.toHaveBeenCalled()
  })

  it('passes an owner-scoped resolution through unchanged', async () => {
    const d = deps({
      resolveCustomerScope: jest.fn(async () => ({ mode: 'own' as const, ownerUserIds: ['user-1'] })),
    })
    await expect(call({ deps: d })).resolves.toMatchObject({
      ok: true,
      scope: { mode: 'own', ownerUserIds: ['user-1'] },
    })
  })

  it('normalizes an organization scope by dropping a stray owner list', async () => {
    const d = deps({
      resolveCustomerScope: jest.fn(async () => ({
        mode: 'organization' as const,
        ownerUserIds: ['should-not-matter'],
      })),
    })
    await expect(call({ deps: d })).resolves.toMatchObject({
      ok: true,
      scope: { mode: 'organization', ownerUserIds: [] },
    })
  })

  it('fails closed on a throwing or malformed scope resolver', async () => {
    const throwing = deps({
      resolveCustomerScope: jest.fn(async () => {
        throw new Error('customer_access unavailable')
      }),
    })
    await expect(call({ deps: throwing })).resolves.toMatchObject({
      ok: false,
      status: 403,
      code: 'scope_unavailable',
    })

    const malformed = deps({
      resolveCustomerScope: jest.fn(async () => ({ mode: 'all' }) as unknown as { mode: 'organization'; ownerUserIds: string[] }),
    })
    await expect(call({ deps: malformed })).resolves.toMatchObject({
      ok: false,
      status: 403,
      code: 'scope_unavailable',
    })
  })
})
