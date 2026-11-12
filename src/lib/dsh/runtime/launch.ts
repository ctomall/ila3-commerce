/**
 * Launch one DSH runtime subprocess for one run and expose it through the
 * `DshRunHandle` seam from `types.ts`.
 *
 * Security properties this module owns (and tests cover):
 *   - the child never inherits the server environment: only PATH, HOME,
 *     DSH_HOME, DSH_* and caller-supplied `env` entries are materialised;
 *   - `DSH_HOME` is forced to the per-employee home even if `env` tries to
 *     override it;
 *   - the child runs in its own process group (POSIX) so timeout/cancel/close
 *     can signal the whole tree, then SIGKILL it after a bounded grace;
 *   - close reports `{ stopped: true }` only after the kernel reports the
 *     child exited; an unconfirmed exit is `{ stopped: false }`, never a
 *     silent success.
 *
 * Protocol choice: `session/query`, not `session/prompt`. `session/query`
 * routes ordinary text and native commands through the same entry, and the
 * runtime emits `session.query.completed` with `finalResponse`/`finishReason`
 * for command queries. Ordinary prompt queries are settled by that completion
 * when the peer sends it, with `session.status: idle` as the documented
 * fallback for runtimes that only emit turn lifecycle events.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import {
  assertIsolationIdentity,
  buildIsolatedSpawn,
  provisionEmployee,
  resolveOsIsolation,
  writeRunEnvFile,
} from './os-isolation'
import { createTransport, type DshTransport } from './transport'
import type { DshEvent, DshRunHandle, DshRunInput, DshRunResult } from './types'

/**
 * Default handshake bound.
 *
 * This bounds only a *live but silent* child: a crash, a missing binary or a
 * rejected config closes the pipe and fails the pending request immediately, so a
 * generous bound does not slow real startup failures down.
 *
 * The production bound used to be 10 s, and a real run hit it — `initialize timed
 * out after 10000ms` → 502 — while the host was loaded. A direct measurement of
 * the non-isolated handshake gives 0.76–2.3 s even at load 69, so DSH booting is
 * not what consumed those seconds; the isolated start path (sudo + runner + a
 * freshly created employee HOME) is the candidate this bound widening covers.
 * 60 s keeps one cold start inside the budget and stays under the 120 s run
 * timeout; a child that dies still fails at once, because the pipe close rejects
 * the pending request.
 */
export const DEFAULT_INITIALIZE_TIMEOUT_MS = 60_000
/** Default per-request bound after the handshake. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
/** Default cooperative shutdown bound during cancel/close. */
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 1_000
/** Default SIGTERM → SIGKILL grace. */
export const DEFAULT_STOP_GRACE_MS = 2_000
/** Default bound for confirming exit after SIGKILL. */
export const DEFAULT_KILL_GRACE_MS = 2_000

/** Parent environment keys that are always forwarded to the runtime. */
const PASSTHROUGH_ENV_EXACT = new Set(['PATH', 'HOME', 'DSH_HOME'])
/** Parent environment prefix forwarded to the runtime (DSH tooling/config only). */
const PASSTHROUGH_ENV_PREFIX = 'DSH_'
/** Kept as a tail, not a full log; enough to diagnose an unexpected exit. */
const STDERR_TAIL_CHARS = 8_000

type TextBlock = { type: 'text'; text: string }

type RunReceipt =
  | { kind: 'prompt'; messageId: string }
  | { kind: 'command'; commandId: string }

/** Minimal spawn signature; injectable only for the close-unconfirmed test. */
export type DshSpawn = (
  command: string,
  args: string[],
  options: {
    cwd: string
    env: NodeJS.ProcessEnv
    stdio: ['pipe', 'pipe', 'pipe']
    detached: boolean
  },
) => ChildProcess

/** Optional launch seam. Production callers pass nothing. */
export type StartDshRunOptions = {
  spawn?: DshSpawn
}

