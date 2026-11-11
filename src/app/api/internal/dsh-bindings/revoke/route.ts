/**
 * Revoke one employee's DSH assistant binding (C: revocation).
 *
 * The caller is an operator/admin acting through the CRM session; the target is
 * selected by `targetUserId` inside the caller's own tenant + organization. The
 * endpoint delegates to the run service/store, so the same `applyPrincipalRevoked`
 * contract used by the state machine flips the binding to `revoked` and moves
 * every in-flight run to `cancelled` in one transaction. The chat stream's
 * persisted pump then observes the terminal status within its 1 s poll window
 * and terminates the DSH subprocess.
 *
 * Authorization: the RBAC feature `dsh_runs.cancel`, checked through the live
 * `RbacService` per request. Role names are never used. There is no
 * self-service path here; a denied feature is 403.
 *
 * Contract:
 *   POST /api/internal/dsh-bindings/revoke  { targetUserId, reason? }
 *   404  persistence disabled (OM_DSH_PERSIST is not `orm`)
 *   401  no CRM session
 *   400  invalid body (targetUserId/reason)
 *   403  missing feature, or no tenant/organization scope
 *   404  no binding for (tenant, organization, targetUserId)
 *   200  { bindingId, revokedRuns }
 *   503  authorization or persistence unavailable
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { bootstrap } from '@/bootstrap-api'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { RunService } from '@/modules/dsh_runs/services/run-service'
import type { BindingRecord } from '@/modules/dsh_runs/services/run-store'

bootstrap()

const logger = createLogger('dsh_bindings.revoke')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CANCEL_FEATURE = 'dsh_runs.cancel'
const MAX_REASON_LENGTH = 200
/** Matches the identifier bound used by run-token claims and binding ids. */
const MAX_TARGET_USER_ID_LENGTH = 128

type RunServiceModule = {
  createRequestRunService: () => Promise<RunService>
}

async function resolveRunService(): Promise<RunService> {
  const mod = (await import('@/modules/dsh_runs/services/run-service')) as unknown as RunServiceModule
  if (typeof mod.createRequestRunService !== 'function') {
    throw new Error('dsh_runs service module does not export createRequestRunService()')
  }
  return mod.createRequestRunService()
}

async function resolveRbac(): Promise<RbacService> {
  const { createRequestContainer } = await import('@open-mercato/shared/lib/di/container')
  const container = await createRequestContainer()
  return container.resolve<RbacService>('rbacService')
}

function persistenceEnabled(): boolean {
  return (process.env.OM_DSH_PERSIST ?? '').trim().toLowerCase() === 'orm'
}

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

function availabilityError(message: string, code: string): NextResponse {
  return NextResponse.json({ error: message, code }, { status: 503 })
}

function invalidRequest(message: string): NextResponse {
  return NextResponse.json({ error: message, code: 'invalid_request' }, { status: 400 })
}

type ParsedBody = { targetUserId: string; reason?: string }

function parseBody(body: unknown): ParsedBody | { error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' }
  }
  const record = body as Record<string, unknown>
  const targetUserId = typeof record.targetUserId === 'string' ? record.targetUserId.trim() : ''
  if (targetUserId === '') return { error: 'targetUserId is required' }
  if (targetUserId.length > MAX_TARGET_USER_ID_LENGTH) {
    return { error: `targetUserId must be at most ${MAX_TARGET_USER_ID_LENGTH} characters` }
  }

  const rawReason = record.reason
  if (rawReason === undefined || rawReason === null) return { targetUserId }
  if (typeof rawReason !== 'string') return { error: 'reason must be a string when provided' }
  const reason = rawReason.trim()
  if (reason === '') return { targetUserId }
  if (reason.length > MAX_REASON_LENGTH) {
    return { error: `reason must be at most ${MAX_REASON_LENGTH} characters` }
  }
  return { targetUserId, reason }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!persistenceEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const auth = await getAuthFromRequest(req)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return invalidRequest('Request body must be valid JSON')
  }
  const parsed = parseBody(body)
  if ('error' in parsed) return invalidRequest(parsed.error)

  const tenantId = auth.tenantId?.trim() ?? ''
  const organizationId = auth.orgId?.trim() ?? ''
  if (!tenantId || !organizationId) {
    // RBAC and the binding lookup are both scoped; without a scope this is not
    // an authorization decision we can make, so refuse rather than guess.
    return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
  }

  let rbac: RbacService
  try {
    rbac = await resolveRbac()
  } catch (error) {
    logger.error('DSH binding revoke: RBAC unavailable', { err: error instanceof Error ? error.name : 'unknown' })
    return availabilityError('Authorization is unavailable', 'authorization_unavailable')
  }

  let allowed: boolean
  try {
    allowed = await rbac.userHasAllFeatures(auth.sub, [CANCEL_FEATURE], { tenantId, organizationId })
  } catch (error) {
    logger.error('DSH binding revoke: RBAC check failed', { err: error instanceof Error ? error.name : 'unknown' })
    return availabilityError('Authorization is unavailable', 'authorization_unavailable')
  }
  if (!allowed) {
    logger.info('DSH binding revoke: feature denied', { actorUserId: auth.sub })
    return NextResponse.json({ error: 'Forbidden', code: 'feature_denied' }, { status: 403 })
  }

  let service: RunService
  try {
    service = await resolveRunService()
  } catch (error) {
    logger.error('DSH binding revoke: persistence unavailable', { err: error instanceof Error ? error.name : 'unknown' })
    return availabilityError('DSH run persistence is unavailable', 'persistence_unavailable')
  }

  let binding: BindingRecord | null
  try {
    binding = await service.getBinding({ tenantId, organizationId, userId: parsed.targetUserId })
  } catch (error) {
    logger.error('DSH binding revoke: binding lookup failed', { err: error instanceof Error ? error.name : 'unknown' })
    return availabilityError('DSH run persistence is unavailable', 'persistence_unavailable')
  }
  if (!binding) {
    return NextResponse.json({ error: 'Binding not found', code: 'binding_not_found' }, { status: 404 })
  }

  try {
    const result = await service.revokeBinding(
      binding.id,
      parsed.reason === undefined ? {} : { reason: parsed.reason },
    )
    logger.info('DSH binding revoke: revoked', {
      actorUserId: auth.sub,
      targetUserId: parsed.targetUserId,
      bindingId: result.binding.id,
      revokedRuns: result.cancelled.length,
    })
    return NextResponse.json({
      bindingId: result.binding.id,
      revokedRuns: result.cancelled.length,
    })
  } catch (error) {
    if (errorCode(error) === 'binding-not-found') {
      return NextResponse.json({ error: 'Binding not found', code: 'binding_not_found' }, { status: 404 })
    }
    logger.error('DSH binding revoke: transition failed', {
      bindingId: binding.id,
      err: error instanceof Error ? error.name : 'unknown',
    })
    return availabilityError('DSH run persistence is unavailable', 'persistence_unavailable')
  }
}
