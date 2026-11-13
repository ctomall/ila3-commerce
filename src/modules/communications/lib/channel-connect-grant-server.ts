import { getAuthFromCookies } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { canConnectTenantChannel } from './channel-connect-grant'

/**
 * Server-side resolution of the tenant connect grant for the two surfaces that
 * link to the wizard (channel list and inbox). Any auth/DI/RBAC failure closes
 * the link rather than rendering a control that cannot be used.
 */
export async function resolveCanConnectTenantChannel(): Promise<boolean> {
  try {
    const auth = await getAuthFromCookies()
    if (!auth?.sub) return false
    const container = await createRequestContainer()
    const rbac = container.resolve<RbacService>('rbacService')
    if (!rbac || typeof rbac.userHasAllFeatures !== 'function') return false
    return await canConnectTenantChannel((feature) =>
      rbac.userHasAllFeatures(auth.sub as string, [feature], {
        tenantId: auth.tenantId ?? null,
        organizationId: auth.orgId ?? null,
      }),
    )
  } catch {
    return false
  }
}
