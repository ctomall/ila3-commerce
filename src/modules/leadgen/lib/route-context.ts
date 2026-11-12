/**
 * Shared request context for the leadgen API.
 *
 * Identity (tenant/organization/user) comes from the session only; the feature id
 * is a real `leadgen.*` ACL entry, checked through the live RBAC service. Routes
 * never read tenant/organization from the body.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { createLeadgenService, type LeadgenService } from '../services/leadgen-service'
import { createRequestLeadgenRepository } from '../services/orm-repository'

export type LeadgenContext = {
  auth: { sub: string; tenantId: string; organizationId: string }
  service: LeadgenService
}

export function refusal(status: number, code: string, message: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: message, code, ...(extra ?? {}) }, { status })
}

export async function leadgenContext(
  req: NextRequest,
  feature: string,
): Promise<{ ok: true; value: LeadgenContext } | { ok: false; response: NextResponse }> {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub) return { ok: false, response: refusal(401, 'unauthorized', 'Unauthorized') }
  const tenantId = auth.tenantId?.trim()
  const organizationId = auth.orgId?.trim()
  if (!tenantId || !organizationId) {
    return { ok: false, response: refusal(403, 'scope_unavailable', 'Forbidden') }
  }
  try {
    const { createRequestContainer } = await import('@open-mercato/shared/lib/di/container')
    const container = await createRequestContainer()
    const rbac = container.resolve<RbacService>('rbacService')
    const allowed = await rbac.userHasAllFeatures(auth.sub, [feature], { tenantId, organizationId })
    if (!allowed) return { ok: false, response: refusal(403, 'feature_denied', 'Forbidden') }
  } catch {
    return { ok: false, response: refusal(503, 'authorization_unavailable', 'Authorization is unavailable') }
  }
  let repository
  try {
    repository = await createRequestLeadgenRepository()
  } catch {
    return { ok: false, response: refusal(503, 'store_unavailable', 'Lead storage is unavailable') }
  }
  const service = createLeadgenService({ repo: repository, now: () => new Date().toISOString(), newId: () => randomUUID() })
  return { ok: true, value: { auth: { sub: auth.sub, tenantId, organizationId }, service } }
}

export function errorStatus(code: string): number {
  if (code === 'candidate_not_found' || code === 'run_not_found') return 404
  if (code === 'invalid_input') return 400
  if (code === 'merge_target_required') return 400
  if (code === 'claim_conflict' || code === 'already_decided' || code === 'write_in_progress') return 409
  if (code === 'not_approved') return 409
  if (code === 'crm_write_failed') return 502
  return 500
}
