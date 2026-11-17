import type { AuthContext } from '@open-mercato/shared/lib/auth/server'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'

/** Static rewritten routes bypass module metadata; enforce the same feature explicitly. */
export async function checkAiAccess(auth: NonNullable<AuthContext>): Promise<'allowed' | 'denied' | 'unavailable'> {
  try {
    const { createRequestContainer } = await import('@open-mercato/shared/lib/di/container')
    const container = await createRequestContainer()
    const rbac = container.resolve<RbacService>('rbacService')
    const allowed = await rbac.userHasAllFeatures(auth.sub, ['ai_assistant.view'], {
      tenantId: auth.tenantId ?? null,
      organizationId: auth.orgId ?? null,
    })
    return allowed ? 'allowed' : 'denied'
  } catch {
    return 'unavailable'
  }
}
