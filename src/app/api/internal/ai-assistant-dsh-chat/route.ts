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
import type { ModelEnv } from '@/lib/dsh/model-env'
import type {
  FinishRunInput,
  RunService,
  SubmitServiceResult,
} from '@/modules/dsh_runs/services/run-service'
import type {
  BindingRecord,
  RunEventRecord,
  RunRecord,
} from '@/modules/dsh_runs/services/run-store'

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
 * Legacy (OM_DSH_PERSIST off) runs have no persisted binding, but the run-token
 * payload requires a non-empty binding id. This placeholder deliberately can
 * never match a real `dsh_assistant_bindings` row, so the bridge answers 403
 * `binding_inactive` — the expected fail-closed behaviour on that path. The
 * persisted path passes the real binding id instead.
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
  /** Persisted-run reconnect target (OM_DSH_PERSIST=orm only). */
  runId?: string
  /** Last persisted event seq already seen by the browser. */
  cursor?: number
  /** Client-supplied idempotency key; derived from identity + request hash when absent. */
  idempotencyKey?: string
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

const INVALID_CURSOR = -1

/** Parse a body/header cursor; null means absent, INVALID_CURSOR means malformed. */
function parseCursorValue(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : INVALID_CURSOR
}

/**
 * Validate the body without trusting anything inside it except `messages`
 * (prompt content), `sessionId` (a DSH session handle), and the B3 replay
 * fields. Identity always comes from `getAuthFromRequest`; actor/userId fields
 * in the body are ignored.
 *
 * A replay request (`runId` present) deliberately does not need messages: the
 * browser reconnecting to an existing run is not sending a new prompt.
 */
function parseChatRequest(body: unknown): ChatRequest | { error: string } {
  if (!isRecord(body)) return { error: 'Request body must be a JSON object' }

  const runId = readStringField(body, ['runId'])
  const idempotencyKey = readStringField(body, ['idempotencyKey'])
  const bodyCursor = parseCursorValue(body.cursor)
  if (bodyCursor === INVALID_CURSOR) {
    return { error: 'cursor must be a non-negative integer' }
  }
  if (runId) {
    return {
      prompt: '',
      runId,
      ...(bodyCursor !== null ? { cursor: bodyCursor } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    }
  }
  if (body.runId !== undefined) {
    return { error: 'runId must be a non-empty string when provided' }
  }
  if (body.idempotencyKey !== undefined && !idempotencyKey) {
    return { error: 'idempotencyKey must be a non-empty string when provided' }
  }
  if (bodyCursor !== null) {
    return { error: 'cursor requires runId' }
  }

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
    ...(idempotencyKey ? { idempotencyKey } : {}),
  }
}

/**
 * The CRM's configured model provider, mapped to DSH env. Cached briefly: the
 * provider settings are global, and resolving them touches the module config
 * service. `OM_DSH_MODEL_ENV=off` keeps isolated mock-model tests hermetic.
 */
let modelEnvCache: { at: number; value: ModelEnv } | null = null

