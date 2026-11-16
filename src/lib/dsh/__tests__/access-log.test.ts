import { afterEach, describe, expect, it } from '@jest/globals'
import {
  beginAiAccess,
  logAiAccess,
  noteAiRunId,
  setAiAccessSink,
  wrapAiAccess,
} from '@/lib/dsh/access-log'

type Entry = Record<string, unknown>

function capture(): Entry[] {
  const entries: Entry[] = []
  setAiAccessSink((entry) => entries.push(entry))
  return entries
}

afterEach(() => setAiAccessSink(null))

describe('ai access log', () => {
  it('logs a JSON response with status, duration and run id', () => {
    const entries = capture()
    const req = {}
    beginAiAccess(req, 'dsh-chat', '/api/ai_assistant/chat')
    noteAiRunId(req, 'run-1')
    wrapAiAccess(req, new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }))
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      route: 'dsh-chat',
      path: '/api/ai_assistant/chat',
      status: 200,
      runId: 'run-1',
      outcome: 'json',
    })
    expect(typeof entries[0].durationMs).toBe('number')
  })

  it('logs an ended stream once', async () => {
    const entries = capture()
    const req = {}
    beginAiAccess(req, 'dsh-chat', '/api/ai_assistant/chat')
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: hi\n\n'))
        controller.close()
      },
    })
    const wrapped = wrapAiAccess(req, new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }))
    const text = await new Response(wrapped.body).text()
    expect(text).toBe('data: hi\n\n')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ status: 200, outcome: 'end' })
  })

  it('logs a client cancel as its own outcome', async () => {
    const entries = capture()
    const req = {}
    beginAiAccess(req, 'agentic-chat', '/api/ai_assistant/ai/chat')
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: partial\n\n'))
      },
    })
    const wrapped = wrapAiAccess(req, new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }))
    await wrapped.body!.cancel('edge hung up')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ outcome: 'client_cancel' })
  })

  it('never logs the same request twice', () => {
    const entries = capture()
    const req = {}
    beginAiAccess(req, 'dsh-chat', '/api/ai_assistant/chat')
    logAiAccess(req, 400, 'json')
    logAiAccess(req, 500, 'throw')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ status: 400 })
  })
})
