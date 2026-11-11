/**
 * The assistant agent catalogue reports `aiConfigured:false` when the packaged
 * provider registry cannot resolve a key from env. The CRM stores its provider
 * credential in module settings and resolves it for the DSH child, so under the
 * DSH engine the catalogue must report the assistant as configured — otherwise
 * the UI hides the whole chat even though chat works.
 *
 * Auth, feature checks and the agent list itself stay in the packaged handler;
 * this wrapper only corrects the one derived flag after a successful response.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

type Packaged = { GET: (request: NextRequest) => Promise<Response> }

export async function GET(req: NextRequest) {
  // The packaged agent loop resolves providers from an in-process registry that
  // is only populated when settings are read/written through the admin API. A
  // restart therefore leaves it empty ("No LLM provider is configured") even
  // though the CRM has a stored credential. This endpoint runs before the UI
  // opens a chat, so it is the reliable place to hydrate the runtime.
  try {
    const { createRequestContainer } = await import('@open-mercato/shared/lib/di/container')
    const { ensureProviderRuntime } = await import('@/modules/ai_model_config/lib/provider-config')
    await ensureProviderRuntime(await createRequestContainer())
  } catch {
    // Health/catalogue still answers; the chat path will surface its own error.
  }

  const mod = (await import(
    '@open-mercato/ai-assistant/modules/ai_assistant/api/ai/agents/route'
  )) as unknown as Packaged
  const response = await mod.GET(req)
  if (!response.ok) return response
  let payload: Record<string, unknown>
  try {
    payload = (await response.json()) as Record<string, unknown>
  } catch {
    return response
  }
  if ((process.env.OM_AI_ENGINE ?? '').trim().toLowerCase() === 'dsh') {
    payload.aiConfigured = true
  }
  return NextResponse.json(payload)
}
