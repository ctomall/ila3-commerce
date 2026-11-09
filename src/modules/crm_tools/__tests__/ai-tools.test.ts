import { describe, expect, it, jest } from '@jest/globals'

import {
  buildFindCompaniesQuery,
  COMPANY_LOOKUP_FEATURE,
  DEFAULT_LIMIT,
  findCompaniesInputSchema,
  MAX_LIMIT,
  requireToolScope,
  shapeCompanyRecords,
} from '../lib/companyLookup'

describe('requireToolScope — scope never comes from the model', () => {
  it('throws when the context has no tenant', () => {
    expect(() => requireToolScope({ organizationId: 'org-1' })).toThrow(/tenant- and organization-scoped/)
  })

  it('throws when the context has no organization', () => {
    expect(() => requireToolScope({ tenantId: 'ten-1' })).toThrow(/tenant- and organization-scoped/)
  })

  it('throws on blank strings instead of treating them as a scope', () => {
    expect(() => requireToolScope({ tenantId: '   ', organizationId: 'org-1' })).toThrow()
  })

  it('returns the trimmed ids from the context', () => {
    expect(requireToolScope({ tenantId: ' ten-1 ', organizationId: 'org-1' })).toEqual({
      tenantId: 'ten-1',
      organizationId: 'org-1',
    })
  })

  it('has no tenant/organization field in the input schema at all', () => {
    const shape = findCompaniesInputSchema.parse({})
    expect(Object.keys(shape)).toEqual([])
    // A model that tries anyway is rejected by the schema rather than silently ignored.
    expect(() => findCompaniesInputSchema.parse({ tenantId: 'other-tenant' })).toThrow()
  })
})

describe('findCompaniesInputSchema', () => {
  it('rejects a limit above the hard cap', () => {
    expect(() => findCompaniesInputSchema.parse({ limit: MAX_LIMIT + 1 })).toThrow()
  })

  it('rejects a non-integer or negative limit', () => {
    expect(() => findCompaniesInputSchema.parse({ limit: 2.5 })).toThrow()
    expect(() => findCompaniesInputSchema.parse({ limit: -1 })).toThrow()
  })

  it('rejects an over-long query', () => {
    expect(() => findCompaniesInputSchema.parse({ query: 'x'.repeat(121) })).toThrow()
  })
})

describe('buildFindCompaniesQuery', () => {
  const scope = { tenantId: 'ten-1', organizationId: 'org-1' }

  it('binds tenant and organization from the scope, never from input', () => {
    const { where } = buildFindCompaniesQuery(scope, {})
    expect(where.tenantId).toBe('ten-1')
    expect(where.organizationId).toBe('org-1')
  })

  it('adds no filter when the query is blank', () => {
    expect(buildFindCompaniesQuery(scope, {}).where.$or).toBeUndefined()
    expect(buildFindCompaniesQuery(scope, { query: '   ' }).where.$or).toBeUndefined()
  })

  it('searches name, brand and domain with a bracketed pattern', () => {
    const { where } = buildFindCompaniesQuery(scope, { query: 'nord' })
    const or = where.$or as Array<Record<string, { $ilike: string }>>
    expect(or).toHaveLength(3)
    for (const clause of or) {
      const [field] = Object.keys(clause)
      expect(['legalName', 'brandName', 'domain']).toContain(field)
      expect(clause[field].$ilike).toBe('%nord%')
    }
  })

  it('falls back to the default limit and clamps a bypassed cap', () => {
    expect(buildFindCompaniesQuery(scope, {}).options.limit).toBe(DEFAULT_LIMIT)
    expect(buildFindCompaniesQuery(scope, { limit: MAX_LIMIT }).options.limit).toBe(MAX_LIMIT)
    // Even if a caller bypasses the schema, the clamp holds.
    expect(buildFindCompaniesQuery(scope, { limit: 5000 }).options.limit).toBe(MAX_LIMIT)
  })
})

describe('shapeCompanyRecords', () => {
  it('prefers the brand name and falls back to the legal name', () => {
    const rows = shapeCompanyRecords([
      { id: 'c1', legalName: 'Acme GmbH', brandName: 'Acme' },
      { id: 'c2', legalName: 'Nordwind Energie GmbH', brandName: '   ' },
    ])
    expect(rows.map((r) => r.name)).toEqual(['Acme', 'Nordwind Energie GmbH'])
  })

  it('drops records without an id or any name rather than emitting half-records', () => {
    const rows = shapeCompanyRecords([{ id: 'c1', legalName: 'Acme' }, { id: null, legalName: 'x' }, { id: 'c3' }, null])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'c1', name: 'Acme', domain: null })
  })

  it('returns an empty list for a non-array response', () => {
    expect(shapeCompanyRecords(null)).toEqual([])
    expect(shapeCompanyRecords({ rows: [] })).toEqual([])
  })
})

describe('the tool declaration', () => {
  it('is declared read-only and borrows an existing ACL feature', async () => {
    const { aiTools } = await import('../ai-tools')
    expect(aiTools).toHaveLength(1)
    const [tool] = aiTools as unknown as Array<Record<string, unknown>>
    expect(tool.name).toBe('crm.find_companies')
    expect(tool.isMutation).toBe(false)
    expect(tool.requiredFeatures).toEqual([COMPANY_LOOKUP_FEATURE])
  })

  it('never touches the database when the scope is missing', async () => {
    const { aiTools } = await import('../ai-tools')
    const [tool] = aiTools as unknown as Array<{ handler: (input: unknown, ctx: unknown) => Promise<unknown> }>
    const find = jest.fn()
    const context = { container: { resolve: () => ({ find }) } }
    await expect(tool.handler({}, context)).rejects.toThrow(/tenant- and organization-scoped/)
    expect(find).not.toHaveBeenCalled()
  })

  it('binds scope from the context, clamps the limit, and returns decrypted-looking records', async () => {
    const { aiTools } = await import('../ai-tools')
    const [tool] = aiTools as unknown as Array<{ handler: (input: unknown, ctx: unknown) => Promise<unknown> }>
    const find = jest.fn(async () => [{ id: 'c1', legalName: 'Acme GmbH', brandName: 'Acme' }])
    const context = {
      tenantId: 'ten-9',
      organizationId: 'org-9',
      container: { resolve: () => ({ find }) },
    }
    const result = (await tool.handler({ limit: MAX_LIMIT }, context)) as {
      companies: Array<{ id: string; name: string }>
      scope: { tenantId: string }
    }
    expect(find).toHaveBeenCalledTimes(1)
    // em.find(entity, where, options) — three arguments, the entity first.
    const [, where, options] = find.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
      { limit: number },
    ]
    expect(where).toMatchObject({ tenantId: 'ten-9', organizationId: 'org-9' })
    expect(options.limit).toBe(MAX_LIMIT)
    expect(result.companies[0]).toMatchObject({ id: 'c1', name: 'Acme' })
    expect(result.scope.tenantId).toBe('ten-9')
  })
})
