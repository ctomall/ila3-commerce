import { describe, expect, it, jest } from '@jest/globals'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FIND_COMPANIES_TOOL, findCompanies, withCustomerScope } from '../crm-find-companies'
import type { RunTokenClaims } from '../run-token'

const claims: RunTokenClaims = {
  runId: 'run-1',
  bindingId: 'binding-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  exp: 2_000_000_000,
  tools: [FIND_COMPANIES_TOOL],
}

const organizationScope = {
  mode: 'organization' as const,
  ownerUserIds: [] as string[],
  grantedEntityIds: [] as string[],
  editableEntityIds: [] as string[],
}
const ownScope = {
  mode: 'own' as const,
  ownerUserIds: ['user-1', 'user-2'],
  grantedEntityIds: [] as string[],
  editableEntityIds: [] as string[],
}

function company(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `c-${index}`,
    legalName: `Company ${index}`,
    brandName: '',
    domain: `company-${index}.example`,
    websiteUrl: null,
    industry: 'Software',
    sizeBucket: null,
    // Present in the entity but must never be selected or returned.
    annualRevenue: '1000000.00',
    ...overrides,
  }
}

function setup(
  scope: {
    mode: 'organization' | 'own'
    ownerUserIds: string[]
    grantedEntityIds?: string[]
    editableEntityIds?: string[]
  },
  rows = [company(1)],
) {
  const find = jest.fn(async (..._args: unknown[]) => rows)
  const em = { find } as unknown as EntityManager
  return {
    find,
    context: {
      em,
      claims,
      scope: { grantedEntityIds: [], editableEntityIds: [], ...scope },
    },
  }
}

type FindCall = [unknown, Record<string, any>, { fields?: readonly string[]; limit?: number }]

function firstCall(find: jest.Mock): FindCall {
  return find.mock.calls[0] as unknown as FindCall
}

describe('crm.find_companies bridge handler', () => {
  it('ANDs tenant, organization and soft-delete, and returns only the minimal fields', async () => {
    const { find, context } = setup(organizationScope)
    const result = await findCompanies({ limit: 3 }, context)

    const [, where, options] = firstCall(find)
    expect(where).toEqual({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      entity: { deletedAt: null },
    })
    expect(options.limit).toBe(3)
    // No column projection: encrypted custom types must hydrate/decrypt.
    expect(options.fields).toBeUndefined()
    expect(Object.keys(result.companies[0]).sort()).toEqual([
      'domain',
      'id',
      'industry',
      'name',
      'sizeBucket',
      'websiteUrl',
    ])
    expect(result.scope).toEqual({ mode: 'organization', tenantId: 'tenant-1', organizationId: 'org-1' })
    expect(result.companies[0]).toEqual({
      id: 'c-1',
      name: 'Company 1',
      domain: 'company-1.example',
      websiteUrl: null,
      industry: 'Software',
      sizeBucket: null,
    })
    expect(result.companies[0]).not.toHaveProperty('annualRevenue')
  })

  it('adds an owner-scoped condition under the entity relation without dropping soft-delete', async () => {
    const { find, context } = setup(ownScope)
    await findCompanies({}, context)

    const [, where] = firstCall(find)
    expect(where.tenantId).toBe('tenant-1')
    expect(where.organizationId).toBe('org-1')
    expect(where.entity).toEqual({
      deletedAt: null,
      ownerUserId: { $in: ['user-1', 'user-2'] },
    })
  })

  it('returns no rows for an owner scope with no owners instead of falling back to the organization', async () => {
    const { find, context } = setup({ mode: 'own', ownerUserIds: [] })
    const result = await findCompanies({}, context)

    expect(find).not.toHaveBeenCalled()
    expect(result.companies).toEqual([])
    expect(result.scanned).toBe(0)
  })

  it('never takes tenant/organization from the model input', async () => {
    const { find, context } = setup(organizationScope)
    await expect(findCompanies({ tenantId: 'other-tenant' }, context)).rejects.toThrow()
    await expect(findCompanies({ organizationId: 'other-org' }, context)).rejects.toThrow()
    expect(find).not.toHaveBeenCalled()
  })

  it('caps results at 20 even if the ORM returns more', async () => {
    const rows = Array.from({ length: 25 }, (_, index) => company(index + 1))
    const { find, context } = setup(organizationScope, rows)
    const result = await findCompanies({ limit: 20 }, context)

    const [, , options] = firstCall(find)
    expect(options.limit).toBe(20)
    expect(result.companies).toHaveLength(20)
    expect(result.scanned).toBe(25)
  })

  it('rejects a limit above the hard cap and an over-long query at the schema', async () => {
    const { find, context } = setup(organizationScope)
    await expect(findCompanies({ limit: 21 }, context)).rejects.toThrow()
    await expect(findCompanies({ query: 'x'.repeat(121) }, context)).rejects.toThrow()
    expect(find).not.toHaveBeenCalled()
  })

  it('treats search metacharacters literally (no SQL LIKE is built)', async () => {
    const rows = [
      company(1, { legalName: '100% Cotton' }),
      company(2, { legalName: 'ACME_1' }),
      company(3, { legalName: 'ACME-1' }),
    ]
    const { find, context } = setup(organizationScope, rows)

    const percent = await findCompanies({ query: '%' }, context)
    expect(percent.companies.map((row) => row.id)).toEqual(['c-1'])

    const underscore = await findCompanies({ query: '_' }, context)
    expect(underscore.companies.map((row) => row.id)).toEqual(['c-2'])

    const backslash = await findCompanies({ query: '\\' }, context)
    expect(backslash.companies).toEqual([])

    const [, where, options] = firstCall(find)
    expect(where.$or).toBeUndefined()
    expect(JSON.stringify(where)).not.toContain('$ilike')
    // A search scans a bounded page, not the whole table.
    expect(options.limit).toBe(200)
  })

  it('keeps the search result within the requested limit after filtering', async () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      company(index + 1, { legalName: `Acme ${index + 1}` }),
    )
    const { context } = setup(organizationScope, rows)
    const result = await findCompanies({ query: 'acme', limit: 3 }, context)
    expect(result.companies).toHaveLength(3)
    expect(result.scanned).toBe(12)
  })

  it('preserves the base soft-delete filter when composing a scope', () => {
    expect(withCustomerScope({ tenantId: 't', entity: { deletedAt: null } }, organizationScope)).toEqual({
      tenantId: 't',
      entity: { deletedAt: null },
    })
    expect(withCustomerScope({ tenantId: 't', entity: { deletedAt: null } }, ownScope)).toEqual({
      tenantId: 't',
      entity: { deletedAt: null, ownerUserId: { $in: ['user-1', 'user-2'] } },
    })
  })
})
