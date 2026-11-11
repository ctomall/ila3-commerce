import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// Do NOT import bootstrap here — proxy runs before the app and must stay free
// of Node.js-only modules like MikroORM. Bootstrap runs in layouts/route handlers.
const CHAT_PUBLIC_PATH = '/api/ai_assistant/chat'
const CHAT_DSH_PATH = '/api/internal/ai-assistant-dsh-chat'
const HEALTH_PUBLIC_PATH = '/api/ai_assistant/health'
const HEALTH_DSH_PATH = '/api/internal/dsh-health'
const AGENTS_PUBLIC_PATH = '/api/ai_assistant/ai/agents'
const AGENTS_DSH_PATH = '/api/internal/dsh-agents'
const AGENTIC_PUBLIC_PATH = '/api/ai_assistant/ai/chat'
const AGENTIC_DSH_PATH = '/api/internal/dsh-agentic-chat'
const CONVERSATIONS_PUBLIC_PATH = '/api/ai_assistant/ai/conversations'
const CONVERSATIONS_DSH_PATH = '/api/internal/dsh-conversations'

/**
 * `OM_AI_ENGINE=dsh` is the only value that switches the chat engine. Unset (or
 * `opencode`, or any typo) keeps the package's OpenCode handler. The read is
 * per-request, but Next freezes env at process start, so switching — and
 * rolling back — is an env change plus a restart of the same artifact.
 */
function isDshEngineEnabled(): boolean {
  return (process.env.OM_AI_ENGINE ?? '').trim().toLowerCase() === 'dsh'
}

export function proxy(req: NextRequest) {
  // Controlled rewrite: only the one public chat POST is diverted, and only
  // while the DSH engine is explicitly enabled. Everything else — including
  // every other /api/** route — is untouched.
  if (isDshEngineEnabled() && req.method === 'POST' && req.nextUrl.pathname === CHAT_PUBLIC_PATH) {
    const url = req.nextUrl.clone()
    url.pathname = CHAT_DSH_PATH
    return NextResponse.rewrite(url)
  }

  // The UI gates the assistant on this health probe. It must answer for the
  // engine that actually serves chat, not for the OpenCode server we replaced.
  if (isDshEngineEnabled() && req.method === 'GET' && req.nextUrl.pathname === HEALTH_PUBLIC_PATH) {
    const url = req.nextUrl.clone()
    url.pathname = HEALTH_DSH_PATH
    return NextResponse.rewrite(url)
  }

  // The catalogue's derived `aiConfigured` flag gates the UI; correct it for the
  // engine that actually serves chat while keeping the packaged auth/list logic.
  if (isDshEngineEnabled() && req.method === 'GET' && req.nextUrl.pathname === AGENTS_PUBLIC_PATH) {
    const url = req.nextUrl.clone()
    url.pathname = AGENTS_DSH_PATH
    return NextResponse.rewrite(url)
  }

  // Opt-in bridge for the UI's agentic text stream. Kept behind its own flag so
  // a protocol mismatch can be rolled back without touching chat.
  if (
    isDshEngineEnabled() &&
    (process.env.OM_DSH_AGENTIC ?? '').trim() === '1' &&
    req.method === 'POST' &&
    req.nextUrl.pathname === AGENTIC_PUBLIC_PATH
  ) {
    const url = req.nextUrl.clone()
    url.pathname = AGENTIC_DSH_PATH
    return NextResponse.rewrite(url)
  }

  // The UI auto-opens the first listed conversation; without an owner filter an
  // admin lands in another employee's private thread and cannot type.
  if (isDshEngineEnabled() && req.method === 'GET' && req.nextUrl.pathname === CONVERSATIONS_PUBLIC_PATH) {
    const url = req.nextUrl.clone()
    url.pathname = CONVERSATIONS_DSH_PATH
    return NextResponse.rewrite(url)
  }

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-next-url', req.nextUrl.pathname)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

// Match app routes while skipping Next internals, API routes, and static assets.
// The x-next-url header lets server layouts above dynamic segments resolve the
// request pathname without receiving params, preventing full client-tree
// remounts on navigation (see issue #1083).
//
// `/api/ai_assistant/chat` is added as one exact entry so the DSH rewrite can
// run for that POST. Do not replace this with a broad `/api/:path*` matcher:
// that would put every API request through the proxy.
export const config = {
  matcher: [
    '/((?!api/|_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|txt|xml|json|woff|woff2|ttf|eot)$).*)',
    '/api/ai_assistant/chat',
    '/api/ai_assistant/health',
    '/api/ai_assistant/ai/agents',
    '/api/ai_assistant/ai/chat',
    '/api/ai_assistant/ai/conversations',
  ],
}
