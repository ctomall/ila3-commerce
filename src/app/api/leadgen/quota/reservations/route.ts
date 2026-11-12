/**
 * POST /api/leadgen/quota/reservations — reserve units on every level or none.
 *
 * `Idempotency-Key` is required: the header is the contract's idempotency key,
 * stored on the reservation row. Over quota is 429 (with the shortfall), a
 * missing bucket configuration is 409.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { bootstrap } from '@/bootstrap-api'
import { leadgenContext, refusal } from '@/modules/leadgen/lib/route-context'
import { createQuotaService, type QuotaKind } from '@/modules/leadgen/services/quota-service'
import { createRequestQuotaRepository } from '@/modules/leadgen/services/quota-repository'

bootstrap()
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KINDS: readonly QuotaKind[] = ['lead', 'crm_write', 'send']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await leadgenContext(req, 'leadgen.quota.manage')
  if (!ctx.ok) return ctx.response
  const idempotencyKey = req.headers.get('idempotency-key')?.trim() ?? ''
  if (idempotencyKey.length < 8) {
    return refusal(400, 'invalid_idempotency_key', 'Idempotency-Key header is required')
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return refusal(400, 'invalid_body', 'Body must be JSON')
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const quotaKind = record.quotaKind
  const units = record.units
  if (!KINDS.includes(quotaKind as QuotaKind) || !Number.isInteger(units) || (units as number) < 1) {
    return refusal(400, 'invalid_input', 'quotaKind and a positive integer units are required')
  }
  const taskId = typeof record.taskId === 'string' ? record.taskId : null
  const draftId = typeof record.draftId === 'string' ? record.draftId : null
  if (draftId && !UUID_RE.test(draftId)) return refusal(400, 'invalid_input', 'draftId must be a uuid')
  try {
    const repo = await createRequestQuotaRepository()
    const service = createQuotaService({ repo, now: () => new Date().toISOString(), newId: () => crypto.randomUUID(), leaseMs: 300_000 })
    const result = await service.reserveUnits({
      tenantId: ctx.value.auth.tenantId,
      organizationId: ctx.value.auth.organizationId,
      quotaKind: quotaKind as QuotaKind,
      units: units as number,
      idempotencyKey,
      taskId,
      draftId,
    })
    if (!result.ok) {
      const status = result.code === 'quota_exceeded' ? 429 : result.code === 'quota_not_configured' ? 409 : 400
      return refusal(status, result.code, result.code, result.extra)
    }
    return NextResponse.json(result.value, { status: result.value.replayed ? 200 : 201 })
  } catch {
    return refusal(503, 'quota_unavailable', 'Quota storage is unavailable')
  }
}
