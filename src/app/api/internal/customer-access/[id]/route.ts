/**
 * Revoke one `customer_access` grant (soft delete).
 *
 *   DELETE /api/internal/customer-access/<id>
 *
 * Session + `customer_access.manage` required; the row must belong to the
 * caller's tenant/organization. Revoking is idempotent at the API level: an
 * already-revoked or unknown id is a 404. The next tool call re-reads grants,
 * so a revocation takes effect immediately.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { bootstrap } from '@/bootstrap-api'
import { createRequestCustomerAccessRepository } from '@/modules/customer_access/services/orm-repository'

bootstrap()

const logger = createLogger('customer_access')
const MANAGE_FEATURE = 'customer_access.manage'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function refusal(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: message, code }, { status })
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await getAuthFromRequest(req)
  if (!auth) return refusal(401, 'unauthorized', 'Unauthorized')
  const tenantId = auth.tenantId?.trim()
  const organizationId = auth.orgId?.trim()
  if (!tenantId || !organizationId) return refusal(403, 'scope_unavailable', 'Forbidden')

  const { id } = await context.params
  if (!UUID_RE.test(id)) return refusal(404, 'grant_not_found', 'Grant not found')

  try {
    const { createRequestContainer } = await import('@open-mercato/shared/lib/di/container')
    const container = await createRequestContainer()
    const rbac = container.resolve<RbacService>('rbacService')
    const allowed = await rbac.userHasAllFeatures(auth.sub, [MANAGE_FEATURE], { tenantId, organizationId })
    if (!allowed) return refusal(403, 'feature_denied', 'Forbidden')

    const repo = await createRequestCustomerAccessRepository()
    const revoked = await repo.revoke({ id, tenantId, organizationId, now: new Date().toISOString() })
    if (!revoked) return refusal(404, 'grant_not_found', 'Grant not found')
    return NextResponse.json({ grant: { id: revoked.id, revokedAt: revoked.revokedAt } })
  } catch (error) {
    logger.error('customer_access revoke failed', { err: error instanceof Error ? error.name : 'unknown' })
    return refusal(503, 'access_unavailable', 'Customer access is unavailable')
  }
}
