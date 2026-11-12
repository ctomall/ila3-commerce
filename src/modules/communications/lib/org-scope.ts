/**
 * NULL-inclusive organization scope for app-owned queries.
 *
 * Rows with `organization_id IS NULL` are tenant-wide and must stay visible to an
 * organization-scoped caller. The obvious filter is wrong:
 *
 *   { organizationId: { $in: [organizationId, null] } }   // ← drops NULL rows
 *
 * because SQL `IN ('org', NULL)` never matches NULL. The installed hub encodes the
 * same rule as an explicit `$or` (`channelOrgScopeWhere`); this helper is the
 * equivalent for entities the app queries directly (messages, dead letters).
 * The real-DB suite for internal notes is what caught the mistake.
 *
 * No organization returns `{ organizationId: null }` (tenant-wide rows only), not
 * an empty filter: a session without a selected organization must not read every
 * organization in the tenant.
 */
export function nullInclusiveOrgWhere(
  organizationId: string | null | undefined,
): Record<string, unknown> {
  // No organization means "only tenant-wide rows", matching the installed hub's
  // channel scope. Returning `{}` here would widen a session without a selected
  // organization to every organization in the tenant.
  if (!organizationId) return { organizationId: null }
  return { $or: [{ organizationId }, { organizationId: null }] }
}
