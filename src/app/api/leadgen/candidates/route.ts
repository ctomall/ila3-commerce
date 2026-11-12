/**
 * GET  /api/leadgen/candidates — organization-scoped review queue.
 * POST /api/leadgen/candidates — submit one researched candidate.
 *
 * Submission is additive to the 14-path draft (which has no candidate POST): a
 * research run produces candidates and this is the internal entry that stores
 * them with their evidence. The run must belong to the caller's organization;
 * tenant/organization never come from the body.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { bootstrap } from '@/bootstrap-api'
import { errorStatus, leadgenContext, refusal } from '@/modules/leadgen/lib/route-context'
import type { CandidateStatus } from '@/modules/leadgen/services/candidate-rules'

bootstrap()
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUSES: readonly CandidateStatus[] = [
  'submitted', 'needs_review', 'approved', 'rejected', 'merged', 'writing_crm', 'crm_written', 'failed',
]
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await leadgenContext(req, 'leadgen.candidates.review')
  if (!ctx.ok) return ctx.response
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return refusal(400, 'invalid_body', 'Body must be JSON')
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const runId = typeof record.runId === 'string' ? record.runId.trim() : ''
  const companyName = typeof record.companyName === 'string' ? record.companyName.trim() : ''
  if (!UUID_RE.test(runId) || !companyName) {
    return refusal(400, 'invalid_input', 'runId (uuid) and companyName are required')
  }
  const evidenceRaw = Array.isArray(record.evidence) ? record.evidence : []
  const evidence = evidenceRaw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      url: typeof item.url === 'string' ? item.url : '',
      fetchedAt: typeof item.fetchedAt === 'string' ? item.fetchedAt : new Date().toISOString(),
      contentHash: typeof item.contentHash === 'string' ? item.contentHash : '',
      fields: item.fields && typeof item.fields === 'object' ? (item.fields as Record<string, string>) : null,
      excerpt: typeof item.excerpt === 'string' ? item.excerpt : null,
    }))
    .filter((item) => item.url && item.contentHash)
  const result = await ctx.value.service.submitCandidate({
    tenantId: ctx.value.auth.tenantId,
    organizationId: ctx.value.auth.organizationId,
    runId,
    companyName,
    domain: typeof record.domain === 'string' ? record.domain : null,
    country: typeof record.country === 'string' ? record.country : null,
    contactName: typeof record.contactName === 'string' ? record.contactName : null,
    contactTitle: typeof record.contactTitle === 'string' ? record.contactTitle : null,
    contactEmail: typeof record.contactEmail === 'string' ? record.contactEmail : null,
    sourceUrl: typeof record.sourceUrl === 'string' ? record.sourceUrl : null,
    evidence,
  })
  if (!result.ok) return refusal(errorStatus(result.code), result.code, result.code)
  return NextResponse.json({ candidate: result.value.candidate, created: result.value.created }, { status: result.value.created ? 201 : 200 })
}
