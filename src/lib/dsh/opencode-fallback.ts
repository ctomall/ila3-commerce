/**
 * Delegation target for the DSH canary. Keeping the packaged OpenCode route
 * behind this module lets the chat route (and its tests) stay independent of
 * the package's deep-import layout.
 */
import type { NextRequest } from 'next/server'

export async function callOpenCodeChat(request: NextRequest): Promise<Response> {
  const mod = (await import('@open-mercato/ai-assistant/modules/ai_assistant/api/chat/route')) as unknown as {
    POST: (request: NextRequest) => Promise<Response>
  }
  return mod.POST(request)
}
