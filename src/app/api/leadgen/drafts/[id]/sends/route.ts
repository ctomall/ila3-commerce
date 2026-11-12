/**
 * POST /api/leadgen/drafts/<id>/sends — dispatch one approved draft, once.
 *
 * The transport is the simulated one: it records the dispatch and reports
 * `externalEffect: false`. No provider is contacted and no message leaves this
 * host; a real adapter is a separate, separately authorized change. What is real
 * here is the token contract: one approval can produce at most one dispatch.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { bootstrap } from '@/bootstrap-api'
import { leadgenContext, refusal } from '@/modules/leadgen/lib/route-context'
import { createSendService, createSimulatedTransport } from '@/modules/leadgen/services/send-service'
import { createRequestSendRepository } from '@/modules/leadgen/services/send-repository'
import { createRequestSendGuards } from '@/modules/leadgen/services/send-guards'

bootstrap()
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const CONFLICT = new Set([
  'suppressed',
  'quota_lease_invalid',
  'quota_lease_scope_mismatch',
  'approval_not_approved',
  'approval_expired',
  'approval_revoked',
  'body_hash_mismatch',
  'draft_not_approved',
  'already_sent',
  'send_in_progress',
])

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = await leadgenContext(req, 'leadgen.sends.approve')
  if (!ctx.ok) return ctx.response
  const { id } = await context.params
  if (!UUID_RE.test(id)) return refusal(404, 'draft_not_found', 'Draft not found')
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return refusal(400, 'invalid_body', 'Body must be JSON')
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const approvalId = typeof record.approvalId === 'string' ? record.approvalId : ''
  if (!UUID_RE.test(approvalId)) return refusal(400, 'invalid_input', 'approvalId is required')
  const leaseToken = typeof record.leaseToken === 'string' && record.leaseToken.trim() ? record.leaseToken.trim() : undefined
  try {
    const repo = await createRequestSendRepository()
    const guards = await createRequestSendGuards()
    const service = createSendService({
      repo,
      guards,
      transport: createSimulatedTransport(),
      now: () => new Date().toISOString(),
      newId: () => crypto.randomUUID(),
    })
    const result = await service.dispatch({
      tenantId: ctx.value.auth.tenantId,
      organizationId: ctx.value.auth.organizationId,
      draftId: id,
      approvalId,
      leaseToken,
    })
    if (!result.ok) {
      const status =
        result.code === 'draft_not_found' || result.code === 'approval_not_found'
          ? 404
          : CONFLICT.has(result.code)
            ? 409
            : result.code === 'transport_failed'
              ? 502
              : 400
      return refusal(status, result.code, result.code)
    }
    return NextResponse.json(
      { send: result.send, replayed: result.replayed, transport: result.transport },
      { status: result.replayed ? 200 : 201 },
    )
  } catch {
    return refusal(503, 'store_unavailable', 'Lead storage is unavailable')
  }
}
