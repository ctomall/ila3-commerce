/**
 * GET /api/leadgen/quota/buckets — the caller organization's buckets and headroom.
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await leadgenContext(req, 'leadgen.quota.view')
  if (!ctx.ok) return ctx.response
  const kind = req.nextUrl.searchParams.get('quotaKind')?.trim() ?? ''
  if (kind && !KINDS.includes(kind as QuotaKind)) {
    return refusal(400, 'invalid_quota_kind', 'Unknown quota kind')
  }
  try {
    const repo = await createRequestQuotaRepository()
    const service = createQuotaService({ repo, now: () => new Date().toISOString(), newId: () => crypto.randomUUID(), leaseMs: 300_000 })
    const result = await service.list({
      tenantId: ctx.value.auth.tenantId,
      organizationId: ctx.value.auth.organizationId,
      quotaKind: kind ? (kind as QuotaKind) : undefined,
    })
    if (!result.ok) return refusal(409, result.code, result.code)
    return NextResponse.json(result.value)
  } catch {
    return refusal(503, 'quota_unavailable', 'Quota storage is unavailable')
  }
}
