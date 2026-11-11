/**
 * `crm.find_companies` over the DSH tool bridge (C1).
 *
 * Reuses the existing read-only lookup (`src/modules/crm_tools/lib/companyLookup.ts`)
 * instead of re-implementing the query, and adds the one thing the tool
 * declaration could not enforce on its own: the caller's customer scope.
 *
 * Invariants:
 *   - tenantId/organizationId come from the run token, never from the model's
 *     input (the input schema is `.strict()`, so such fields are rejected);
 *   - the customer scope is ANDed with the tenant/organization/soft-delete
 *     filter, not merged as an OR;
 *   - only the minimal projection is selected;
 *   - the result is capped at MAX_LIMIT (20) even if a caller bypasses the
 *     schema and the query builder's clamp.
 */
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { CustomerCompanyProfile } from '@open-mercato/core/modules/customers/data/entities'
import {
  buildFindCompaniesQuery,
  DEFAULT_LIMIT,
  filterByQuery,
  findCompaniesInputSchema,
  MAX_LIMIT,
  requireToolScope,
  shapeCompanyRecords,
  type CompanyRow,
} from '@/modules/crm_tools/lib/companyLookup'
import type { CustomerScope } from './authorize'
import type { RunTokenClaims } from './run-token'

export const FIND_COMPANIES_TOOL = 'crm.find_companies'

/** Minimum projection: no revenue, timestamps or relation objects leave the ORM. */
const COMPANY_FIELDS = [
  'id',
  'legalName',
  'brandName',
  'domain',
  'websiteUrl',
  'industry',
  'sizeBucket',
] as const

export type FindCompaniesContext = {
  em: EntityManager
  claims: RunTokenClaims
  scope: CustomerScope
}

export type FindCompaniesResult = {
  companies: CompanyRow[]
  scanned: number
  scope: { mode: CustomerScope['mode']; tenantId: string; organizationId: string }
  note: string
}

/**
 * Add the customer scope to the already-ANDed base filter.
 *
 * Owner-scoped access is expressed through the parent `CustomerEntity`
 * (`CustomerCompanyProfile` has no owner column), so it nests under `entity`
 * next to the soft-delete condition rather than replacing it.
 */
export function withCustomerScope(
  where: Record<string, unknown>,
  scope: CustomerScope,
): Record<string, unknown> {
  const entity: Record<string, unknown> = {
    deletedAt: null,
    ...((where.entity as Record<string, unknown> | undefined) ?? {}),
  }
  if (scope.mode === 'own') entity.ownerUserId = { $in: [...scope.ownerUserIds] }
  return { ...where, entity }
}

export async function findCompanies(
  input: unknown,
  context: FindCompaniesContext,
): Promise<FindCompaniesResult> {
  const parsed = findCompaniesInputSchema.parse(input ?? {})
  const scope = requireToolScope({
    tenantId: context.claims.tenantId,
    organizationId: context.claims.organizationId,
  })
  const query = buildFindCompaniesQuery(scope, parsed)
  const limit = Math.min(parsed.limit ?? DEFAULT_LIMIT, MAX_LIMIT)
  const resultScope = {
    mode: context.scope.mode,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  }
  const note =
    context.scope.mode === 'own'
      ? '只读查询；结果限定为调用者本人负责的客户'
      : '只读查询；结果限定为调用者所在组织（组织隔离≠员工客户隔离）'

  // `own` with no owner ids means "this employee may see no customers"; do not
  // run a query with an empty $in and do not fall back to the organization.
  if (context.scope.mode === 'own' && context.scope.ownerUserIds.length === 0) {
    return { companies: [], scanned: 0, scope: resultScope, note }
  }

  const where = withCustomerScope(query.where, context.scope)
  // Through the ORM: the columns are encrypted at rest and the ORM decrypts
  // them; a raw SELECT would hand the model ciphertext.
  // No `fields` projection here: company names/domains are encrypted at rest
  // through custom types, and a column projection bypasses hydration, handing
  // the model ciphertext. Load the entity and reduce it to COMPANY_FIELDS only
  // after decryption has happened server-side.
  const records = await context.em.find(
    CustomerCompanyProfile,
    where as FilterQuery<CustomerCompanyProfile>,
    query.options,
  )
  const shaped = shapeCompanyRecords(records)

  // The search is a literal, case-insensitive substring match over decrypted
  // fields. There is no SQL LIKE here, so `%`, `_` and `\` are ordinary
  // characters and cannot widen the match; the 120-character cap is enforced by
  // the schema. (A LIKE-based search would need explicit escaping instead.)
  const companies = filterByQuery(shaped, parsed.query).slice(0, limit)

  return { companies, scanned: shaped.length, scope: resultScope, note }
}
