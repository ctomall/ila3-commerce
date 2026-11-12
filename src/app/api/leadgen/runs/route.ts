/**
 * POST /api/leadgen/runs — create (or replay) a research run.
 *
 * Identity comes from the session; `runKey` makes the call idempotent (unique
 * per tenant/organization/source). The body can never choose a tenant or org.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { bootstrap } from '@/bootstrap-api'
import { errorStatus, leadgenContext, refusal } from '@/modules/leadgen/lib/route-context'

bootstrap()
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await leadgenContext(req, 'leadgen.runs.create')
  if (!ctx.ok) return ctx.response
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return refusal(400, 'invalid_body', 'Body must be JSON')
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const runKey = typeof record.runKey === 'string' ? record.runKey.trim() : ''
  const source = record.source === 'dsh' || record.source === 'manual' ? record.source : null
  if (!runKey || !source) return refusal(400, 'invalid_input', 'runKey and source are required')
  const result = await ctx.value.service.createRun({
    tenantId: ctx.value.auth.tenantId,
    organizationId: ctx.value.auth.organizationId,
    source,
    runKey,
    agentKey: typeof record.agentKey === 'string' ? record.agentKey : null,
  })
  if (!result.ok) return refusal(errorStatus(result.code), result.code, 'Invalid run request')
  return NextResponse.json({ run: result.value.run, created: result.value.created }, { status: result.value.created ? 201 : 200 })
}
