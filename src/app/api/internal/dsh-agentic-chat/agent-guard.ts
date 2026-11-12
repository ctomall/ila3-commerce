/**
 * Preserve the packaged chat route's "unknown agent id is 404" contract.
 *
 * The DSH bridge ignores the agent persona today (one employee assistant), but
 * it must not answer 200 for an id the crate registry does not know: the
 * security probe treats that as an authorization regression. A catalogue
 * outage is a 503, never an allow.
 *
 * Kept out of `route.ts` so its test does not have to load the `ai` ESM package
 * the UI stream bridge depends on.
 */
import { NextResponse, type NextRequest } from 'next/server'

export async function rejectUnknownAgent(req: NextRequest): Promise<NextResponse | null> {
  const requested = req.nextUrl.searchParams.get('agent')?.trim()
  if (!requested) return null
  try {
    const registry = (await import(
      '@open-mercato/ai-assistant/modules/ai_assistant/lib/agent-registry'
    )) as {
      loadAgentRegistry: () => Promise<void>
      getAgent: (id: string) => unknown
    }
    await registry.loadAgentRegistry()
    if (registry.getAgent(requested)) return null
    return NextResponse.json({ error: 'Assistant not found', code: 'agent_not_found' }, { status: 404 })
  } catch {
    return NextResponse.json(
      { error: 'Assistant catalogue is unavailable', code: 'agent_catalog_unavailable' },
      { status: 503 },
    )
  }
}
