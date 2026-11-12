/**
 * POST /api/leadgen/drafts/<id>/approvals — approve/reject one exact body.
 *
 * The approval is bound to `draftHash`: a body changed after review fails with
 * `body_hash_mismatch`. No email is sent here; sending stays behind its own
 * authorization.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { bootstrap } from '@/bootstrap-api'
import { leadgenContext, refusal } from '@/modules/leadgen/lib/route-context'
import { createOutreachService } from '@/modules/leadgen/services/outreach-service'
import { createRequestOutreachRepository } from '@/modules/leadgen/services/outreach-repository'

bootstrap()
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
  const draftHash = typeof record.draftHash === 'string' ? record.draftHash : ''
  const decision = record.decision === 'rejected' ? 'rejected' : record.decision === 'approved' ? 'approved' : null
  if (!decision || !draftHash) return refusal(400, 'invalid_input', 'decision and draftHash are required')
  try {
    const repo = await createRequestOutreachRepository()
    const service = createOutreachService({ repo, now: () => new Date().toISOString(), newId: () => crypto.randomUUID(), approvalTtlMs: 24 * 3600 * 1000 })
    // Server-derived idempotency key: the client cannot choose it and replay a
    // different approval under the same key.
    const idempotencyKey = `approve:${id}:${draftHash}:${ctx.value.auth.sub}`
    const result = await service.approveDraft({
      tenantId: ctx.value.auth.tenantId,
      organizationId: ctx.value.auth.organizationId,
      draftId: id,
      draftHash,
      approverUserId: ctx.value.auth.sub,
      idempotencyKey,
      decision,
    })
    if (!result.ok) {
      const status =
        result.code === 'draft_not_found'
          ? 404
          : result.code === 'body_hash_mismatch' || result.code === 'already_decided'
            ? 409
            : 400
      return refusal(status, result.code, result.code)
    }
    return NextResponse.json(
      { approval: result.value.approval, replayed: result.value.replayed },
      { status: result.value.replayed ? 200 : 201 },
    )
  } catch {
    return refusal(503, 'store_unavailable', 'Lead storage is unavailable')
  }
}
