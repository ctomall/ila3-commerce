/**
 * Admin surface for `customer_access` grants.
 *
 *   GET  /api/internal/customer-access?userId=<uuid>
 *        -> { grants: [{ id, userId, customerEntityId, accessLevel, createdAt }] }
 *   POST /api/internal/customer-access { userId, customerEntityId, accessLevel }
 *        -> { grant }
 *
 * Both require a CRM session and the real RBAC feature
 * `customer_access.manage`; tenant/organization come from the session, never
 * from the body. A grant only widens what the *target employee's* assistant can
 * read/write under `OM_DSH_CUSTOMER_SCOPE=assigned`; it never changes ownership.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { bootstrap } from '@/bootstrap-api'
import { isAccessLevel } from '@/modules/customer_access/services/grants'
import {
  createRequestCustomerAccessRepository,
  type CustomerAccessRepository,
} from '@/modules/customer_access/services/orm-repository'

bootstrap()

const logger = createLogger('customer_access')
const MANAGE_FEATURE = 'customer_access.manage'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AuthContext = NonNullable<Awaited<ReturnType<typeof getAuthFromRequest>>>

function refusal(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: message, code }, { status })
}

async function authorize(auth: AuthContext): Promise<NextResponse | null> {
  const tenantId = auth.tenantId?.trim()
  const organizationId = auth.orgId?.trim()
  if (!tenantId || !organizationId) return refusal(403, 'scope_unavailable', 'Forbidden')
  const { createRequestContainer } = await import('@open-mercato/shared/lib/di/container')
  const container = await createRequestContainer()
  const rbac = container.resolve<RbacService>('rbacService')
  const allowed = await rbac.userHasAllFeatures(auth.sub, [MANAGE_FEATURE], { tenantId, organizationId })
  return allowed ? null : refusal(403, 'feature_denied', 'Forbidden')
}

async function repository(): Promise<CustomerAccessRepository | null> {
  try {
    return await createRequestCustomerAccessRepository()
  } catch (error) {
    logger.error('customer_access repository unavailable', {
      err: error instanceof Error ? error.name : 'unknown',
    })
    return null
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await getAuthFromRequest(req)
  if (!auth) return refusal(401, 'unauthorized', 'Unauthorized')
  const denied = await authorize(auth)
  if (denied) return denied
  const userId = req.nextUrl.searchParams.get('userId')?.trim() ?? ''
  if (!UUID_RE.test(userId)) return refusal(400, 'invalid_user_id', 'userId must be a UUID')
  const repo = await repository()
  if (!repo) return refusal(503, 'access_unavailable', 'Customer access is unavailable')
  const grants = await repo.listLive({
    tenantId: auth.tenantId!,
    organizationId: auth.orgId!,
    userId,
  })
  return NextResponse.json({
    grants: grants.map((grant) => ({
      id: grant.id,
      userId: grant.userId,
      customerEntityId: grant.customerEntityId,
      accessLevel: grant.accessLevel,
      createdAt: grant.createdAt,
    })),
  })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await getAuthFromRequest(req)
  if (!auth) return refusal(401, 'unauthorized', 'Unauthorized')
  const denied = await authorize(auth)
  if (denied) return denied
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return refusal(400, 'invalid_body', 'Body must be JSON')
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const userId = typeof record.userId === 'string' ? record.userId.trim() : ''
  const customerEntityId = typeof record.customerEntityId === 'string' ? record.customerEntityId.trim() : ''
  const accessLevel = record.accessLevel
  if (!UUID_RE.test(userId) || !UUID_RE.test(customerEntityId)) {
    return refusal(400, 'invalid_input', 'userId and customerEntityId must be UUIDs')
  }
  if (!isAccessLevel(accessLevel)) return refusal(400, 'invalid_access_level', 'accessLevel must be view or edit')
  const repo = await repository()
  if (!repo) return refusal(503, 'access_unavailable', 'Customer access is unavailable')
  try {
    const grant = await repo.upsert({
      tenantId: auth.tenantId!,
      organizationId: auth.orgId!,
      userId,
      customerEntityId,
      accessLevel,
      grantedBy: auth.sub,
      now: new Date().toISOString(),
    })
    return NextResponse.json({ grant })
  } catch (error) {
    logger.error('customer_access grant failed', { err: error instanceof Error ? error.name : 'unknown' })
    return refusal(503, 'access_unavailable', 'Customer access is unavailable')
  }
}
