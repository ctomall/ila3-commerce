/**
 * One access line per AI request, so an edge 502 can be traced back to a
 * concrete request: status, wall-clock duration, the DSH run id, and how the
 * stream ended. A client that disconnects (Cloudflare cancel, closed tab) shows
 * up as `outcome: client_cancel`, which previously left no trace at all.
 *
 * The access id is generated here (or forwarded from the agentic bridge) so the
 * agentic hop and the DSH chat hop of the same turn can be joined in the log.
 */
import { randomUUID } from 'node:crypto'
import { createLogger } from '@open-mercato/shared/lib/logger'

const logger = createLogger('ai-access')

export type AiAccessState = {
  route: string
  path: string
  accessId: string
  startedAt: number
  runId: string | null
  userId: string | null
  logged: boolean
}

const states = new WeakMap<object, AiAccessState>()

type AccessSink = (entry: Record<string, unknown>) => void
const defaultSink: AccessSink = (entry) => logger.info('ai.access', entry)
let sink: AccessSink = defaultSink

/** Test seam: capture entries instead of writing them to the process log. */
export function setAiAccessSink(next: AccessSink | null): void {
  sink = next ?? defaultSink
}

export function beginAiAccess(req: object, route: string, path: string, accessId?: string | null): AiAccessState {
  const state: AiAccessState = {
    route,
    path,
    accessId: (accessId && accessId.trim()) || `acc-${randomUUID().slice(0, 12)}`,
    startedAt: Date.now(),
    runId: null,
    userId: null,
    logged: false,
  }
  states.set(req, state)
  return state
}

export function aiAccessId(req: object): string | null {
  return states.get(req)?.accessId ?? null
}

export function noteAiRunId(req: object, runId: string | null | undefined): void {
  if (!runId) return
  const state = states.get(req)
  if (state && !state.runId) state.runId = runId
}

export function noteAiUserId(req: object, userId: string | null | undefined): void {
  if (!userId) return
  const state = states.get(req)
  if (state && !state.userId) state.userId = userId
}

export function logAiAccess(req: object, status: number, outcome: string): void {
  const state = states.get(req)
  if (!state || state.logged) return
  state.logged = true
  sink({
    route: state.route,
    path: state.path,
    accessId: state.accessId,
    status,
    durationMs: Date.now() - state.startedAt,
    runId: state.runId,
    userId: state.userId,
    outcome,
  })
}

/**
 * Log the request once its body is finished: immediately for JSON replies, and
 * on stream close / cancel / error for SSE replies. The cancel branch is the
 * one that makes an edge-side 502 visible on the origin.
 */
export function wrapAiAccess(req: object, response: Response): Response {
  const state = states.get(req)
  const contentType = response.headers.get('content-type') ?? ''
  const isSse = contentType.includes('text/event-stream')
  if (!state || !response.body || !isSse) {
    if (state) logAiAccess(req, response.status, 'json')
    return response
  }

  const reader = response.body.getReader()
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          logAiAccess(req, response.status, 'end')
          controller.close()
          return
        }
        controller.enqueue(value)
      } catch (error) {
        logAiAccess(req, response.status, 'stream_error')
        controller.error(error)
      }
    },
    async cancel(reason) {
      logAiAccess(req, response.status, 'client_cancel')
      try {
        await reader.cancel(reason)
      } catch {
        // The upstream body may already be gone; the access line is what matters.
      }
    },
  })

  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return new Response(stream, { status: response.status, statusText: response.statusText, headers })
}
