/**
 * The seam between the CRM chat route and the DSH runtime.
 *
 * The route owns identity, persistence and the browser SSE contract; the runtime
 * owns one DSH subprocess and the newline-JSON-RPC session on stdio. Keeping the
 * shapes here means the route can be built and tested against a fake runtime
 * before the real `dsh` binary is wired in.
 */

export type DshEvent = {
  /** Monotonic per run; persisted so a reconnecting client can resume. */
  seq: number
  /** Protocol event name (`session.event`, `session.status`, ...) or a CRM-mapped name. */
  type: string
  payload?: unknown
}

export type DshRunInput = {
  runId: string
  /** Reuse an existing DSH session on restart/resume; omit for a new conversation. */
  sessionId?: string
  prompt: string
  systemPrompt?: string
  timeoutMs: number
  /** Per-run working directory; must be outside the shared checkout. */
  workspace: string
  /** Per-employee DSH_HOME; never share between employees. */
  dshHome: string
  /**
   * Server-side identity used when `OM_DSH_OS_ISOLATION=1`: the launcher derives
   * the dedicated Unix user and the `/srv/dsh` home/workspace from it. Required
   * in that mode (fail closed), ignored otherwise.
   */
  identity?: { tenantId: string; organizationId: string; userId: string }
  /** Explicit allow-listed environment; the runtime must not inherit the server env. */
  env?: Record<string, string>
  signal?: AbortSignal

  // Optional launch/transport overrides, appended for A1 without changing the
  // shapes above. Omitted values keep the documented defaults.
  /** DSH executable; `process.env.DSH_BIN` is the fallback, then `dsh` on PATH. */
  command?: string
  /** Full argv override; defaults to `['--profile', 'sdk-minimal']`. */
  args?: readonly string[]
  /** Provider route passed to `initialize`; defaults to the SDK client default. */
  provider?: string
  /** Model name passed to `initialize`; defaults to the SDK client default. */
  model?: string
  /** Bound for the `initialize` handshake (default 10 s). */
  initializeTimeoutMs?: number
  /** Bound for one JSON-RPC request other than `initialize` (default 30 s). */
  requestTimeoutMs?: number
  /** Bound for the cooperative `shutdown` request during cancel/close (default 1 s). */
  shutdownTimeoutMs?: number
  /** Grace between SIGTERM and SIGKILL (default 2 s). */
  stopGraceMs?: number
  /** Bound for confirming exit after SIGKILL (default 2 s). */
  killGraceMs?: number
}

export type DshRunResult = {
  finalResponse: string
  finishReason: 'completed' | 'cancelled' | 'timed-out' | 'failed'
  error?: string
}

export type DshRunHandle = {
  sessionId: string
  /** DSH notifications in wire order, re-sequenced from 1. */
  events: AsyncIterable<DshEvent>
  /** Settles once the prompt is answered or the run is cancelled/timed out. */
  result: Promise<DshRunResult>
  cancel(reason?: string): Promise<void>
  /** Must confirm subprocess exit; a failed close is reported, not swallowed. */
  close(): Promise<{ stopped: boolean }>
}

export interface DshRuntime {
  start(input: DshRunInput): Promise<DshRunHandle>
}

/** Minimal typed view of the ndjson JSON-RPC transport used by launch(). */
export interface JsonRpcTransport {
  request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>
  notify(method: string, params?: unknown): void
  onNotification(listener: (method: string, params: unknown) => void): () => void
  onRequest(handler: (method: string, params: unknown) => Promise<unknown>): void
  close(): Promise<void>
}
