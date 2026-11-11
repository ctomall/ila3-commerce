import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { canReply } from './reply-permission'

/**
 * Server-side reply authorization shared by the send route and the inbox page.
 *
 * The route must deny a send before any side effect; the page must not render a
 * composer the caller cannot use. Both resolve the same two grants through the
 * same rbac service, and both fail closed if authorization cannot be evaluated.
 */
export type ReplyActor = {
  sub?: string | null
  tenantId?: string | null
  orgId?: string | null
}

export type ReplyContainer = {
  resolve<T>(name: string): T
}

export async function canActorReply(
  auth: ReplyActor | null | undefined,
  container: ReplyContainer,
  options: { organizationId?: string | null } = {},
): Promise<boolean> {
  if (!auth?.sub) return false
  try {
    const rbac = container.resolve<RbacService>('rbacService')
    if (!rbac || typeof rbac.userHasAllFeatures !== 'function') return false
    const featureContext = {
      tenantId: auth.tenantId ?? null,
      organizationId: options.organizationId ?? auth.orgId ?? null,
    }
    const check = async (feature: string): Promise<boolean> => {
      try {
        return await rbac.userHasAllFeatures(auth.sub as string, [feature], featureContext)
      } catch {
        return false
      }
    }
    return await canReply(check)
  } catch {
    return false
  }
}
