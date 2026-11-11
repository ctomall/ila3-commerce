/**
 * Decide one DSH write approval.
 *
 * POST /api/internal/dsh-write-approvals/<id> { decision: 'approve' | 'reject' }
 *   200 { approval }           approved or rejected by its owner
 *   400 invalid decision
 *   401 no CRM session
 *   403 not this employee's approval / binding revoked / not pending
 *   404 unknown approval
 *   410 the request expired before the decision
 *   503 approval store unavailable
 *
 * Ownership and tenant/organization come from the session only. The request
 * body can select a decision, never an approver or another employee's row.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { bootstrap } from '@/bootstrap-api'
import {
  ApprovalUnavailableError,
  createRequestApprovalStore,
} from '@/modules/dsh_approvals/services/orm-repository'

bootstrap()

const logger = createLogger('dsh.approvals')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function refusal(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: message, code }, { status })
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await getAuthFromRequest(req)
  if (!auth) return refusal(401, 'unauthorized', 'Unauthorized')

  const { id } = await context.params
  if (!UUID_RE.test(id)) return refusal(404, 'approval_not_found', 'Approval not found')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return refusal(400, 'invalid_decision', 'Body must be JSON')
  }
  const decision =
    typeof body === 'object' && body !== null
      ? (body as { decision?: unknown }).decision
      : undefined
  if (decision !== 'approve' && decision !== 'reject') {
    return refusal(400, 'invalid_decision', 'decision must be approve or reject')
  }

  try {
    const store = await createRequestApprovalStore()
    const outcome = await store.decide({
      id,
      userId: auth.sub,
      tenantId: auth.tenantId ?? null,
      organizationId: auth.orgId ?? null,
      decision,
      now: new Date().toISOString(),
    })
    if (!outcome.ok) {
      logger.info('dsh approval decision refused', { approvalId: id, code: outcome.code })
      switch (outcome.code) {
        case 'approval_not_found':
          return refusal(404, outcome.code, 'Approval not found')
        case 'approval_forbidden':
          return refusal(403, outcome.code, 'Forbidden')
        case 'approval_expired':
          return refusal(410, outcome.code, 'This approval request expired')
        case 'binding_inactive':
          return refusal(403, outcome.code, 'Assistant binding is not active')
        case 'approval_not_pending':
          return refusal(403, outcome.code, 'This approval is not pending')
      }
    }
    return NextResponse.json({
      approval: {
        id: outcome.approval.id,
        tool: outcome.approval.tool,
        summary: outcome.approval.argsPreview,
        status: outcome.approval.status,
        decidedAt: outcome.approval.decidedAt,
        expiresAt: outcome.approval.expiresAt,
      },
    })
  } catch (error) {
    if (!(error instanceof ApprovalUnavailableError)) {
      logger.error('dsh approval decide failed', {
        approvalId: id,
        err: error instanceof Error ? error.name : 'unknown',
      })
    }
    return refusal(503, 'approval_unavailable', 'Write approval is unavailable')
  }
}
