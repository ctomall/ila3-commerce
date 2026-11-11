/**
 * Internal, DSH-backed implementation of the AI assistant chat endpoint.
 *
 * The public path stays `POST /api/ai_assistant/chat` (the package's OpenCode
 * route). `src/proxy.ts` rewrites that path here only while `OM_AI_ENGINE=dsh`;
 * with the variable unset — or set to anything else — no rewrite happens and the
 * package handler keeps answering. This file is therefore never the default
 * engine: switching is an env change in the same build artifact.
 *
 * Contract kept from the package route (read from
 * `@open-mercato/ai-assistant/src/modules/ai_assistant/api/chat/route.ts`):
 * every SSE frame is `data: <json>\n\n`, and the JSON carries one of the
 * frontend-known `type` values:
 *
 *   thinking | text {content} | tool-call {id,toolName,args} |
 *   tool-result {id,result} | question {question} | metadata {...} |
 *   debug {partType,data} | done {sessionId} | error {error} |
 *   session-authorized {sessionToken}
 *
 * (Earlier migration notes said "message/part/status"; the shipped package route
 * does not emit those names. This route maps onto the actual names above, and
 * the mirrored tests pin them down.)
 *
 * Not implemented here, on purpose:
 * - persistence of runs/bindings/events (B1). The run token therefore carries a
 *   placeholder binding id that can never match a row, so CRM tool calls fail
 *   closed with 403 `binding_inactive` until B1 lands,
 * - OpenCode's pending-question round trip, which has no DSH counterpart yet:
 *   `answerQuestion` answers 501 instead of silently doing nothing.
 */

