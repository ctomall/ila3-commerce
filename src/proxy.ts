import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// Do NOT import bootstrap here — proxy runs before the app and must stay free
// of Node.js-only modules like MikroORM. Bootstrap runs in layouts/route handlers.
const CHAT_PUBLIC_PATH = '/api/ai_assistant/chat'
const CHAT_DSH_PATH = '/api/internal/ai-assistant-dsh-chat'

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
  ],
}
