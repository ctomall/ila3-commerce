/**
 * Newline-delimited JSON-RPC 2.0 client for one DSH runtime stdio pair.
 *
 * This is deliberately a small local implementation instead of an import of
 * `@deepseek-ai/dsh-sdk-client`: the CRM only needs the wire shapes in
 * `types.ts`, and owning the framing keeps the server's dependency surface and
 * test story local. It matches the published SDK protocol:
 *
 *   - one JSON object per `\n`-terminated line (`\r\n` accepted),
 *   - `id + method` is a request, `id` alone a response, `method` alone a
 *     notification; malformed lines are ignored,
 *   - pending requests are keyed by id and every one of them is rejected when
 *     the transport closes or the peer's input ends,
 *   - `approval/request` and `user-question/ask` are answered by default with
 *     `rejected` / `cancelled`, so a runtime that asks cannot hang the run.
 */

import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'
import type { Readable, Writable } from 'node:stream'
import type { JsonRpcTransport } from './types'

/** Default per-request deadline when a caller supplies none. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

/** A request exceeded its deadline. The pending entry is removed first. */
export class DshRequestTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DshRequestTimeoutError'
  }
}

/** The peer answered with a JSON-RPC error frame; code/data are preserved. */
export class DshResponseError extends Error {
  constructor(
    readonly code: number | undefined,
    message: string,
    readonly data?: unknown,
  ) {
    super(message)
    this.name = 'DshResponseError'
  }
}

/** The transport is closed or its input ended; later requests fail fast. */
export class DshTransportClosedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DshTransportClosedError'
  }
}

/** A malformed or unsupported wire exchange. */
export class DshProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DshProtocolError'
  }
}

export type CreateTransportOptions =
  | {
      /** Readable peer output (the runtime's stdout). */
      input: Readable
      /** Writable peer input (the runtime's stdin). */
      output: Writable
      child?: never
      defaultTimeoutMs?: number
    }
  | {
      /** Child process whose piped stdio is used. */
      child: ChildProcess
      input?: never
      output?: never
      defaultTimeoutMs?: number
    }

/** Transport returned by {@link createTransport}; adds a readable closed flag. */
export interface DshTransport extends JsonRpcTransport {
  readonly closed: boolean
}

type JsonRpcId = string | number

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

type RequestHandler = (method: string, params: Record<string, unknown>) => Promise<unknown>
type NotificationListener = (method: string, params: unknown) => void

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Construct a transport over injected streams or a child's piped stdio.
 *
 * Injected streams are never destroyed: `close()` only detaches listeners and
 * rejects pending requests, leaving the owner to tear its own resource down.
 */
export function createTransport(options: CreateTransportOptions): DshTransport {
  let input: Readable | null | undefined
  let output: Writable | null | undefined
  if ('child' in options && options.child !== undefined) {
    input = options.child.stdout
    output = options.child.stdin
  } else {
    input = options.input
    output = options.output
  }
  if (input === null || input === undefined || output === null || output === undefined) {
    throw new DshProtocolError('createTransport requires piped input and output streams')
  }
  return new JsonRpcNdjsonTransport(input, output, options.defaultTimeoutMs)
}

class JsonRpcNdjsonTransport implements DshTransport {
  private readonly decoder = new StringDecoder('utf8')
  private readonly pending = new Map<JsonRpcId, PendingRequest>()
  private readonly notificationListeners = new Set<NotificationListener>()
  private readonly defaultTimeoutMs: number
  private buffer = ''
  private failure: Error | undefined
  private requestHandler: RequestHandler | undefined
  private detachListeners: () => void = () => {}
  private isClosed = false

  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
    defaultTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {
    this.defaultTimeoutMs = Number.isFinite(defaultTimeoutMs) && defaultTimeoutMs > 0
      ? defaultTimeoutMs
      : DEFAULT_REQUEST_TIMEOUT_MS
    this.attach()
  }

  get closed(): boolean {
    return this.isClosed
  }

