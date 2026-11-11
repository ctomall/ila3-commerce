/**
 * Customer data-scope resolution for the DSH tool bridge (C1).
 *
 * `customer_access` does not exist in this schema yet. Until it ships, the only
 * truthful scope the bridge can enforce is the organization: every employee in
 * the caller's organization sees the same organization-wide company set that
 * the CRM list endpoints show them.
 *
 * This is a real boundary (tenant + organization + soft-delete are all applied)
 * but it is NOT an employee-level customer boundary:
 *
 *   组织隔离 ≠ 员工客户隔离
 *
 * When `customer_access` lands, `resolveCustomerScope` must return
 * `{ mode: 'own', ownerUserIds }` for employees whose access is owner-scoped,
 * and this default must not be used for them. Until then the mode is explicit
 * (`'organization'`) rather than an empty owner list that could be mistaken for
 * "own, with nothing visible".
 */
import type { CustomerScope, CustomerScopeResolver } from './authorize'

export const ORGANIZATION_CUSTOMER_SCOPE: CustomerScope = {
  mode: 'organization',
  ownerUserIds: [],
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
  if (mode === 'own') return { mode: 'own', ownerUserIds: [userId] }
  return ORGANIZATION_CUSTOMER_SCOPE
}