import { createHash, randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { bootstrap } from '@/bootstrap-api'
import { resolveRunTokenSecret, signRunToken } from '@/lib/dsh/tool-bridge/run-token'
import type {
  DshEvent,
  DshRunHandle,
  DshRunInput,
  DshRunResult,
  DshRuntime,
} from '@/lib/dsh/runtime/types'

// Static app routes bypass the `/api/[...slug]` catch-all, so the DI/auth
// registrations that entry normally performs must be applied here as well.
// This mirrors `api/auth/login` and `api/healthz`.
bootstrap()

const logger = createLogger('ai_assistant.dsh')

/** The Node.js runtime is required for `node:crypto`, `node:path` and process spawn. */
export const runtime = 'nodejs'
/** Every request is a live stream; never let Next cache or statically optimise it. */
export const dynamic = 'force-dynamic'

const DEFAULT_RUN_TIMEOUT_MS = 120_000
const DEFAULT_DSH_ROOT = path.join(os.tmpdir(), 'om-dsh')

/** Must match `FIND_COMPANIES_TOOL` in `src/lib/dsh/tool-bridge/crm-find-companies.ts`. */
const DSH_BRIDGE_TOOL = 'crm.find_companies'
/**
 * B1 (binding persistence) is not wired yet, but the run-token payload requires
 * a non-empty binding id. This placeholder deliberately can never match a real
 * `dsh_assistant_bindings` row, so the bridge answers 403 `binding_inactive` —
 * the expected fail-closed behaviour until a real binding exists. It is not a
 * fake binding and must not be replaced with a guessed one.
 */
const UNBOUND_BINDING_ID = 'unbound'
/** Extra seconds the run token stays valid beyond the run timeout. */
const RUN_TOKEN_GRACE_SECONDS = 60

type AuthContext = NonNullable<Awaited<ReturnType<typeof getAuthFromRequest>>>

/**
 * The only seam between this route and the launcher. Tests replace the module
 * with `jest.mock('@/lib/dsh/runtime', ...)`; the route itself never spawns a
 * process and never imports a concrete transport. A1 owns the real
 * implementation (`startDshRun(input): Promise<DshRunHandle>`).
 */
type DshRuntimeModule = {
  startDshRun: (input: DshRunInput) => Promise<DshRunHandle>
}

async function resolveRuntime(): Promise<DshRuntime> {
  const mod = (await import('@/lib/dsh/runtime')) as unknown as DshRuntimeModule
  if (typeof mod.startDshRun !== 'function') {
    throw new Error('DSH runtime module does not export startDshRun()')
  }
  return {
    start: (input: DshRunInput) => mod.startDshRun(input),
  }
}

/** A frontend-facing SSE payload. `type` is the only required field. */
type SseEvent = { type: string; [key: string]: unknown }

type ChatRequest = {
  prompt: string
  /** Resuming an existing DSH session; omitted for a new conversation. */
  sessionId?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringField(
  source: Record<string, unknown> | null,
  keys: readonly string[],
): string | null {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

/**
 * Validate the body without trusting anything inside it except `messages`
 * (prompt content) and `sessionId` (a DSH session handle). Identity always
 * comes from `getAuthFromRequest`; actor/userId fields in the body are ignored.
 */
function parseChatRequest(body: unknown): ChatRequest | { error: string } {
  if (!isRecord(body)) return { error: 'Request body must be a JSON object' }

  const { messages, sessionId } = body
  if (!Array.isArray(messages) || messages.length === 0) {
    return { error: 'messages array is required' }
  }
  for (const message of messages) {
    if (
      !isRecord(message) ||
      typeof message.role !== 'string' ||
      typeof message.content !== 'string'
    ) {
      return { error: 'Each message must have a string role and content' }
    }
  }

  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => (message as { role: string }).role === 'user') as
    | { content: string }
    | undefined
  if (!lastUserMessage || lastUserMessage.content.trim() === '') {
    return { error: 'No user message found' }
  }

  if (sessionId !== undefined) {
    if (typeof sessionId !== 'string' || sessionId.trim() === '') {
      return { error: 'sessionId must be a non-empty string when provided' }
    }
  }

  return {
    prompt: lastUserMessage.content,
    ...(typeof sessionId === 'string' ? { sessionId } : {}),
  }
}

/** Stable, non-reversible directory key: no user/tenant id appears in a path. */
function identityKey(parts: Array<string | null | undefined>): string {
  return createHash('sha256').update(parts.map((part) => part ?? '').join('\u0000')).digest('hex').slice(0, 32)
}

function runTimeoutMs(): number {
  const raw = process.env.OM_DSH_RUN_TIMEOUT_MS
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RUN_TIMEOUT_MS
}

/**
 * Bridge endpoint the MCP child calls. `OM_DSH_BRIDGE_URL` wins (release
 * wiring); otherwise derive the loopback app address from `PORT`.
 */
function resolveBridgeBaseUrl(): string {
  const configured = process.env.OM_DSH_BRIDGE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  const port = process.env.PORT?.trim() || '3000'
  return `http://127.0.0.1:${port}/api/internal/dsh-tools`
}

/**
 * The CRM MCP overlay shipped in this repository. `OM_DSH_CRM_PATCH` lets a
 * release point at its own absolute path; the default is repo-relative so a
 * local build works without extra configuration.
 */
function resolveCrmPatchPath(): string {
  const configured = process.env.OM_DSH_CRM_PATCH?.trim()
  if (configured) return configured
  return path.join(process.cwd(), 'vendor', 'dsh', 'crm-profile.patch.yml')
}

/**
 * Sign the bridge token for one run.
 *
 * Identity comes only from the authenticated session. The token lists exactly
 * the bridge tools this run may call; the bridge still re-checks binding, ACL
 * features and customer scope per call. Returns `null` (and therefore no MCP
 * tools) when the tenant/organization/secret is missing — fail closed, never a
 * default secret and never a guessed identity.
 */
function signBridgeToken(auth: AuthContext, runId: string, timeoutMs: number): string | null {
  const tenantId = auth.tenantId?.trim()
  const organizationId = auth.orgId?.trim()
  const secret = resolveRunTokenSecret()
  if (!tenantId || !organizationId || !secret) return null

  try {
    return signRunToken(
      {
        runId,
        // Real binding wiring is B1; the placeholder can never match a row.
        bindingId: UNBOUND_BINDING_ID,
        userId: auth.sub,
        tenantId,
        organizationId,
        exp: Math.floor(Date.now() / 1000) + Math.ceil(timeoutMs / 1000) + RUN_TOKEN_GRACE_SECONDS,
        tools: [DSH_BRIDGE_TOOL],
      },
      secret,
    )
  } catch (error) {
    // The thrown message never contains the secret; keep it for diagnosis.
    logger.warn('DSH tool token could not be signed; MCP tools stay disabled', {
      reason: errorMessage(error),
    })
    return null
  }
}

/**
 * Env and launch args that mount the stdio CRM MCP server into this DSH run.
 *
 * The MCP overlay is only added when both the script path and a signed run
 * token exist. A half-configured bridge would either spawn a server destined
 * to exit or advertise tools that can only fail, so it is omitted instead and
 * chat keeps working without tools. The token is written into the child env
 * only; it is never logged.
 */
function resolveToolBridgeWiring(
  auth: AuthContext,
  runId: string,
  timeoutMs: number,
): { args: string[]; env: Record<string, string> } {
  const args = ['--profile', 'sdk-minimal']
  const script = process.env.OM_DSH_MCP_SCRIPT?.trim()
  if (!script) return { args, env: {} }
  if (!path.isAbsolute(script)) {
    // The MCP child is spawned with the run workspace as cwd; a relative script
    // path would resolve there, not in the app checkout.
    logger.warn('DSH CRM MCP disabled: OM_DSH_MCP_SCRIPT must be an absolute path', {})
    return { args, env: {} }
  }

  const token = signBridgeToken(auth, runId, timeoutMs)
  if (!token) {
    logger.warn('DSH CRM MCP disabled: run token unavailable (tenant, organization or secret missing)', {})
    return { args, env: {} }
  }

  return {
    args: [...args, '--patch', resolveCrmPatchPath()],
    env: {
      OM_DSH_BRIDGE_URL: resolveBridgeBaseUrl(),
      OM_DSH_MCP_SCRIPT: script,
      OM_DSH_TOOL_TOKEN: token,
    },
  }
}

/**
 * Per-employee DSH_HOME plus a per-run workspace outside the app checkout, as
 * required by `DshRunInput`. The launcher is responsible for creating them;
 * this route only derives the paths. B1 replaces this with the persisted
 * per-employee profile.
 */
function buildRunInput(
  auth: AuthContext,
  request: ChatRequest,
  signal: AbortSignal,
): DshRunInput {
  const runId = randomUUID()
  const timeoutMs = runTimeoutMs()
  const root = process.env.OM_DSH_ROOT?.trim() || DEFAULT_DSH_ROOT
  const employee = identityKey([auth.tenantId, auth.orgId, auth.sub])
  const wiring = resolveToolBridgeWiring(auth, runId, timeoutMs)

  return {
    runId,
    ...(request.sessionId ? { sessionId: request.sessionId } : {}),
    prompt: request.prompt,
    timeoutMs,
    workspace: path.join(root, 'workspaces', employee, runId),
    dshHome: path.join(root, 'homes', employee),
    // Explicit launch: the base profile plus the CRM MCP overlay when enabled.
    args: wiring.args,
    env: wiring.env,
    // The runtime owns cancellation: it aborts the subprocess when the browser
    // disconnects. Called through here so the route does not spawn or signal.
    signal,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'DSH run failed'
}

/** Unmappable DSH notifications stay visible for triage without breaking the UI. */
function passThrough(event: DshEvent): SseEvent {
  return {
    type: 'dsh.event',
    dshType: event.type,
    seq: event.seq,
    payload: event.payload,
  }
}

/** Per-run mapping state: DSH re-publishes one assistant message as a turn updates. */
type MappingContext = {
  emittedAssistantMessages: Set<string>
}

/** `tool/call.arguments` is the model's raw JSON string, not a parsed object. */
function parseToolArguments(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw ?? {}
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}

/**
 * Map one DSH notification to zero or more frontend-shaped SSE events.
 *
 * The DSH runtime (A1) publishes raw SDK notifications: `session.event` carries
 * `{ sessionId, event: { type, seq, time, data } }`, where the interesting
 * session event types are `assistant/message`, `tool/call`, `tool/result`,
 * `turn/start` and `turn/end`. This mapper translates those to the shapes the
 * existing command palette already consumes:
 *
 *   assistant/message text block → text {content}
 *   assistant/message reasoning → debug {partType:'thinking'}
 *   assistant/message tool-call → tool-call {id,toolName,args}
 *   tool/call                   → tool-call {id,toolName,args}
 *   tool/result                 → tool-result {id,result}
 *   turn/start                  → thinking
 *   session.status              → debug {partType:'status'}
 *
 * Everything else — including `question`, which this engine cannot answer yet —
 * is preserved as `{type:'dsh.event', dshType, seq, payload}` so triage keeps
 * the original data without exposing an event the UI cannot handle.
 *
 * `done` is never forwarded from a DSH notification: this route emits exactly
 * one `done` after the run result settles, so the browser cannot finish early.
 */
function mapDshEvent(event: DshEvent, context: MappingContext): SseEvent[] {
  const payload = isRecord(event.payload) ? event.payload : null

  switch (event.type) {
    case 'thinking':
      return [{ type: 'thinking' }]
    case 'text': {
      const content =
        typeof event.payload === 'string' ? event.payload : readStringField(payload, ['content', 'text', 'delta'])
      return content ? [{ type: 'text', content }] : [passThrough(event)]
    }
    case 'metadata':
      return [{ ...(payload ?? {}), type: 'metadata' }]
    case 'tool-call':
      return [
        {
          type: 'tool-call',
          id: readStringField(payload, ['id', 'toolCallId', 'callId']) ?? `dsh-tool-${event.seq}`,
          toolName: readStringField(payload, ['toolName', 'name', 'tool']) ?? 'unknown',
          args: payload?.args ?? payload?.input ?? {},
        },
      ]
    case 'tool-result':
      return [
        {
          type: 'tool-result',
          id: readStringField(payload, ['id', 'toolCallId', 'callId']) ?? `dsh-tool-${event.seq}`,
          result: payload?.result ?? payload?.output ?? null,
        },
      ]
    case 'debug':
      return [
        {
          type: 'debug',
          partType: readStringField(payload, ['partType']) ?? 'dsh',
          data: payload?.data ?? event.payload,
        },
      ]
    case 'error':
      return [
        {
          type: 'error',
          error: readStringField(payload, ['error', 'message']) ?? 'DSH run failed',
        },
      ]
    case 'done':
      // Handled exclusively by the route after `handle.result` settles.
      return []
    case 'session.event':
      return mapSessionNotification(event, payload, context)
    case 'session.status':
      // Status is useful in the debug panel; it is not a terminal signal here.
      return [{ type: 'debug', partType: 'status', data: event.payload }]
    default:
      return [passThrough(event)]
  }
}

function mapSessionNotification(
  event: DshEvent,
  payload: Record<string, unknown> | null,
  context: MappingContext,
): SseEvent[] {
  if (!payload) return [passThrough(event)]

  const sessionEvent = isRecord(payload.event) ? payload.event : null
  if (sessionEvent) return mapSessionLogEvent(event, sessionEvent, context)

  // Tolerate a flattened shape (a delta or a part at the top level) so a future
  // transport change does not silently drop visible output.
  const delta = typeof payload.delta === 'string' ? payload.delta : null
  if (delta !== null) return delta.length > 0 ? [{ type: 'text', content: delta }] : []

  const part = isRecord(payload.part) ? payload.part : null
  if (!part) return [passThrough(event)]

  const partType = readStringField(part, ['type']) ?? ''
  if (partType === 'reasoning' || partType === 'thinking') {
    return [{ type: 'debug', partType: 'thinking', data: part }]
  }
  if (partType === 'text') {
    // Full part snapshots are not forwarded as `text` because DSH may republish
    // them on every update (duplicated content in the browser). The final
    // answer still reaches the client through `result.finalResponse` fallback.
    return [passThrough(event)]
  }
  if (partType === 'tool') {
    const state = isRecord(part.state) ? part.state : {}
    const callId =
      readStringField(part, ['callID', 'callId', 'id', 'toolCallId']) ?? `dsh-tool-${event.seq}`
    const toolName = readStringField(part, ['tool', 'name', 'toolName']) ?? 'unknown'
    const status = readStringField(state, ['status']) ?? readStringField(part, ['status']) ?? 'running'
    if (status === 'completed' || status === 'error') {
      return [
        {
          type: 'tool-result',
          id: callId,
          result: state.output ?? state.error ?? state,
        },
      ]
    }
    return [
      {
        type: 'tool-call',
        id: callId,
        toolName,
        args: state.input ?? part.input ?? {},
      },
    ]
  }

  return [passThrough(event)]
}

function mapSessionLogEvent(
  event: DshEvent,
  sessionEvent: Record<string, unknown>,
  context: MappingContext,
): SseEvent[] {
  const innerType = readStringField(sessionEvent, ['type']) ?? ''
  const data = isRecord(sessionEvent.data) ? sessionEvent.data : null

  switch (innerType) {
    case 'assistant/message': {
      const message = data && isRecord(data.message) ? data.message : null
      if (!message) return [passThrough(event)]
      // DSH re-publishes the same message while a turn updates; emit it once.
      const messageId = readStringField(message, ['id']) ?? `assistant-${event.seq}`
      if (context.emittedAssistantMessages.has(messageId)) return []
      context.emittedAssistantMessages.add(messageId)

      const mapped: SseEvent[] = []
      for (const block of Array.isArray(message.content) ? message.content : []) {
        if (!isRecord(block)) continue
        const blockType = readStringField(block, ['type']) ?? ''
        if (blockType === 'text') {
          const text = typeof block.text === 'string' ? block.text : ''
          if (text.length > 0) mapped.push({ type: 'text', content: text })
        } else if (blockType === 'reasoning') {
          const text = typeof block.text === 'string' ? block.text : ''
          mapped.push({ type: 'debug', partType: 'thinking', data: { text } })
        } else if (blockType === 'tool-call') {
          mapped.push({
            type: 'tool-call',
            id: readStringField(block, ['id']) ?? `dsh-tool-${event.seq}`,
            toolName: readStringField(block, ['name']) ?? 'unknown',
            args: parseToolArguments(block.arguments),
          })
        }
      }
      return mapped.length > 0 ? mapped : [passThrough(event)]
    }
    case 'tool/call': {
      if (!data) return [passThrough(event)]
      return [
        {
          type: 'tool-call',
          id: readStringField(data, ['callId']) ?? `dsh-tool-${event.seq}`,
          toolName: readStringField(data, ['name']) ?? 'unknown',
          args: parseToolArguments(data.arguments),
        },
      ]
    }
    case 'tool/result': {
      if (!data) return [passThrough(event)]
      const message = isRecord(data.message) ? data.message : null
      return [
        {
          type: 'tool-result',
          id:
            readStringField(message, ['toolCallId']) ??
            readStringField(data, ['callId']) ??
            `dsh-tool-${event.seq}`,
          result: message?.content ?? data.meta ?? data.error ?? null,
        },
      ]
    }
    case 'turn/start':
      return [{ type: 'thinking' }]
    case 'turn/end':
      // Terminal signalling belongs to the route, after `handle.result`.
      return []
    default:
      // Keep the inner event type visible when triaging an unmapped event.
      return [{ ...passThrough(event), dshEventType: innerType }]
  }
}

async function writeSse(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  event: SseEvent,
): Promise<void> {
  await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
}

/** Stream the run to the browser, then always emit one `done` and confirm close. */
async function pumpRun(
  handle: DshRunHandle,
  write: (event: SseEvent) => Promise<void>,
): Promise<void> {
  let streamError: unknown = null
  let result: DshRunResult | null = null
  let textEmitted = false
  const context: MappingContext = { emittedAssistantMessages: new Set() }

  try {
    for await (const event of handle.events) {
      for (const mapped of mapDshEvent(event, context)) {
        if (mapped.type === 'text') textEmitted = true
        await write(mapped)
      }
    }
  } catch (error) {
    streamError = error
  }

  try {
    result = await handle.result
  } catch (error) {
    streamError ??= error
  }

  if (streamError) {
    logger.error('DSH run stream failed', { err: errorMessage(streamError) })
    await write({ type: 'error', error: errorMessage(streamError) })
  } else if (result && result.finishReason !== 'completed') {
    await write({
      type: 'error',
      error: result.error || `DSH run ${result.finishReason}`,
    })
  } else if (result && !textEmitted && result.finalResponse) {
    await write({ type: 'text', content: result.finalResponse })
    textEmitted = true
  }

  // The frontend only leaves its streaming state on `done`; send it even after
  // an error so a failed run cannot strand the command palette.
  await write({ type: 'done', sessionId: handle.sessionId })
}

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
  }

  // MIGRATION GAP: DSH has no equivalent of OpenCode's pending question / answer
  // round trip yet. Answering is a distinct POST that the original SSE stream
  // depends on, so returning an empty success would hang the UI. Fail loudly and
  // explicitly; wiring this up is tracked as unfinished A2 work.
  if (isRecord(body) && body.answerQuestion !== undefined) {
    return NextResponse.json(
      {
        error: 'answerQuestion is not supported by the DSH engine yet',
        code: 'dsh_answer_question_unsupported',
      },
      { status: 501 },
    )
  }

  const parsed = parseChatRequest(body)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  let runtime: DshRuntime
  try {
    runtime = await resolveRuntime()
  } catch (error) {
    logger.error('DSH runtime module unavailable', { err: errorMessage(error) })
    return NextResponse.json({ error: 'DSH runtime unavailable' }, { status: 503 })
  }

  let handle: DshRunHandle
  try {
    handle = await runtime.start(buildRunInput(auth, parsed, req.signal))
  } catch (error) {
    // Fail before opening the SSE stream so the browser gets a real HTTP error
    // instead of an empty event stream.
    logger.error('DSH run failed to start', { err: errorMessage(error) })
    return NextResponse.json({ error: 'DSH runtime failed to start' }, { status: 502 })
  }

  const encoder = new TextEncoder()
  const stream = new TransformStream<Uint8Array, Uint8Array>()
  const writer = stream.writable.getWriter()
  let writerClosed = false

  const write = async (event: SseEvent): Promise<void> => {
    if (writerClosed) return
    try {
      await writeSse(writer, encoder, event)
    } catch (error) {
      // The client disconnected; the pump stops writing but still closes the run.
      logger.warn('Failed to write DSH SSE event', { eventType: event.type, err: errorMessage(error) })
      writerClosed = true
    }
  }

  const run = async (): Promise<void> => {
    try {
      await write({ type: 'thinking' })
      await pumpRun(handle, write)
    } catch (error) {
      logger.error('DSH chat stream failed', { err: errorMessage(error) })
      await write({ type: 'error', error: errorMessage(error) })
      await write({ type: 'done', sessionId: handle.sessionId })
    } finally {
      writerClosed = true
      try {
        await writer.close()
      } catch {
        // Already closed by the client.
      }
      try {
        const closed = await handle.close()
        if (!closed.stopped) {
          logger.error('DSH run close was not confirmed', {})
        }
      } catch (error) {
        logger.error('DSH run close failed', { err: errorMessage(error) })
      }
    }
  }
  void run()

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
