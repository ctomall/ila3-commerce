/**
 * POST /api/leadgen/drafts — create (or replay) an outreach draft.
 *
 * Internal only: it stores the body and its hash; no provider is contacted. The
 * idempotency is the contract's `sha256(candidate_id + ':' + body_hash)`.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { bootstrap } from '@/bootstrap-api'
import { leadgenContext, refusal } from '@/modules/leadgen/lib/route-context'
import { bodyHashOf, createOutreachService } from '@/modules/leadgen/services/outreach-service'
import { createRequestOutreachRepository } from '@/modules/leadgen/services/outreach-repository'

bootstrap()
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await leadgenContext(req, 'leadgen.sends.draft')
  if (!ctx.ok) return ctx.response
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return refusal(400, 'invalid_body', 'Body must be JSON')
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const candidateId = typeof record.candidateId === 'string' ? record.candidateId : ''
  const recipientEmail = typeof record.recipientEmail === 'string' ? record.recipientEmail : ''
  const subject = typeof record.subject === 'string' ? record.subject : ''
  const bodyMarkdown = typeof record.bodyMarkdown === 'string' ? record.bodyMarkdown : ''
  if (!UUID_RE.test(candidateId) || !recipientEmail.includes('@') || !subject.trim() || !bodyMarkdown.trim()) {
    return refusal(400, 'invalid_input', 'candidateId, recipientEmail, subject and bodyMarkdown are required')
  }
  try {
    const repo = await createRequestOutreachRepository()
    const service = createOutreachService({ repo, now: () => new Date().toISOString(), newId: () => crypto.randomUUID(), approvalTtlMs: 24 * 3600 * 1000 })
    const result = await service.createDraft({
      tenantId: ctx.value.auth.tenantId,
      organizationId: ctx.value.auth.organizationId,
      candidateId,
      recipientEmail,
      subject,
      bodyMarkdown,
      templateKey: typeof record.templateKey === 'string' ? record.templateKey : null,
      templateVersion: typeof record.templateVersion === 'string' ? record.templateVersion : null,
    })
    if (!result.ok) {
      const status = result.code === 'candidate_not_found' ? 404 : result.code === 'not_approved_candidate' ? 409 : 400
      return refusal(status, result.code, result.code)
    }
    return NextResponse.json(
      { draft: result.value.draft, bodyHash: bodyHashOf(subject, bodyMarkdown), created: result.value.created },
      { status: result.value.created ? 201 : 200 },
    )
  } catch {
    return refusal(503, 'store_unavailable', 'Lead storage is unavailable')
  }
}