export type StopChildOptions = {
  stopGraceMs?: number
  killGraceMs?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const positive = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback

const nonEmpty = (value: string, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} must be a non-empty string`)
  }
  return value
}

function validateRunInput(input: DshRunInput): void {
  if (!isRecord(input)) throw new TypeError('DshRunInput must be an object')
  nonEmpty(input.runId, 'runId')
  nonEmpty(input.prompt, 'prompt')
  nonEmpty(input.workspace, 'workspace')
  nonEmpty(input.dshHome, 'dshHome')
  if (!Number.isFinite(input.timeoutMs) || input.timeoutMs <= 0) {
    throw new TypeError('timeoutMs must be a positive number')
  }
  if (input.args !== undefined && (!Array.isArray(input.args) || input.args.some((arg) => typeof arg !== 'string'))) {
    throw new TypeError('args must be an array of strings')
  }
  if (input.env !== undefined && !isRecord(input.env)) {
    throw new TypeError('env must be a plain object')
  }
}

/**
 * Build the child environment from the allow-list only.
 *
 * Explicit `input.env` entries are trusted caller input and override the
 * parent's value; `DSH_HOME` is then forced to the per-employee home so a
 * caller cannot accidentally point two employees at one state directory.
 */
export function buildDshEnv(
  input: Pick<DshRunInput, 'dshHome' | 'env'>,
  parentEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  // This repository's ProcessEnv augmentation makes NODE_ENV required, so the
  // child env starts from the parent's mode and only allow-listed keys are added.
  const env: NodeJS.ProcessEnv = { NODE_ENV: parentEnv.NODE_ENV ?? 'production' }
  for (const [key, value] of Object.entries(parentEnv)) {
    if (typeof value !== 'string') continue
    if (PASSTHROUGH_ENV_EXACT.has(key) || key.startsWith(PASSTHROUGH_ENV_PREFIX)) {
      env[key] = value
    }
  }
  for (const [key, value] of Object.entries(input.env ?? {})) {
    if (typeof value === 'string') env[key] = value
  }
  env.DSH_HOME = input.dshHome
  return env
}

const hasExited = (child: ChildProcess): boolean =>
  child.exitCode !== null || child.signalCode !== null

/**
 * Signal the child's whole process group on POSIX, falling back to the child
 * itself when the group is already gone or the host is Windows.
 */
function signalChild(child: ChildProcess, signal: NodeJS.Signals): boolean {
  if (process.platform !== 'win32' && typeof child.pid === 'number' && child.pid > 0) {
    try {
      process.kill(-child.pid, signal)
      return true
    } catch {
      // Group may not exist yet/already; fall through to the direct pid.
    }
  }
  try {
    return child.kill(signal)
  } catch {
    return false
  }
}

/** Wait for an actual exit edge; `false` means the deadline expired. */
function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (hasExited(child)) return Promise.resolve(true)
  return new Promise<boolean>((resolveWait) => {
    let settled = false
    const finish = (value: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.off('exit', onExit)
      resolveWait(value)
    }
    const onExit = (): void => finish(true)
    const timer = setTimeout(() => finish(false), positive(timeoutMs, 1))
    timer.unref()
    child.once('exit', onExit)
  })
}

/**
 * Terminate a child with SIGTERM → bounded grace → SIGKILL.
 * Returns true only when an exit edge was observed, which is what `close()`
 * is required to report honestly.
 */
export async function stopChildProcess(
  child: ChildProcess,
  options: StopChildOptions = {},
): Promise<boolean> {
  if (hasExited(child)) return true
  const stopGraceMs = positive(options.stopGraceMs, DEFAULT_STOP_GRACE_MS)
  const killGraceMs = positive(options.killGraceMs, DEFAULT_KILL_GRACE_MS)
  signalChild(child, 'SIGTERM')
  if (await waitForExit(child, stopGraceMs)) return true
  signalChild(child, 'SIGKILL')
  return waitForExit(child, killGraceMs)
}

/** FIFO of DshEvent with an `AsyncIterable` face and clean termination. */
class EventQueue implements AsyncIterable<DshEvent> {
  private readonly items: DshEvent[] = []
  private readonly waiters: Array<(result: IteratorResult<DshEvent, undefined>) => void> = []
  private done = false

  push(event: DshEvent): void {
    if (this.done) return
    const waiter = this.waiters.shift()
    if (waiter !== undefined) {
      waiter({ value: event, done: false })
      return
    }
    this.items.push(event)
  }

  end(): void {
    if (this.done) return
    this.done = true
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined, done: true })
  }

  [Symbol.asyncIterator](): AsyncIterator<DshEvent> {
    return {
      next: () => {
        const item = this.items.shift()
        if (item !== undefined) return Promise.resolve({ value: item, done: false })
        if (this.done) return Promise.resolve({ value: undefined, done: true })
        return new Promise<IteratorResult<DshEvent, undefined>>((resolveNext) => {
          this.waiters.push(resolveNext)
        })
      },
      return: () => {
        this.items.length = 0
        this.end()
        return Promise.resolve({ value: undefined, done: true })
      },
    }
  }
}

/** Map the runtime's finish vocabulary onto the handle's four outcomes. */
function normalizeFinishReason(raw: unknown): DshRunResult['finishReason'] {
  if (raw === 'completed' || raw === 'cancelled' || raw === 'timed-out' || raw === 'failed') return raw
  if (raw === 'aborted' || raw === 'canceled' || raw === 'cancelled-by-user') return 'cancelled'
  if (raw === 'error' || raw === 'failed') return 'failed'
  return 'completed'
}

/** Map a `turn/end` reason envelope onto the handle outcomes. */
function normalizeTurnReason(raw: unknown): DshRunResult['finishReason'] {
  if (!isRecord(raw)) return 'completed'
  const kind = typeof raw.kind === 'string' ? raw.kind : ''
  if (kind === 'aborted' || kind === 'cancelled' || kind === 'canceled') return 'cancelled'
  if (kind === 'error' || kind === 'failed') return 'failed'
  return 'completed'
}

/** Extract the text of the last assistant message from a session.event event. */
function assistantText(event: Record<string, unknown>): string | undefined {
  if (event.type !== 'assistant/message' || !isRecord(event.data)) return undefined
  if (!isRecord(event.data.message)) return undefined
  const content = event.data.message.content
  if (!Array.isArray(content)) return undefined
  const text = content
    .filter((block): block is Record<string, unknown> => isRecord(block))
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('')
  return text
}

/**
 * Launch the runtime and return its handle after the handshake. The prompt
 * request is started asynchronously so an unresponsive `session/query` still
 * times out and kills the process instead of hanging `startDshRun`.
 */
export async function startDshRun(
  input: DshRunInput,
  options: StartDshRunOptions = {},
): Promise<DshRunHandle> {
  validateRunInput(input)

  const command = (input.command?.trim() || process.env.DSH_BIN?.trim() || 'dsh')
  const args = input.args === undefined ? ['--profile', 'sdk-minimal'] : [...input.args]
  const workspace = resolve(input.workspace)
  const dshHome = resolve(input.dshHome)
  // The route derives per-run paths but must not touch the filesystem; the
  // launcher owns materialising them. 0700 keeps other Unix users out (it does
  // NOT isolate two employees running as the same user — see os-isolation.ts).
  const isolation = resolveOsIsolation()
  let effectiveWorkspace = workspace
  let effectiveHome = dshHome
  let spawnCommand = command
  let spawnArgs = args
  let spawnCwd = workspace
  let childEnv: NodeJS.ProcessEnv = buildDshEnv({ dshHome, env: input.env })
  if (isolation) {
    // Fail closed: a run with no identity must not fall back to the app user.
    const identity = assertIsolationIdentity(input.identity)
    const provisioned = provisionEmployee(isolation, identity, input.runId)
    effectiveWorkspace = provisioned.workspace
    effectiveHome = provisioned.home
    childEnv = {
      ...buildDshEnv({ dshHome: effectiveHome, env: input.env }),
      // The employee user must not inherit the app user's HOME: DSH reads
      // per-user config under it, and the app HOME is not readable by it.
      HOME: provisioned.home,
      TMPDIR: provisioned.tmp,
    }
    childEnv.DSH_RUN_CWD = effectiveWorkspace
    const stringEnv: Record<string, string> = {}
    for (const [key, value] of Object.entries(childEnv)) {
      if (typeof value === 'string') stringEnv[key] = value
    }
    const envFile = writeRunEnvFile(isolation, input.runId, stringEnv)
    const isolated = buildIsolatedSpawn({
      config: isolation,
      provisioned,
      envFile,
      command,
      args,
    })
    spawnCommand = isolated.command
    spawnArgs = isolated.args
    spawnCwd = isolated.cwd
  } else {
    fs.mkdirSync(workspace, { recursive: true, mode: 0o700 })
    fs.mkdirSync(dshHome, { recursive: true, mode: 0o700 })
  }
  const initializeTimeoutMs = positive(input.initializeTimeoutMs, DEFAULT_INITIALIZE_TIMEOUT_MS)
  const requestTimeoutMs = positive(input.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS)
  const shutdownTimeoutMs = positive(input.shutdownTimeoutMs, DEFAULT_SHUTDOWN_TIMEOUT_MS)
  const stopOptions: StopChildOptions = {
    stopGraceMs: input.stopGraceMs,
    killGraceMs: input.killGraceMs,
  }

  const spawnImpl: DshSpawn = options.spawn ?? ((cmd, spawnArgs, spawnOptions) =>
    spawn(cmd, spawnArgs, spawnOptions))

  const child = spawnImpl(spawnCommand, spawnArgs, {
    cwd: spawnCwd,
    env: childEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  })

  let stderrTail = ''
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_CHARS)
  })
  const stderrSuffix = (): string =>
    stderrTail.trim() === '' ? '' : `; stderr tail:\n${stderrTail.trim()}`

  let transport: DshTransport
  try {
    transport = createTransport({ child, defaultTimeoutMs: requestTimeoutMs })
  } catch (error) {
    await stopChildProcess(child, stopOptions)
    throw error
  }

  let spawnFailure: Error | undefined
  child.once('error', (error: Error) => {
    spawnFailure = error
  })

  try {
    const initResult = await transport.request('initialize', {
      cwd: effectiveWorkspace,
      provider: input.provider ?? 'deepseek-official',
      model: input.model ?? 'deepseek-v4-flash',
      // Enable the two opt-in server→client requests so launch/transport can
      // answer them fail-closed instead of leaving an approval hanging.
      approvalRequests: true,
      capabilities: { userQuestions: true },
    }, initializeTimeoutMs)
    if (!isRecord(initResult)) {
      throw new Error(`initialize returned no object: ${JSON.stringify(initResult)}`)
    }
  } catch (error) {
    await transport.close()
    await stopChildProcess(child, stopOptions)
    const cause = spawnFailure ?? error
    throw new Error(`dsh initialize failed: ${errorMessage(cause)}${stderrSuffix()}`, { cause })
  }

  const sessionId = input.sessionId?.trim() || `session-${randomUUID().replaceAll('-', '')}`
  const blocks: TextBlock[] = []
  // The wire protocol has no system-prompt slot. A caller-supplied system
  // prompt is sent as a leading text block of the same user message; this is
  // explicit rather than silently dropped, and can be revisited when the
  // runtime exposes a first-class system prompt.
  if (typeof input.systemPrompt === 'string' && input.systemPrompt.trim() !== '') {
    blocks.push({ type: 'text', text: input.systemPrompt })
  }
  blocks.push({ type: 'text', text: input.prompt })

  const events = new EventQueue()
  let resolveDshResult!: (value: DshRunResult) => void
  const result = new Promise<DshRunResult>((resolveResult) => {
    resolveDshResult = resolveResult
  })
  let resultSettled = false
  let sequence = 0
  let finalResponse = ''
  let lastTurnReason: unknown
  let receipt: RunReceipt | undefined
  let earlyCompletion: Record<string, unknown> | undefined
  let termination: Promise<boolean> | undefined
  let timeoutTimer: NodeJS.Timeout | undefined

  const settle = (value: DshRunResult): void => {
    if (resultSettled) return
    resultSettled = true
    if (timeoutTimer !== undefined) clearTimeout(timeoutTimer)
    input.signal?.removeEventListener('abort', onAbort)
    events.end()
    resolveDshResult(value)
  }

  const stop = async (): Promise<boolean> => {
    const confirmed = await stopChildProcess(child, stopOptions)
    await transport.close()
    return confirmed
  }

  const finishRun = (
    finishReason: DshRunResult['finishReason'],
    error?: string,
    attemptShutdown = true,
  ): Promise<boolean> => {
    if (termination !== undefined) return termination
    termination = (async () => {
      if (attemptShutdown && !hasExited(child)) {
        try {
          await transport.request('shutdown', undefined, shutdownTimeoutMs)
        } catch {
          // The terminate ladder below is authoritative; a runtime that cannot
          // answer shutdown is exactly the case it exists for.
        }
      }
      const confirmed = await stop()
      settle({
        finalResponse,
        finishReason,
        ...(error === undefined ? {} : { error }),
      })
      return confirmed
    })()
    return termination
  }

  const handleCompletion = (params: Record<string, unknown>): void => {
    if (receipt === undefined) {
      earlyCompletion ??= params
      return
    }
    if (receipt.kind === 'command') {
      const commandId = params.commandId
      if (typeof commandId === 'string' && commandId !== receipt.commandId) return
    }
    const finishReason = normalizeFinishReason(params.finishReason)
    const final = typeof params.finalResponse === 'string' ? params.finalResponse : finalResponse
    const error = finishReason === 'failed'
      ? (typeof params.finishReason === 'string' ? params.finishReason : 'dsh run failed')
      : undefined
    settle({
      finalResponse: final,
      finishReason,
      ...(error === undefined ? {} : { error }),
    })
  }

  transport.onNotification((method, params) => {
    const record = isRecord(params) ? params : {}
    if (method === 'session.query.completed') {
      if (typeof record.sessionId === 'string' && record.sessionId !== sessionId) return
      handleCompletion(record)
      return
    }

    sequence += 1
    events.push({ seq: sequence, type: method, payload: params })

    if (method === 'session.event') {
      const event = isRecord(record.event) ? record.event : undefined
      if (event === undefined) return
      if (typeof record.sessionId === 'string' && record.sessionId !== sessionId) return
      const text = assistantText(event)
      if (text !== undefined) finalResponse = text
      if (event.type === 'turn/end' && isRecord(event.data)) lastTurnReason = event.data.reason
      return
    }
    if (method === 'session.status') {
      if (record.sessionId !== sessionId || record.status !== 'idle') return
      if (receipt?.kind !== 'prompt' || resultSettled) return
      settle({ finalResponse, finishReason: normalizeTurnReason(lastTurnReason) })
    }
  })

  child.on('exit', (code, signal) => {
    if (resultSettled || termination !== undefined) return
    void finishRun(
      'failed',
      `dsh exited before the run completed (code ${String(code)}, signal ${String(signal)})${stderrSuffix()}`,
      false,
    )
  })
  child.on('error', (error: Error) => {
    if (resultSettled || termination !== undefined) return
    void finishRun('failed', `dsh process error: ${errorMessage(error)}${stderrSuffix()}`, false)
  })

  const cancel = async (reason?: string): Promise<void> => {
    await finishRun('cancelled', reason ?? 'cancelled')
  }
  const onAbort = (): void => {
    const reason = input.signal?.reason
    void cancel(reason instanceof Error ? reason.message : 'aborted')
  }

  let closeInFlight: Promise<{ stopped: boolean }> | undefined
  const handle: DshRunHandle = {
    sessionId,
    events,
    result,
    cancel,
    close: async () => {
      if (closeInFlight !== undefined) return closeInFlight
      closeInFlight = (async () => {
        if (termination !== undefined) return { stopped: await termination }
        if (resultSettled) return { stopped: await stop() }
        return { stopped: await finishRun('cancelled', 'run closed before completion') }
      })()
      return closeInFlight
    },
  }

  // total run bound starts after the handshake; a hung `session/query` is
  // still bounded by this timer because it is started before the request.
  timeoutTimer = setTimeout(() => {
    void finishRun('timed-out', `dsh run timed out after ${input.timeoutMs}ms`)
  }, input.timeoutMs)
  timeoutTimer.unref()

  if (input.signal !== undefined) {
    if (input.signal.aborted) onAbort()
    else input.signal.addEventListener('abort', onAbort, { once: true })
  }

  void (async () => {
    if (resultSettled || termination !== undefined) return
    try {
      const response = await transport.request('session/query', {
        sessionId,
        contentBlocks: blocks,
      }, requestTimeoutMs)
      if (resultSettled) return
      receipt = parseReceipt(response)
      if (earlyCompletion !== undefined) {
        const completion = earlyCompletion
        earlyCompletion = undefined
        handleCompletion(completion)
      }
    } catch (error) {
      if (resultSettled || termination !== undefined) return
      void finishRun('failed', `session/query failed: ${errorMessage(error)}${stderrSuffix()}`)
    }
  })()

  return handle
}

function parseReceipt(response: unknown): RunReceipt {
  if (!isRecord(response)) {
    throw new Error(`session/query returned no object: ${JSON.stringify(response)}`)
  }
  if (response.kind === 'prompt' && typeof response.messageId === 'string' && response.messageId !== '') {
    return { kind: 'prompt', messageId: response.messageId }
  }
  if (response.kind === 'command' && isRecord(response.execution)
    && typeof response.execution.commandId === 'string' && response.execution.commandId !== '') {
    return { kind: 'command', commandId: response.execution.commandId }
  }
  throw new Error(`session/query returned an invalid receipt: ${JSON.stringify(response)}`)
}
