/**
 * GET /api/leadgen/candidates/<id> — candidate detail.
 *
 * A candidate from another organization is 404, never 403 (contract §24).
 */
import { NextResponse, type NextRequest } from 'next/server'
import { bootstrap } from '@/bootstrap-api'
import { leadgenContext, refusal } from '@/modules/leadgen/lib/route-context'

bootstrap()
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = await leadgenContext(req, 'leadgen.candidates.view')
  if (!ctx.ok) return ctx.response
  const { id } = await context.params
  if (!UUID_RE.test(id)) return refusal(404, 'candidate_not_found', 'Candidate not found')
  try {
    const repository = await (
      await import('@/modules/leadgen/services/orm-repository')
    ).createRequestLeadgenRepository()
    const candidate = await repository.getCandidate({
      tenantId: ctx.value.auth.tenantId,
      organizationId: ctx.value.auth.organizationId,
      id,
    })
    if (!candidate) return refusal(404, 'candidate_not_found', 'Candidate not found')
    const verifications = await repository.listVerifications(candidate.id)
    return NextResponse.json({ candidate, verifications })
  } catch {
    return refusal(503, 'store_unavailable', 'Lead storage is unavailable')
  }
}