  request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown> {
    if (this.isClosed) {
      return Promise.reject(new DshTransportClosedError('JSON-RPC transport closed'))
    }
    if (this.failure !== undefined) return Promise.reject(this.failure)
    if (typeof method !== 'string' || method.length === 0) {
      return Promise.reject(new DshProtocolError('JSON-RPC method must be a non-empty string'))
    }
    const timeout = timeoutMs ?? this.defaultTimeoutMs
    if (!Number.isFinite(timeout) || timeout <= 0) {
      return Promise.reject(new DshProtocolError(`request timeout must be positive, got ${String(timeout)}`))
    }
    const id = `req_${randomUUID().replaceAll('-', '')}`
    return new Promise<unknown>((resolve, reject) => {
      let detach = (): void => {}
      const pending: PendingRequest = {
        resolve: (value) => {
          detach()
          resolve(value)
        },
        reject: (error) => {
          detach()
          reject(error)
        },
      }
      this.pending.set(id, pending)
      // The deadline is an abandonment: remove the pending entry and ignore a
      // late response, rather than letting a hung peer retain per-request state.
      const deadline = AbortSignal.timeout(timeout)
      const onDeadline = (): void => {
        if (!this.pending.delete(id)) return
        detach()
        reject(new DshRequestTimeoutError(`${method} timed out after ${timeout}ms`))
      }
      deadline.addEventListener('abort', onDeadline, { once: true })
      detach = () => deadline.removeEventListener('abort', onDeadline)
      try {
        this.writeMessage(params === undefined
          ? { jsonrpc: '2.0', id, method }
          : { jsonrpc: '2.0', id, method, params })
      } catch (error) {
        this.pending.delete(id)
        detach()
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  notify(method: string, params?: unknown): void {
    if (this.isClosed) throw new DshTransportClosedError('JSON-RPC transport closed')
    if (this.failure !== undefined) throw this.failure
    this.writeMessage(params === undefined
      ? { jsonrpc: '2.0', method }
      : { jsonrpc: '2.0', method, params })
  }

  onNotification(listener: NotificationListener): () => void {
    this.notificationListeners.add(listener)
    return () => this.notificationListeners.delete(listener)
  }

  onRequest(handler: RequestHandler): void {
    this.requestHandler = handler
  }

  async close(): Promise<void> {
    if (this.isClosed) return
    this.isClosed = true
    this.detachListeners()
    this.failPending(new DshTransportClosedError('JSON-RPC transport closed'))
  }

  private attach(): void {
    const onData = (chunk: Buffer | string): void => {
      this.buffer += typeof chunk === 'string' ? chunk : this.decoder.write(chunk)
      this.drainLines()
    }
    const onInputError = (error: Error): void => {
      this.failPending(error)
    }
    const onInputEnd = (): void => {
      this.buffer += this.decoder.end()
      this.drainLines()
      this.failPending(new DshTransportClosedError('JSON-RPC input closed'))
    }
    const onOutputError = (error: Error): void => {
      this.failPending(error)
    }
    this.input.on('data', onData)
    this.input.on('error', onInputError)
    this.input.on('end', onInputEnd)
    this.output.on('error', onOutputError)
    this.detachListeners = () => {
      this.input.off('data', onData)
      this.input.off('error', onInputError)
      this.input.off('end', onInputEnd)
      this.output.off('error', onOutputError)
    }
  }

  private drainLines(): void {
    for (;;) {
      const newline = this.buffer.indexOf('\n')
      if (newline < 0) return
      const raw = this.buffer.slice(0, newline)
      this.buffer = this.buffer.slice(newline + 1)
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
      if (line.trim() === '') continue
      void this.handleLine(line)
    }
  }

  private async handleLine(line: string): Promise<void> {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      // A malformed peer line is ignored, never fatal: partial writes and
      // diagnostic output on the same pipe must not kill the run.
      return
    }
    if (!isRecord(parsed)) return
    const id = parsed.id
    const hasId = typeof id === 'string' || typeof id === 'number'
    if (hasId && typeof parsed.method === 'string') {
      await this.handleIncomingRequest(id, parsed.method, parsed.params)
      return
    }
    if (hasId) {
      this.handleIncomingResponse(id, parsed)
      return
    }
    if (typeof parsed.method === 'string') {
      const params = isRecord(parsed.params) ? parsed.params : {}
      for (const listener of [...this.notificationListeners]) {
        try {
          listener(parsed.method, params)
        } catch {
          // A listener's failure belongs to that listener; keep the read loop
          // alive so one bad consumer cannot stall the session.
        }
      }
    }
  }

  private async handleIncomingRequest(
    id: JsonRpcId,
    method: string,
    params: unknown,
  ): Promise<void> {
    const normalized = isRecord(params) ? params : {}
    const handler = this.requestHandler
    if (handler === undefined && method !== 'approval/request' && method !== 'user-question/ask') {
      this.writeError(id, -32601, `method not found: ${method}`)
      return
    }
    try {
      const result = handler === undefined
        ? await defaultServerRequestAnswer(method)
        : await handler(method, normalized)
      this.writeMessage({ jsonrpc: '2.0', id, result })
    } catch (error) {
      this.writeError(id, -32603, errorMessage(error))
    }
  }

  private handleIncomingResponse(id: JsonRpcId, frame: Record<string, unknown>): void {
    const pending = this.pending.get(id)
    if (pending === undefined) return
    this.pending.delete(id)
    const error = frame.error
    if (isRecord(error)) {
      pending.reject(new DshResponseError(
        typeof error.code === 'number' ? error.code : undefined,
        typeof error.message === 'string' ? error.message : 'JSON-RPC error',
        error.data,
      ))
      return
    }
    pending.resolve(frame.result)
  }

  private writeError(id: JsonRpcId, code: number, message: string): void {
    try {
      this.writeMessage({ jsonrpc: '2.0', id, error: { code, message } })
    } catch {
      // The input may already be gone; the pending request failure path reports it.
    }
  }

  private writeMessage(message: Record<string, unknown>): void {
    if (this.isClosed) throw new DshTransportClosedError('JSON-RPC transport closed')
    if (this.failure !== undefined) throw this.failure
    this.output.write(`${JSON.stringify(message)}\n`)
  }

  private failPending(error: Error): void {
    this.failure ??= error
    const pending = [...this.pending.values()]
    this.pending.clear()
    for (const entry of pending) entry.reject(error)
  }
}

/**
 * Fail-closed answers for the two server-to-client requests the SDK protocol
 * defines. Approval is denied once rather than remembered; a user question is
 * dismissed (`cancelled: true`, never an empty "answer") so the runtime does
 * not mistake silence for consent.
 */
function defaultServerRequestAnswer(method: string): Promise<unknown> {
  if (method === 'approval/request') return Promise.resolve({ outcome: 'rejected' })
  if (method === 'user-question/ask') return Promise.resolve({ cancelled: true })
  return Promise.reject(new DshProtocolError(`unsupported server request: ${method}`))
}

/** Re-export the minimal contract type for callers that type the seam. */
export type { JsonRpcTransport }
