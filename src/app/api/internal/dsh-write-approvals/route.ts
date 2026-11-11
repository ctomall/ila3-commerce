/**
 * Pending DSH write approvals for the signed-in employee.
 *
 * GET /api/internal/dsh-write-approvals
 *   200 { approvals: [{ id, tool, summary, requestedAt, expiresAt, runId }] }
 *   401 no CRM session
 *   503 approval store unavailable (fail closed; never an empty "nothing to
 *       approve" answer that hides a broken gate)
 *
 * The list is scoped by the session user AND tenant/organization; a row for
 * another employee can never appear here even if its id is known.
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const store = await createRequestApprovalStore()
    const approvals = await store.listPending({
      userId: auth.sub,
      tenantId: auth.tenantId ?? null,
      organizationId: auth.orgId ?? null,
      now: new Date().toISOString(),
      limit: 50,
    })
    return NextResponse.json({
      approvals: approvals.map((approval) => ({
        id: approval.id,
        tool: approval.tool,
        summary: approval.argsPreview,
        requestedAt: approval.requestedAt,
        expiresAt: approval.expiresAt,
        runId: approval.runId,
      })),
    })
  } catch (error) {
    if (!(error instanceof ApprovalUnavailableError)) {
      logger.error('dsh approvals list failed', {
        err: error instanceof Error ? error.name : 'unknown',
      })
    }
    return NextResponse.json(
      { error: 'Write approval is unavailable', code: 'approval_unavailable' },
      { status: 503 },
    )
  }
}
