import type { NextRequest } from 'next/server'
import type { AuthContext } from '@open-mercato/shared/lib/auth/server'

export type WorkspaceScope = { userId: string; tenantId: string; organizationId: string }

/**
 * Derive the organization the request is acting in from the installed scope
 * resolver — never from a body field. Returns null when the caller is in an
 * all-organizations selection, because a layout or a preference must belong to
 * exactly one organization.
 */
export async function resolveWorkspaceScope(
  req: NextRequest,
  auth: NonNullable<AuthContext>,
): Promise<WorkspaceScope | null> {
  const { createRequestContainer } = await import('@open-mercato/shared/lib/di/container')
  const { resolveFeatureCheckContext } = await import('@open-mercato/core/modules/directory/utils/organizationScope')
  const container = await createRequestContainer()
  const { scope } = await resolveFeatureCheckContext({ container, auth, request: req })
  const tenantId = scope.tenantId ?? null
  const organizationId = scope.selectedId ?? null
  if (!tenantId || !organizationId || !auth.sub) return null
  return { userId: String(auth.sub), tenantId: String(tenantId), organizationId: String(organizationId) }
}
