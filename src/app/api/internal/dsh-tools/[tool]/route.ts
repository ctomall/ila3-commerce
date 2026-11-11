/**
 * Controlled CRM tool bridge for the DSH runtime (C1).
 *
 * `POST /api/internal/dsh-tools/<tool>` is called by the DSH process — not by a
 * browser — with `Authorization: Bearer <run token>`. The run token is the only
 * identity source; the request body is tool arguments and nothing else. The
 * route itself decides nothing about permissions: it verifies the token, looks
 * the tool up in the static registry, and delegates every authorization
 * decision to `authorizeToolCall()` (binding active + real feature id +
 * customer scope + read-only).
 *
 * Response contract (stable, no driver/internal detail):
 *   200 { ok: true, tool, result }
 *   400 { error, code: 'invalid_input', issues? }
 *   401 { error, code: 'unauthorized' }            missing/invalid/expired token
 *   403 { error, code }                            authorization refusal
 *   404 { error, code: 'unknown_tool' }
 *   503 { error, code: 'tool_unavailable' }
 *
 * Audit log: `runId`, `tool`, `decision`, `durationMs` only. The token, the
 * secret, the arguments and any CRM row data are never logged.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { bootstrap } from '@/bootstrap-api'
import { authorizeToolCall } from '@/lib/dsh/tool-bridge/authorize'
import { buildToolBridgeDeps } from '@/lib/dsh/tool-bridge/deps'
import { getToolDescriptor } from '@/lib/dsh/tool-bridge/registry'
import { resolveRunTokenSecret, verifyRunToken, type RunTokenClaims } from '@/lib/dsh/tool-bridge/run-token'

// Static app routes bypass the `/api/[...slug]` catch-all, so the DI/auth
// registrations that entry normally performs must be applied here as well.
// Mirrors `api/auth/login` and `api/internal/ai-assistant-dsh-chat`.
bootstrap()

const logger = createLogger('dsh.tools')

/** Node runtime: `node:crypto` HMAC and the ORM/RBAC container need it. */
export const runtime = 'nodejs'
/** Every call is a live authorization decision; never cache or prerender it. */
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ tool: string }> }

function parseBearer(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer[ \t]+(\S+)$/i.exec(header.trim())
  return match ? match[1] : null
}

function errorResponse(
  status: number,
  code: string,
  error: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error, code, ...(extra ?? {}) }, { status })
}

async function readJsonBody(
  req: NextRequest,
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  let text: string
  try {
    text = await req.text()
  } catch {
    return { ok: false }
  }
  // A tool with no arguments may send an empty body; treat it as `{}` so a
  // schema with only optional fields still works.
  if (text.trim() === '') return { ok: true, value: {} }
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false }
  }
}

export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const startedAt = Date.now()
  const tool = (await context.params).tool
  let claims: RunTokenClaims | null = null

  const audit = (decision: string): void => {
    logger.info('dsh.tool_call', {
      runId: claims?.runId ?? null,
      tool,
      decision,
      durationMs: Date.now() - startedAt,
    })
  }

  const token = parseBearer(req.headers.get('authorization'))
  if (!token) {
    audit('unauthorized')
    return errorResponse(401, 'unauthorized', 'Unauthorized')
  }

  const verified = verifyRunToken(token, { secret: resolveRunTokenSecret() })
  if (!verified.ok) {
    audit('unauthorized')
    return errorResponse(401, 'unauthorized', 'Unauthorized')
  }
  claims = verified.claims

  const descriptor = getToolDescriptor(tool)
  if (!descriptor) {
    audit('unknown_tool')
    return errorResponse(404, 'unknown_tool', 'Unknown tool')
  }

  let deps: Awaited<ReturnType<typeof buildToolBridgeDeps>>
  try {
    deps = await buildToolBridgeDeps()
  } catch {
    audit('tool_unavailable')
    return errorResponse(503, 'tool_unavailable', 'Tool bridge unavailable')
  }

  const authorization = await authorizeToolCall({
    claims,
    tool,
    descriptor,
    deps: {
      bindings: deps.bindings,
      checkFeatures: deps.checkFeatures,
      resolveCustomerScope: deps.resolveCustomerScope,
    },
  })
  if (!authorization.ok) {
    audit(authorization.code)
    return errorResponse(authorization.status, authorization.code, authorization.message)
  }

  const body = await readJsonBody(req)
  if (!body.ok) {
    audit('invalid_input')
    return errorResponse(400, 'invalid_input', 'Request body must be valid JSON')
  }

  const parsed = descriptor.inputSchema.safeParse(body.value)
  if (!parsed.success) {
    audit('invalid_input')
    return errorResponse(400, 'invalid_input', 'Invalid tool input', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map((part) => String(part)),
        message: issue.message,
      })),
    })
  }

  try {
    const result = await descriptor.execute(parsed.data, {
      em: deps.em,
      claims,
      scope: authorization.scope,
    })
    audit('allowed')
    return NextResponse.json({ ok: true, tool, result })
  } catch (error) {
    // Not part of the audit record: the error detail can contain driver text.
    logger.error('dsh.tool_call failed', {
      runId: claims.runId,
      tool,
      err: error instanceof Error ? error.name : 'unknown',
    })
    audit('tool_error')
    return errorResponse(503, 'tool_unavailable', 'Tool execution failed')
  }
}
