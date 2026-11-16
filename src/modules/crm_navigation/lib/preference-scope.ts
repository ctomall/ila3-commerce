import type { NextRequest } from 'next/server'
import type { AuthContext } from '@open-mercato/shared/lib/auth/server'

/** Reuse the installed scope resolver; never trust selection cookies directly. */
export async function resolveNavigationPreferenceScope(req: NextRequest, auth: NonNullable<AuthContext>) {
  const { createRequestContainer } = await import('@open-mercato/shared/lib/di/container')
  const { resolveFeatureCheckContext } = await import('@open-mercato/core/modules/directory/utils/organizationScope')
  const container = await createRequestContainer()
  const { scope } = await resolveFeatureCheckContext({ container, auth, request: req })
  return { userId: auth.sub, tenantId: scope.tenantId ?? null, organizationId: scope.selectedId ?? null }
}
