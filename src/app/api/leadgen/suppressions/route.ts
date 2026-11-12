/**
 * /api/leadgen/suppressions — the suppression list a human maintains.
 *
 * GET    ?email=            → is this address suppressed (hash matched server-side)
 * POST   {email, reason}    → record an unsubscribe/complaint/bounce; replay if active
 * DELETE ?email=            → release the active suppression (address becomes mailable)
 *
 * The dispatch boundary checks this list before it writes a send row, so a suppression
 * added here takes effect on the next dispatch. Nothing is ever sent from this route.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { bootstrap } from '@/bootstrap-api'
import { leadgenContext, refusal } from '@/modules/leadgen/lib/route-context'
import { createSuppressionService, isSuppressionReason } from '@/modules/leadgen/services/suppression-service'
import { createRequestSuppressionRepository } from '@/modules/leadgen/services/suppression-repository'

bootstrap()
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function emailParam(req: NextRequest, body?: Record<string, unknown>): string {
  const fromQuery = req.nextUrl.searchParams.get('email')?.trim() ?? ''
  if (fromQuery) return fromQuery
  return typeof body?.email === 'string' ? body.email.trim() : ''
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await leadgenContext(req, 'leadgen.sends.draft')
  if (!ctx.ok) return ctx.response
  const email = emailParam(req)
  try {
    const repo = await createRequestSuppressionRepository()
    const service = createSuppressionService({ repo, now: () => new Date().toISOString(), newId: () => crypto.randomUUID() })
    // Without `email` the caller is browsing the list (the review UI); with it the
    // caller asks one question about one address.
    if (!email) {
      const limitRaw = Number(req.nextUrl.searchParams.get('limit'))
      const result = await service.list({
        tenantId: ctx.value.auth.tenantId,
        limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
      })
      if (!result.ok) return refusal(400, result.code, result.code)
      return NextResponse.json(result.value)
    }
    if (!email.includes('@')) return refusal(400, 'invalid_input', 'email must be an address')
    const result = await service.check({ tenantId: ctx.value.auth.tenantId, email })
    if (!result.ok) return refusal(400, result.code, result.code)
    return NextResponse.json(result.value)
  } catch {
    return refusal(503, 'store_unavailable', 'Lead storage is unavailable')
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await leadgenContext(req, 'leadgen.sends.approve')
  if (!ctx.ok) return ctx.response
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return refusal(400, 'invalid_body', 'Body must be JSON')
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const email = emailParam(req, record)
  if (!email.includes('@') || !isSuppressionReason(record.reason)) {
    return refusal(400, 'invalid_input', 'email and reason (unsubscribe|complaint|bounce) are required')
  }
  const sourceSendId = typeof record.sourceSendId === 'string' ? record.sourceSendId : null
  try {
    const repo = await createRequestSuppressionRepository()
    const service = createSuppressionService({ repo, now: () => new Date().toISOString(), newId: () => crypto.randomUUID() })
    const result = await service.add({
      tenantId: ctx.value.auth.tenantId,
      organizationId: ctx.value.auth.organizationId,
      email,
      reason: record.reason,
      sourceSendId,
    })
    if (!result.ok) return refusal(400, result.code, result.code)
    return NextResponse.json(
      { suppression: result.value.suppression, created: result.value.created },
      { status: result.value.created ? 201 : 200 },
    )
  } catch {
    // The partial unique index refuses a second active row for the same address even
    // when two requests race past the read: replay the winner instead of a 500.
    try {
      const repo = await createRequestSuppressionRepository()
      const service = createSuppressionService({ repo, now: () => new Date().toISOString(), newId: () => crypto.randomUUID() })
      const existing = await service.add({
        tenantId: ctx.value.auth.tenantId,
        organizationId: ctx.value.auth.organizationId,
        email,
        reason: record.reason,
        sourceSendId,
      })
      if (existing.ok) {
        return NextResponse.json({ suppression: existing.value.suppression, created: false }, { status: 200 })
      }
    } catch {
      // fall through to the storage error
    }
    return refusal(503, 'store_unavailable', 'Lead storage is unavailable')
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const ctx = await leadgenContext(req, 'leadgen.sends.approve')
  if (!ctx.ok) return ctx.response
  const email = emailParam(req)
  if (!email.includes('@')) return refusal(400, 'invalid_input', 'email is required')
  try {
    const repo = await createRequestSuppressionRepository()
    const service = createSuppressionService({ repo, now: () => new Date().toISOString(), newId: () => crypto.randomUUID() })
    const result = await service.release({
      tenantId: ctx.value.auth.tenantId,
      organizationId: ctx.value.auth.organizationId,
      email,
    })
    if (!result.ok) return refusal(400, result.code, result.code)
    return NextResponse.json(result.value)
  } catch {
    return refusal(503, 'store_unavailable', 'Lead storage is unavailable')
  }
}
