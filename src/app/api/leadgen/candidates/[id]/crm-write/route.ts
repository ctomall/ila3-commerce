/**
 * POST /api/leadgen/candidates/<id>/crm-write — idempotent CRM intake.
 *
 * Exactly one company is created per approved candidate: the status transition to
 * `writing` is the lock, `crm_entity_id` (and its partial unique index) is the
 * replay path, and a claim owned by another employee is a 409 that names only that
 * owner.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { bootstrap } from '@/bootstrap-api'
import { errorStatus, leadgenContext, refusal } from '@/modules/leadgen/lib/route-context'

bootstrap()
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = await leadgenContext(req, 'leadgen.crm.write')
  if (!ctx.ok) return ctx.response
  const { id } = await context.params
  if (!UUID_RE.test(id)) return refusal(404, 'candidate_not_found', 'Candidate not found')
  const result = await ctx.value.service.crmWrite({
    tenantId: ctx.value.auth.tenantId,
    organizationId: ctx.value.auth.organizationId,
    candidateId: id,
    actorUserId: ctx.value.auth.sub,
  })
  if (!result.ok) {
    return refusal(errorStatus(result.code), result.code, result.code, result.extra)
  }
  return NextResponse.json(result.value, { status: result.value.created ? 201 : 200 })
}
