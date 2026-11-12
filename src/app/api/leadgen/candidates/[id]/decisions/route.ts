/**
 * POST /api/leadgen/candidates/<id>/decisions — human review.
 *
 * `decisionKey` makes a retry a replay; a second decision with another key on an
 * already-decided candidate is 409. A merge must name its target claim.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { bootstrap } from '@/bootstrap-api'
import { errorStatus, leadgenContext, refusal } from '@/modules/leadgen/lib/route-context'
import type { CandidateDecision } from '@/modules/leadgen/services/candidate-rules'

bootstrap()
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = await leadgenContext(req, 'leadgen.candidates.review')
  if (!ctx.ok) return ctx.response
  const { id } = await context.params
  if (!UUID_RE.test(id)) return refusal(404, 'candidate_not_found', 'Candidate not found')
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return refusal(400, 'invalid_body', 'Body must be JSON')
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const decision = record.decision
  const decisionKey = typeof record.decisionKey === 'string' ? record.decisionKey.trim() : ''
  if (decision !== 'approve' && decision !== 'reject' && decision !== 'merge') {
    return refusal(400, 'invalid_decision', 'decision must be approve, reject or merge')
  }
  if (decisionKey.length < 8) return refusal(400, 'invalid_decision_key', 'decisionKey is too short')
  const mergeTargetClaimId = typeof record.mergeTargetClaimId === 'string' ? record.mergeTargetClaimId : null
  if (decision === 'merge' && (!mergeTargetClaimId || !UUID_RE.test(mergeTargetClaimId))) {
    return refusal(400, 'merge_target_required', 'mergeTargetClaimId is required for merge')
  }
  const result = await ctx.value.service.decide({
    tenantId: ctx.value.auth.tenantId,
    organizationId: ctx.value.auth.organizationId,
    candidateId: id,
    decision: decision as CandidateDecision,
    decisionKey,
    actorUserId: ctx.value.auth.sub,
    mergeTargetClaimId,
    reasonCode: typeof record.reasonCode === 'string' ? record.reasonCode : null,
  })
  if (!result.ok) return refusal(errorStatus(result.code), result.code, result.code)
  return NextResponse.json({
    candidate: result.value.candidate,
    decision: result.value.decision,
    replayed: result.value.replayed,
  })
}