async function resolveDshModelEnv(): Promise<ModelEnv> {
  if ((process.env.OM_DSH_MODEL_ENV ?? '').trim().toLowerCase() === 'off') return { env: {} }
  const now = Date.now()
  if (modelEnvCache && now - modelEnvCache.at < 60_000) return modelEnvCache.value

  try {
    const [{ createRequestContainer }, providerConfig, credentials, modelEnvModule] = await Promise.all([
      import('@open-mercato/shared/lib/di/container'),
      import('@/modules/ai_model_config/lib/provider-config'),
      import('@/modules/ai_model_config/lib/credentials'),
      import('@/lib/dsh/model-env'),
    ])
    const container = await createRequestContainer()
    const service = providerConfig.resolveModuleConfigService(container)
    const value = await modelEnvModule.resolveModelEnv({
      loadConfig: () => providerConfig.loadProviderConfig(service),
      decrypt: (ciphertext) => credentials.decryptSecret(ciphertext),
    })
    modelEnvCache = { at: now, value }
    return value
  } catch (error) {
    logger.warn('DSH model env unavailable', { err: errorMessage(error) })
    return { env: {} }
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
function signBridgeToken(
  auth: AuthContext,
  runId: string,
  bindingId: string,
  timeoutMs: number,
): string | null {
  const tenantId = auth.tenantId?.trim()
  const organizationId = auth.orgId?.trim()
  const secret = resolveRunTokenSecret()
  if (!tenantId || !organizationId || !secret) return null

  try {
    return signRunToken(
      {
        runId,
        bindingId,
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
  bindingId: string,
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

  const token = signBridgeToken(auth, runId, bindingId, timeoutMs)
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
  runId: string,
  bindingId: string = UNBOUND_BINDING_ID,
  modelEnv: ModelEnv = { env: {} },
): DshRunInput {
  const timeoutMs = runTimeoutMs()
  const root = process.env.OM_DSH_ROOT?.trim() || DEFAULT_DSH_ROOT
  const employee = identityKey([auth.tenantId, auth.orgId, auth.sub])
  const wiring = resolveToolBridgeWiring(auth, runId, bindingId, timeoutMs)

  return {
    runId,
    ...(request.sessionId ? { sessionId: request.sessionId } : {}),
    prompt: request.prompt,
    timeoutMs,
    workspace: path.join(root, 'workspaces', employee, runId),
    dshHome: path.join(root, 'homes', employee),
    // Explicit launch: the base profile plus the CRM MCP overlay when enabled.
    args: wiring.args,
    // Credentials only ever travel to the child: never logged, never returned.
    env: { ...modelEnv.env, ...wiring.env },
    ...(modelEnv.provider ? { provider: modelEnv.provider } : {}),
    ...(modelEnv.model ? { model: modelEnv.model } : {}),
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
  id?: number,
): Promise<void> {
  const payload = JSON.stringify(event)
  // `id:` is what makes EventSource send Last-Event-ID on reconnect. Legacy
  // frames keep their exact existing shape (no id) so the old tests/contract
  // stay untouched; the persisted path supplies the durable event seq.
  const frame = id === undefined ? `data: ${payload}\n\n` : `id: ${id}\ndata: ${payload}\n\n`
  await writer.write(encoder.encode(frame))
}

/** Stream the run to the browser, then always emit one `done` and confirm close. */
type PumpOutcome = {
  result: DshRunResult | null
  streamError: unknown
  textEmitted: boolean
}

/** Persistence failed mid-stream; the route fails closed instead of going memory-only. */
class PersistenceFailure extends Error {
  constructor(readonly failure: unknown) {
    super('persistence failure')
    this.name = 'PersistenceFailure'
  }
}

/** Stream the run to the browser, then always emit one `done` and confirm close. */
async function pumpRun(
  handle: DshRunHandle,
  write: (event: SseEvent, id?: number) => Promise<void>,
  persist?: (event: SseEvent) => Promise<number | void>,
): Promise<PumpOutcome> {
  let streamError: unknown = null
  let result: DshRunResult | null = null
  let textEmitted = false
  const context: MappingContext = { emittedAssistantMessages: new Set() }

  const emit = async (event: SseEvent): Promise<void> => {
    if (!persist) {
      await write(event)
      return
    }
    let seq: number | void
    try {
      seq = await persist(event)
    } catch (error) {
      // A repository failure must abort the stream, not be mistaken for a DSH
      // event-stream failure that then tries to persist an error event again.
      throw new PersistenceFailure(error)
    }
    await write(event, typeof seq === 'number' ? seq : undefined)
  }

  try {
    for await (const event of handle.events) {
      for (const mapped of mapDshEvent(event, context)) {
        if (mapped.type === 'text') textEmitted = true
        await emit(mapped)
      }
    }
  } catch (error) {
    if (error instanceof PersistenceFailure) throw error
    streamError = error
  }

  try {
    result = await handle.result
  } catch (error) {
    streamError ??= error
  }

  if (streamError) {
    logger.error('DSH run stream failed', { err: errorMessage(streamError) })
    await emit({ type: 'error', error: errorMessage(streamError) })
  } else if (result && result.finishReason !== 'completed') {
    await emit({
      type: 'error',
      error: result.error || `DSH run ${result.finishReason}`,
    })
  } else if (result && !textEmitted && result.finalResponse) {
    await emit({ type: 'text', content: result.finalResponse })
    textEmitted = true
  }

  // The frontend only leaves its streaming state on `done`; send it even after
  // an error so a failed run cannot strand the command palette. `done` is
  // synthetic and is never persisted: replay appends it after the stored events.
  // The persisted caller emits it itself, after finish(), so a reconnect never
  // sees `done` before the terminal row is durable.
  if (!persist) await write({ type: 'done', sessionId: handle.sessionId })
  return { result, streamError, textEmitted }
}

/* ------------------------------------------------------------------------- *
 * B3 persisted path (OM_DSH_PERSIST=orm)
 *
 * This path is opt-in and completely separate from the legacy stream above:
 * it provisions a binding, persists every mapped SSE event with a durable seq,
 * finishes the run before `done`, and replays terminal runs from the cursor.
 * Any repository/table failure is fail-closed; there is deliberately no
 * fallback to an in-memory run.
 * ------------------------------------------------------------------------- */

const IN_FLIGHT_RUN_STATUSES = new Set(['queued', 'running', 'awaiting_approval'])

/** Default revocation poll. C's contract: a DB cancel is observed within 1 s. */
const DEFAULT_PERSIST_POLL_MS = 1_000
/** Lower bound so a misconfigured env cannot hammer PostgreSQL in a tight loop. */
const MIN_PERSIST_POLL_MS = 50

function persistPollIntervalMs(): number {
  const raw = process.env.OM_DSH_PERSIST_POLL_MS
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed >= MIN_PERSIST_POLL_MS ? parsed : DEFAULT_PERSIST_POLL_MS
}

function persistMode(): boolean {
  return (process.env.OM_DSH_PERSIST ?? '').trim().toLowerCase() === 'orm'
}

function isInFlightStatus(status: string): boolean {
  return IN_FLIGHT_RUN_STATUSES.has(status)
}

function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex')
}

type RunServiceModule = {
  createRequestRunService: () => Promise<RunService>
}

async function resolveRunService(): Promise<RunService> {
  const mod = (await import('@/modules/dsh_runs/services/run-service')) as unknown as RunServiceModule
  if (typeof mod.createRequestRunService !== 'function') {
    throw new Error('dsh_runs service module does not export createRequestRunService()')
  }
  return mod.createRequestRunService()
}

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

function persistenceUnavailable(): NextResponse {
  return NextResponse.json(
    { error: 'DSH run persistence is unavailable', code: 'persistence_unavailable' },
    { status: 503 },
  )
}

function invalidCursorResponse(): NextResponse {
  return NextResponse.json(
    { error: 'cursor must be a non-negative integer', code: 'invalid_cursor' },
    { status: 400 },
  )
}

function idempotencyConflictResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Idempotency key was already used with a different request', code: 'idempotency_conflict' },
    { status: 409 },
  )
}

function bindingInactiveResponse(): NextResponse {
  return NextResponse.json(
    { error: 'The assistant binding is not active', code: 'binding_inactive' },
    { status: 403 },
  )
}

function runInProgressResponse(run: RunRecord): NextResponse {
  return NextResponse.json(
    {
      error: 'Run is already in progress',
      code: 'run_in_progress',
      runId: run.id,
      cursor: run.cursor,
    },
    { status: 409 },
  )
}

function replayErrorResponse(error: unknown): NextResponse {
  const code = errorCode(error)
  if (code === 'run-forbidden') {
    return NextResponse.json({ error: 'Forbidden', code: 'run_forbidden' }, { status: 403 })
  }
  if (code === 'run-not-found') {
    return NextResponse.json({ error: 'Run not found', code: 'run_not_found' }, { status: 404 })
  }
  if (code === 'invalid-cursor') return invalidCursorResponse()
  if (code === 'invalid-request') {
    return NextResponse.json({ error: errorMessage(error), code: 'invalid_request' }, { status: 400 })
  }
  logger.error('Persisted DSH replay failed', { err: errorMessage(error) })
  return persistenceUnavailable()
}

function submitErrorResponse(error: unknown): NextResponse {
  const code = errorCode(error)
  if (code === 'idempotency-conflict') return idempotencyConflictResponse()
  if (code === 'concurrent-run') {
    return NextResponse.json(
      { error: 'Run is already in progress', code: 'run_in_progress' },
      { status: 409 },
    )
  }
  if (code === 'binding-not-active') return bindingInactiveResponse()
  if (code === 'binding-not-found') {
    return NextResponse.json({ error: 'Binding not found', code: 'binding_not_found' }, { status: 404 })
  }
  if (code === 'invalid-request') {
    return NextResponse.json({ error: errorMessage(error), code: 'invalid_request' }, { status: 400 })
  }
  logger.error('Persisted DSH submit failed', { err: errorMessage(error) })
  return persistenceUnavailable()
}

/**
 * Watch the persisted run row while the DSH stream is live.
 *
 * Cancellation and revocation are decided outside this process: the cancel
 * endpoint or `revokeBinding` writes a terminal status, and this poll is how the
 * running stream learns about it. On the first non-in-flight status (or a row
 * that vanished) it stops polling and asks the runtime to cancel; the pump then
 * receives the cancelled result, finishes idempotently and closes with
 * error/done.
 *
 * Why 1 s: the 10 s revocation contract leaves room for one poll (<=1 s) plus
 * the runtime's bounded stop ladder (shutdown 1 s + SIGTERM grace 2 s + SIGKILL
 * grace 2 s), with margin. `OM_DSH_PERSIST_POLL_MS` lets tests drive this with
 * fake timers.
 *
 * A transient repository read failure is logged and retried on the next tick;
 * it must not tear down a healthy conversation by itself. Writes remain gated
 * by the bridge/run status, so a permanently unavailable DB still cannot let a
 * revoked run write.
 */
function startPersistedRunPoller(input: {
  runId: string
  getRun: (runId: string) => Promise<RunRecord | null>
  intervalMs: number
  cancel: (reason: string) => Promise<void>
}): () => void {
  let stopped = false
  let checking = false

  const timer = setInterval(() => {
    void check()
  }, input.intervalMs)
  // Never keep the Node process alive solely for this poll.
  timer.unref?.()

  const stop = (): void => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
  }

  async function check(): Promise<void> {
    if (stopped || checking) return
    checking = true
    try {
      const run = await input.getRun(input.runId)
      if (stopped) return
      if (!run || !isInFlightStatus(run.status)) {
        stop()
        try {
          await input.cancel('revoked-or-cancelled')
        } catch (error) {
          // The pump is still bounded by the run timeout; report, don't loop.
          logger.warn('Persisted DSH run cancel after terminal status failed', {
            runId: input.runId,
            err: errorMessage(error),
          })
        }
      }
    } catch (error) {
      logger.warn('Persisted DSH run status poll failed', {
        runId: input.runId,
        err: errorMessage(error),
      })
    } finally {
      checking = false
    }
  }

  return stop
}

function persistedEventToSse(event: RunEventRecord): SseEvent {
  const payload = event.payloadJson
  if (isRecord(payload) && typeof payload.type === 'string') return payload as SseEvent
  return { type: event.type, payload }
}

type SseWriter = (event: SseEvent, id?: number) => Promise<void>

/**
 * Shared SSE response for the persisted path. `work` owns the events; the
 * wrapper owns writer closure and converts a thrown persistence failure into a
 * visible `persistence_unavailable` frame (the HTTP status is already 200).
 */
function createPersistedSseResponse(
  work: (write: SseWriter) => Promise<void>,
  onFinally?: () => Promise<void>,
): Response {
  const encoder = new TextEncoder()
  const stream = new TransformStream<Uint8Array, Uint8Array>()
  const writer = stream.writable.getWriter()
  let closed = false

  const write: SseWriter = async (event, id) => {
    if (closed) return
    try {
      await writeSse(writer, encoder, event, id)
    } catch (error) {
      logger.warn('Failed to write persisted DSH SSE event', {
        eventType: event.type,
        err: errorMessage(error),
      })
      closed = true
    }
  }

  void (async () => {
    try {
      await work(write)
    } catch (error) {
      logger.error('Persisted DSH stream failed', { err: errorMessage(error) })
      if (error instanceof PersistenceFailure) {
        await write({ type: 'error', error: 'persistence_unavailable' })
      } else {
        await write({ type: 'error', error: errorMessage(error) })
      }
      await write({ type: 'done' })
    } finally {
      closed = true
      try {
        await writer.close()
      } catch {
        // Already closed by the client.
      }
      if (onFinally) {
        try {
          await onFinally()
        } catch (error) {
          logger.error('Persisted DSH cleanup failed', { err: errorMessage(error) })
        }
      }
    }
  })()

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

function replayResponse(run: RunRecord, events: RunEventRecord[]): Response {
  return createPersistedSseResponse(async (write) => {
    for (const event of events) {
      await write(persistedEventToSse(event), event.seq)
    }
    await write({
      type: 'done',
      ...(run.sessionId ? { sessionId: run.sessionId } : {}),
    })
  })
}

function terminalOutcome(outcome: PumpOutcome): FinishRunInput {
  if (outcome.streamError) {
    return {
      status: 'failed',
      ...(outcome.result ? { result: outcome.result } : {}),
      error: errorMessage(outcome.streamError),
    }
  }
  const result = outcome.result
  if (!result) return { status: 'failed', error: 'DSH run ended without a result' }
  switch (result.finishReason) {
    case 'completed':
      return { status: 'completed', result }
    case 'cancelled':
      return { status: 'cancelled', result, error: result.error ?? 'cancelled' }
    case 'timed-out':
      return { status: 'failed', result, error: result.error ?? 'DSH run timed out' }
    case 'failed':
      return { status: 'failed', result, error: result.error ?? 'DSH run failed' }
    default:
      return { status: 'failed', result, error: `DSH run ${result.finishReason}` }
  }
}

async function finishQuietly(
  service: RunService,
  runId: string,
  status: FinishRunInput['status'],
  error: string,
): Promise<void> {
  try {
    await service.finish(runId, { status, error })
  } catch (failure) {
    if (errorCode(failure) !== 'run-terminal') {
      logger.warn('Persisted DSH run could not be finished during failure handling', {
        runId,
        err: errorMessage(failure),
      })
    }
  }
}

async function startPersistedRun(
  req: NextRequest,
  auth: AuthContext,
  parsed: ChatRequest,
  service: RunService,
  run: RunRecord,
): Promise<Response> {
  const modelEnv = await resolveDshModelEnv()
  let runtime: DshRuntime
  try {
    runtime = await resolveRuntime()
  } catch (error) {
    logger.error('DSH runtime module unavailable', { err: errorMessage(error) })
    await finishQuietly(service, run.id, 'failed', 'DSH runtime unavailable')
    return NextResponse.json({ error: 'DSH runtime unavailable' }, { status: 503 })
  }

  let handle: DshRunHandle
  try {
    handle = await runtime.start(
      buildRunInput(auth, parsed, req.signal, run.id, run.bindingId, modelEnv),
    )
  } catch (error) {
    logger.error('DSH run failed to start', { err: errorMessage(error) })
    await finishQuietly(service, run.id, 'failed', errorMessage(error))
    return NextResponse.json({ error: 'DSH runtime failed to start' }, { status: 502 })
  }

  try {
    await service.begin(run.id, { sessionId: handle.sessionId })
  } catch (error) {
    logger.error('Persisted DSH run could not be marked running', { err: errorMessage(error) })
    await finishQuietly(service, run.id, 'failed', 'persistence_unavailable')
    try {
      await handle.close()
    } catch {
      // The runtime is already unusable; the failure above is the one to report.
    }
    return persistenceUnavailable()
  }

  return createPersistedSseResponse(
    async (write) => {
      const persist = async (event: SseEvent): Promise<number> => {
        try {
          const stored = await service.appendEvent(run.id, {
            type: event.type,
            payload: event,
          })
          return stored.seq
        } catch (error) {
          throw new PersistenceFailure(error)
        }
      }

      let stopPolling: (() => void) | null = null
      try {
        const thinking: SseEvent = { type: 'thinking' }
        const thinkingSeq = await persist(thinking)
        await write(thinking, thinkingSeq)

        stopPolling = startPersistedRunPoller({
          runId: run.id,
          getRun: (runId) => service.getRun(runId),
          intervalMs: persistPollIntervalMs(),
          cancel: (reason) => handle.cancel(reason),
        })

        const outcome = await pumpRun(handle, write, persist)
        // Normal completion stops the poll before the terminal row is written,
        // so a finished turn can never see its own `completed` status and issue
        // a spurious cancel.
        stopPolling()
        stopPolling = null
        const terminal = terminalOutcome(outcome)
        try {
          await service.finish(run.id, terminal)
        } catch (error) {
          if (errorCode(error) === 'run-terminal') {
            // A concurrent revoke won; the run is already terminal, which is
            // the correct outcome. Do not turn that into a persistence error.
            logger.info('Persisted DSH run was already terminal before finish', { runId: run.id })
          } else {
            logger.error('Persisted DSH run finish failed', { err: errorMessage(error) })
            await write({ type: 'error', error: 'persistence_unavailable' })
          }
        }
        await write({ type: 'done', sessionId: handle.sessionId })
      } catch (error) {
        if (error instanceof PersistenceFailure) {
          logger.error('Persisted DSH event could not be stored', { err: errorMessage(error.failure) })
          await write({ type: 'error', error: 'persistence_unavailable' })
          await finishQuietly(service, run.id, 'failed', 'persistence_unavailable')
        } else {
          logger.error('Persisted DSH stream failed', { err: errorMessage(error) })
          await write({ type: 'error', error: errorMessage(error) })
          await finishQuietly(service, run.id, 'failed', errorMessage(error))
        }
        await write({ type: 'done', sessionId: handle.sessionId })
      } finally {
        stopPolling?.()
      }
    },
    async () => {
      try {
        const closed = await handle.close()
        if (!closed.stopped) {
          logger.error('DSH run close was not confirmed', {})
        }
      } catch (error) {
        logger.error('DSH run close failed', { err: errorMessage(error) })
      }
    },
  )
}

async function persistedChat(
  req: NextRequest,
  auth: AuthContext,
  parsed: ChatRequest,
): Promise<Response> {
  const tenantId = auth.tenantId?.trim() ?? ''
  const organizationId = auth.orgId?.trim() ?? ''
  if (!tenantId || !organizationId) {
    return NextResponse.json(
      { error: 'Tenant and organization are required for a persisted run', code: 'identity_scope_required' },
      { status: 400 },
    )
  }

  const headerCursor = parseCursorValue(req.headers.get('last-event-id'))
  if (headerCursor === INVALID_CURSOR) return invalidCursorResponse()
  const cursor = parsed.cursor ?? headerCursor ?? 0
  const identity = { tenantId, organizationId, userId: auth.sub }

  let service: RunService
  try {
    service = await resolveRunService()
  } catch (error) {
    logger.error('DSH run persistence is unavailable', { err: errorMessage(error) })
    return persistenceUnavailable()
  }

  // Reconnect/resume by durable run id: terminal runs replay from the cursor,
  // in-flight runs are rejected so a second process cannot attach.
  if (parsed.runId) {
    try {
      const replay = await service.replay(identity.userId, parsed.runId, cursor)
      if (!replay.resumable) return runInProgressResponse(replay.run)
      return replayResponse(replay.run, replay.events)
    } catch (error) {
      return replayErrorResponse(error)
    }
  }

  let binding: BindingRecord
  try {
    binding = await service.ensureBinding(identity)
  } catch (error) {
    if (errorCode(error) === 'invalid-request') {
      return NextResponse.json({ error: errorMessage(error), code: 'invalid_request' }, { status: 400 })
    }
    logger.error('DSH assistant binding could not be provisioned', { err: errorMessage(error) })
    return persistenceUnavailable()
  }

  let submitted: SubmitServiceResult
  try {
    submitted = await service.submit({
      identity,
      ...(parsed.idempotencyKey ? { idempotencyKey: parsed.idempotencyKey } : {}),
      requestHash: hashPrompt(parsed.prompt),
      prompt: parsed.prompt,
      bindingId: binding.id,
      ...(parsed.sessionId ? { sessionId: parsed.sessionId } : {}),
    })
  } catch (error) {
    return submitErrorResponse(error)
  }

  if (submitted.replay) {
    if (isInFlightStatus(submitted.run.status)) return runInProgressResponse(submitted.run)
    try {
      const replay = await service.replay(identity.userId, submitted.run.id, cursor)
      return replayResponse(replay.run, replay.events)
    } catch (error) {
      return replayErrorResponse(error)
    }
  }

  return startPersistedRun(req, auth, parsed, service, submitted.run)
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

  const modelEnv = await resolveDshModelEnv()

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

  if (persistMode()) {
    return persistedChat(req, auth, parsed)
  }

  // Replay/idempotency fields only exist on the persisted path. Reject them
  // rather than silently ignoring an opt-in the deployment did not enable.
  if (parsed.runId || parsed.cursor !== undefined || parsed.idempotencyKey !== undefined) {
    return NextResponse.json(
      {
        error: 'runId, cursor and idempotencyKey require OM_DSH_PERSIST=orm',
        code: 'persistence_disabled',
      },
      { status: 400 },
    )
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
    handle = await runtime.start(buildRunInput(auth, parsed, req.signal, randomUUID(), undefined, modelEnv))
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
