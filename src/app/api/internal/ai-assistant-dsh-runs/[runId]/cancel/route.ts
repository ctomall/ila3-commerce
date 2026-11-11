/**
 * Cancel one persisted DSH run (C: 10-second revocation window).
 *
 * This is the user-initiated path: the browser asks the CRM to cancel a run it
 * owns, the row becomes terminal (`cancelled`, reason `user_cancelled`), and the
 * chat stream's persisted pump observes that on its next poll and terminates
 * the DSH subprocess. The endpoint itself never spawns or signals anything.
 *
 * Contract:
 *   POST /api/internal/ai-assistant-dsh-runs/<runId>/cancel
 *   404  persistence disabled (OM_DSH_PERSIST is not `orm`) or unknown run
 *   401  no CRM session
 *   403  run belongs to another employee
 *   200  { runId, status } — terminal runs are an idempotent success
 *   503  repository failure / persistence unavailable
 *
 * Ownership is decided from the server session only; a body field can never
 * select another employee's run.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { bootstrap } from '@/bootstrap-api'
import type { RunService } from '@/modules/dsh_runs/services/run-service'
import type { RunRecord } from '@/modules/dsh_runs/services/run-store'

// Static app routes bypass the `/api/[...slug]` catch-all.
bootstrap()

const logger = createLogger('ai_assistant.dsh.cancel')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'budget_exhausted', 'expired'])

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

function persistenceEnabled(): boolean {
  return (process.env.OM_DSH_PERSIST ?? '').trim().toLowerCase() === 'orm'
}

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

function persistenceUnavailable(): NextResponse {
  return NextResponse.json(
    { error: 'DSH run persistence is unavailable', code: 'persistence_unavailable' },
    { status: 503 },
  )
}

function runNotFound(): NextResponse {
  return NextResponse.json({ error: 'Run not found', code: 'run_not_found' }, { status: 404 })
}

function forbidden(): NextResponse {
  return NextResponse.json({ error: 'Forbidden', code: 'run_forbidden' }, { status: 403 })
}

type AuthContext = NonNullable<Awaited<ReturnType<typeof getAuthFromRequest>>>

/**
 * The run row is the authority. `userId` is the requirement; tenant and
 * organization are additionally checked when the session carries them so a
 * leaked run id from another tenant cannot be cancelled by guessing.
 */
function ownsRun(run: RunRecord, auth: AuthContext): boolean {
  if (run.userId !== auth.sub) return false
  if (auth.tenantId && run.tenantId !== auth.tenantId) return false
  if (auth.orgId && run.organizationId !== auth.orgId) return false
  return true
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ runId: string }> },
): Promise<NextResponse> {
  if (!persistenceEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const auth = await getAuthFromRequest(req)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { runId } = await context.params

  let service: RunService
  try {
    service = await resolveRunService()
  } catch (error) {
    logger.error('DSH run cancel: persistence unavailable', { err: error instanceof Error ? error.name : 'unknown' })
    return persistenceUnavailable()
  }

  let run: RunRecord | null
  try {
    run = await service.getRun(runId)
  } catch (error) {
    logger.error('DSH run cancel: run lookup failed', {
      runId,
      err: error instanceof Error ? error.name : 'unknown',
    })
    return persistenceUnavailable()
  }

  if (!run) return runNotFound()
  if (!ownsRun(run, auth)) {
    logger.info('DSH run cancel: forbidden', { runId })
    return forbidden()
  }

  // Terminal runs are immutable; cancelling one is a successful no-op.
  if (TERMINAL_STATUSES.has(run.status)) {
    return NextResponse.json({ runId: run.id, status: run.status })
  }

  let cancelled: RunRecord
  try {
    cancelled = await service.cancel(run.id, 'user_cancelled')
  } catch (error) {
    if (errorCode(error) === 'run-not-found') return runNotFound()
    logger.error('DSH run cancel: transition failed', {
      runId: run.id,
      err: error instanceof Error ? error.name : 'unknown',
    })
    return persistenceUnavailable()
  }

  // The store can hand back the pre-transition row when the update raced; the
  // browser must see the settled status, not a stale 'running'.
  let status = cancelled.status
  if (status !== 'cancelled') {
    try {
      status = (await service.getRun(cancelled.id))?.status ?? status
    } catch {
      // Keep the transition result; the row is already terminal.
    }
  }
  logger.info('DSH run cancel: cancelled', { runId: cancelled.id, status })
  return NextResponse.json({ runId: cancelled.id, status })
}
