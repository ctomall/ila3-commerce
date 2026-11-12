/**
 * POST /api/leadgen/candidates/<id>/verify — deterministic verification.
 *
 * The verdict comes from the pure verifier over the candidate and its stored
 * evidence; the same candidate + verifier version + MX flag reuses the stored
 * row instead of recomputing (contract §24). Deliverability is never asserted
 * here: the response says `unknown` until a provider confirms it.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { bootstrap } from '@/bootstrap-api'
import { verifyCandidate } from '@/lib/leadgen/verification'
import { errorStatus, leadgenContext, refusal } from '@/modules/leadgen/lib/route-context'

bootstrap()
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = await leadgenContext(req, 'leadgen.candidates.manage')
  if (!ctx.ok) return ctx.response
  const { id } = await context.params
  if (!UUID_RE.test(id)) return refusal(404, 'candidate_not_found', 'Candidate not found')
  let body: unknown = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const mxChecked = record.mxChecked === true

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
    const evidence = await repository.listEvidence(candidate.id)
    const verification = verifyCandidate(
      {
        companyName: candidate.companyName,
        domain: candidate.companyDomain,
        country: candidate.companyCountry,
        contactName: candidate.contactName,
        contactTitle: candidate.contactTitle,
        email: candidate.contactEmail,
        sourceUrl: candidate.sourceUrl,
        evidence: evidence.map((item) => ({
          url: item.url,
          fetchedAt: item.fetchedAt,
          contentHash: item.contentHash,
          fields: item.fields ?? {},
        })),
      },
      { mxChecked },
    )
    const stored = await ctx.value.service.verify({
      tenantId: ctx.value.auth.tenantId,
      organizationId: ctx.value.auth.organizationId,
      candidateId: candidate.id,
      verifierVersion: verification.verifierVersion,
      rulesetHash: verification.rulesetHash,
      mxChecked,
      verdict: verification.verdict,
      checks: verification.checks,
    })
    if (!stored.ok) return refusal(errorStatus(stored.code), stored.code, stored.code)
    return NextResponse.json({
      verification: stored.value.verification,
      verdict: verification.verdict,
      reasons: verification.reasons,
      deliverability: verification.deliverability,
      cached: stored.value.cached,
    })
  } catch {
    return refusal(503, 'store_unavailable', 'Lead storage is unavailable')
  }
}
