/**
 * Customer data-scope resolution for the DSH tool bridge (C1/C).
 *
 * Three explicit modes, selected by `OM_DSH_CUSTOMER_SCOPE` (never by the
 * model's prompt):
 *
 *   organization  every company in the caller's organization (the CRM list
 *                 default; it is a tenant/organization boundary, NOT an
 *                 employee customer boundary).
 *   own           only rows whose `owner_user_id` is the caller.
 *   assigned      own rows plus live `customer_access` grants (`view` widens
 *                 reads, `edit` also widens writes).
 *
 * The mode is returned explicitly; an empty owner list is never used as a
 * stand-in for "assigned", so the query builder can tell "nothing visible"
 * apart from "not scoped".
 */
import type { CustomerScope, CustomerScopeResolver } from './authorize'

export const ORGANIZATION_CUSTOMER_SCOPE: CustomerScope = {
  mode: 'organization',
  ownerUserIds: [],
  grantedEntityIds: [],
  editableEntityIds: [],
}

/**
 * Production default until customer_access ships. Pure and side-effect free so
 * the route can inject it without a database round trip; the tenant and
 * organization are carried by the run token, not by this function.
 */
export const resolveOrganizationCustomerScope: CustomerScopeResolver = async () => ORGANIZATION_CUSTOMER_SCOPE

/**
 * Operator-selected scope for the bridge. `organization` stays the default
 * because that is the product's current list behaviour; `own` restricts every
 * company read to rows owned by the calling employee, which is the shape
 * `customer_access` will eventually resolve from data.
 *
 * The switch is explicit on purpose: flipping it changes what the assistant can
 * see, so it must never be inferred from the model's prompt.
 */
export const resolveConfiguredCustomerScope: CustomerScopeResolver = async ({ userId }) => {
  const mode = (process.env.OM_DSH_CUSTOMER_SCOPE ?? 'organization').trim().toLowerCase()
  if (mode === 'own') {
    return { mode: 'own', ownerUserIds: [userId], grantedEntityIds: [], editableEntityIds: [] }
  }
  return ORGANIZATION_CUSTOMER_SCOPE
}

/**
 * The database-backed resolver actually wired into the bridge.
 *
 * `assigned` reads the live grants on every call: a revocation therefore takes
 * effect on the next tool call, with no cache to invalidate. A repository
 * failure throws, and `authorizeToolCall` turns that into `scope_unavailable`
 * (fail closed) instead of narrowing to the organization.
 */
export const resolveLayeredCustomerScope: CustomerScopeResolver = async ({
  userId,
  tenantId,
  organizationId,
}) => {
  const mode = (process.env.OM_DSH_CUSTOMER_SCOPE ?? 'organization').trim().toLowerCase()
  if (mode === 'own') {
    return { mode: 'own', ownerUserIds: [userId], grantedEntityIds: [], editableEntityIds: [] }
  }
  if (mode !== 'assigned') return ORGANIZATION_CUSTOMER_SCOPE

  const { createRequestCustomerAccessRepository } = await import(
    '@/modules/customer_access/services/orm-repository'
  )
  const { toScopeLists } = await import('@/modules/customer_access/services/grants')
  const repository = await createRequestCustomerAccessRepository()
  const grants = await repository.listLive({ tenantId, organizationId, userId })
  const lists = toScopeLists(grants)
  return {
    mode: 'own',
    ownerUserIds: [userId],
    grantedEntityIds: lists.grantedEntityIds,
    editableEntityIds: lists.editableEntityIds,
  }
}
