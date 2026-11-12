/**
 * GET /api/leadgen/candidates — organization-scoped review queue.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { bootstrap } from '@/bootstrap-api'
import { leadgenContext, refusal } from '@/modules/leadgen/lib/route-context'
import type { CandidateStatus } from '@/modules/leadgen/services/candidate-rules'

bootstrap()
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUSES: readonly CandidateStatus[] = [
  'submitted', 'needs_review', 'approved', 'rejected', 'merged', 'writing_crm', 'crm_written', 'failed',
]

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await leadgenContext(req, 'leadgen.candidates.view')
  if (!ctx.ok) return ctx.response
  const statusParam = req.nextUrl.searchParams.get('status')?.trim() ?? ''
  if (statusParam && !STATUSES.includes(statusParam as CandidateStatus)) {
    return refusal(400, 'invalid_status', 'Unknown candidate status')
  }
  const limitRaw = Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '', 10)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 25
  const cursor = req.nextUrl.searchParams.get('cursor')
  try {
    const repository = await (
      await import('@/modules/leadgen/services/orm-repository')
    ).createRequestLeadgenRepository()
    const items = await repository.listCandidates({
      tenantId: ctx.value.auth.tenantId,
      organizationId: ctx.value.auth.organizationId,
      status: statusParam ? (statusParam as CandidateStatus) : undefined,
      cursor,
      limit,
    })
    const nextCursor = items.length === limit ? items[items.length - 1]?.createdAt ?? null : null
    return NextResponse.json({ items, nextCursor })
  } catch {
    return refusal(503, 'store_unavailable', 'Lead storage is unavailable')
  }
}
