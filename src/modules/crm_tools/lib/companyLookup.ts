/**
 * Read-only company lookup core for the employee assistant (M4-3).
 *
 * Why this is a separate module from the tool declaration: the parts that can be wrong
 * in a dangerous way are all pure — does the scope come from the session or from the
 * model, is the SQL a read, are the parameters bound in the right order, can the limit be
 * inflated. Those are unit-testable without a database, an LLM or a running server.
 *
 * The rule this file exists to enforce (see `03-dsh-contract.md` §2): **scope never comes
 * from the model**. A `tenantId` / `organizationId` input field would let a
 * prompt-injected model address another tenant's rows, so the schema has no such field and
 * `requireToolScope` reads the ids off the runtime-supplied context only.
 */
import { z } from 'zod'

/** The feature that already exists in the customers ACL; the tool borrows it rather than inventing one. */
export const COMPANY_LOOKUP_FEATURE = 'customers.companies.view'

/** Hard cap. A model asking for 10 000 rows gets 20, not an error it can learn to out-argue. */
export const MAX_LIMIT = 20
export const DEFAULT_LIMIT = 5

export type ToolScope = {
  tenantId: string
  organizationId: string
}

export type ScopeContext = {
  tenantId?: unknown
  organizationId?: unknown
}

/**
 * Fail closed: no tenant or no organization means no query. Never falls back to "all".
 */
export function requireToolScope(context: ScopeContext): ToolScope {
  const tenantId = typeof context?.tenantId === 'string' ? context.tenantId.trim() : ''
  const organizationId = typeof context?.organizationId === 'string' ? context.organizationId.trim() : ''
  if (!tenantId || !organizationId) {
    throw new Error('[internal] crm tools require a tenant- and organization-scoped context')
  }
  return { tenantId, organizationId }
}

// `.strict()` on purpose: zod strips unknown keys by default, which would let a model
// believe a `tenantId` argument was accepted while it was silently dropped. Rejecting is
// louder and the model gets told it did something wrong.
export const findCompaniesInputSchema = z
  .object({
    // The model may only narrow the search; it cannot choose the tenant, the organization,
    // the table, the columns or the row count beyond MAX_LIMIT.
    query: z.string().trim().max(120).optional(),
    limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
  })
  .strict()

export type FindCompaniesInput = z.infer<typeof findCompaniesInputSchema>

export type CompanyRow = {
  id: string
  name: string
  domain: string | null
  websiteUrl: string | null
  industry: string | null
  sizeBucket: string | null
}

/**
 * What the handler asks the ORM for. A function rather than inline object literals so a
 * test can assert the scope binding and the limit cap without a database.
 *
 * Why the ORM and not a hand-written SELECT: `customer_companies` is encrypted at rest, and
 * the encryption is applied by the ORM layer. A raw `select` returns ciphertext — which is
 * exactly what the first version of this tool did, and what an end-to-end call against the
 * running app caught while every unit test was green.
 */
export type CompanyQuery = {
  where: Record<string, unknown>
  options: { limit: number; orderBy: Record<string, 'asc' | 'desc'> }
}

export function buildFindCompaniesQuery(scope: ToolScope, input: FindCompaniesInput): CompanyQuery {
  const trimmed = input.query?.trim() ?? ''
  const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT)
  const where: Record<string, unknown> = {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    // Soft deletion lives on the parent `customer_entities` row, not on this table, so a
    // company the CRM has deleted is still physically present here. Without this nested
    // filter the assistant would keep answering with deleted companies.
    entity: { deletedAt: null },
  }
  if (trimmed !== '') {
    const pattern = `%${trimmed}%`
    where.$or = [
      { legalName: { $ilike: pattern } },
      { brandName: { $ilike: pattern } },
      { domain: { $ilike: pattern } },
    ]
  }
  return { where, options: { limit, orderBy: { legalName: 'asc' } } }
}

/** Whatever the ORM hands back, narrowed to the fields this tool promises. */
export type CompanyRecordLike = {
  id?: unknown
  legalName?: unknown
  brandName?: unknown
  domain?: unknown
  websiteUrl?: unknown
  industry?: unknown
  sizeBucket?: unknown
}

/** Map ORM entities (already decrypted) to the declared result shape. */
export function shapeCompanyRecords(records: unknown): CompanyRow[] {
  if (!Array.isArray(records)) return []
  const out: CompanyRow[] = []
  for (const raw of records) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as CompanyRecordLike
    const id = typeof row.id === 'string' ? row.id : null
    const legalName = typeof row.legalName === 'string' ? row.legalName : ''
    const brandName = typeof row.brandName === 'string' ? row.brandName.trim() : ''
    const name = brandName !== '' ? brandName : legalName
    if (!id || name === '') continue
    out.push({
      id,
      name,
      domain: typeof row.domain === 'string' ? row.domain : null,
      websiteUrl: typeof row.websiteUrl === 'string' ? row.websiteUrl : null,
      industry: typeof row.industry === 'string' ? row.industry : null,
      sizeBucket: typeof row.sizeBucket === 'string' ? row.sizeBucket : null,
    })
  }
  return out
}
