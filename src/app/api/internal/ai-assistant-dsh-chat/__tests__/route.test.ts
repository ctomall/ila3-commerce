/** @jest-environment node */

import { NextRequest } from 'next/server'

const mockStartDshRun = jest.fn()

jest.mock('@/lib/dsh/runtime', () => ({ startDshRun: mockStartDshRun }))

jest.mock('@/bootstrap-api', () => ({ bootstrap: jest.fn() }))

const mockGetAuthFromRequest = jest.fn()

jest.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: mockGetAuthFromRequest,
}))

jest.mock('@open-mercato/shared/lib/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}))

import { POST } from '../route'
import type { DshEvent, DshRunHandle, DshRunResult } from '@/lib/dsh/runtime/types'

type SseEvent = { type: string; [key: string]: unknown }

function chatRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ai_assistant/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeHandle(options: {
  events?: DshEvent[]
  throwAfterEvents?: Error
  result?: DshRunResult
  sessionId?: string
}): DshRunHandle {
  const sessionId = options.sessionId ?? 'dsh-session-1'
  const result: DshRunResult = options.result ?? {
    finalResponse: '',
    finishReason: 'completed',
  }

  const events = (async function* (): AsyncGenerator<DshEvent> {
    for (const event of options.events ?? []) yield event
    if (options.throwAfterEvents) throw options.throwAfterEvents
  })()

  return {
    sessionId,
    events,
    result: Promise.resolve(result),
    cancel: jest.fn(async () => undefined),
    close: jest.fn(async () => ({ stopped: true })),
  }
}

async function readSse(response: Response): Promise<SseEvent[]> {
  const body = await response.text()
  return body
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      expect(chunk.startsWith('data: ')).toBe(true)
      return JSON.parse(chunk.slice('data: '.length)) as SseEvent
    })
}

const userMessages = [{ role: 'user', content: 'hi' }]

beforeEach(() => {
  jest.clearAllMocks()
  process.env.OM_DSH_ROOT = '/tmp/om-dsh-route-test'
  delete process.env.OM_DSH_RUN_TIMEOUT_MS
  mockGetAuthFromRequest.mockResolvedValue({
    sub: 'user-1',
    tenantId: 'tenant-1',
    orgId: 'org-1',
  })
})

afterAll(() => {
  delete process.env.OM_DSH_ROOT
  delete process.env.OM_DSH_RUN_TIMEOUT_MS
})

describe('POST /api/internal/ai-assistant-dsh-chat', () => {
  it('returns 401 without touching the runtime when unauthenticated', async () => {
    mockGetAuthFromRequest.mockResolvedValueOnce(null)

    const response = await POST(chatRequest({ messages: userMessages }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(mockStartDshRun).not.toHaveBeenCalled()
  })

  it('rejects a body without messages before starting a run', async () => {
    const response = await POST(chatRequest({ sessionId: 's-1' }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'messages array is required' })
    expect(mockStartDshRun).not.toHaveBeenCalled()
  })

  it('starts the run with server-side identity and maps the DSH stream to the existing SSE shapes', async () => {
    const handle = makeHandle({
      events: [
        // Real wire shape from A1: {sessionId, event:{type,seq,time,data}}.
        { seq: 1, type: 'session.status', payload: { sessionId: 'dsh-session-1', status: 'running' } },
        {
          seq: 2,
          type: 'session.event',
          payload: {
            sessionId: 'dsh-session-1',
            event: {
              type: 'assistant/message',
              seq: 0,
              time: 0,
              data: {
                turn: 1,
                step: 1,
                message: {
                  id: 'msg-1',
                  role: 'assistant',
                  content: [
                    { type: 'reasoning', text: 'thinking hard' },
                    { type: 'text', text: 'Hel' },
                    { type: 'text', text: 'lo' },
                  ],
                },
              },
            },
          },
        },
        // DSH republishes the same message on update; it must be emitted once.
        {
          seq: 3,
          type: 'session.event',
          payload: {
            sessionId: 'dsh-session-1',
            event: {
              type: 'assistant/message',
              seq: 1,
              time: 1,
              data: {
                turn: 1,
                step: 1,
                message: { id: 'msg-1', role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
              },
            },
          },
        },
        {
          seq: 4,
          type: 'session.event',
          payload: {
            sessionId: 'dsh-session-1',
            event: {
              type: 'tool/call',
              seq: 2,
              time: 2,
              data: { turn: 1, step: 1, callId: 'call-1', name: 'crm.find_companies', arguments: '{"q":"acme"}' },
            },
          },
        },
        {
          seq: 5,
          type: 'session.event',
          payload: {
            sessionId: 'dsh-session-1',
            event: {
              type: 'tool/result',
              seq: 3,
              time: 3,
              data: {
                turn: 1,
                step: 1,
                message: {
                  role: 'tool',
                  toolCallId: 'call-1',
                  content: [{ type: 'text', text: 'ok' }],
                },
              },
            },
          },
        },
        {
          seq: 6,
          type: 'session.event',
          payload: {
            sessionId: 'dsh-session-1',
            event: { type: 'agent/inbox/spliced', seq: 4, time: 4, data: { count: 1 } },
          },
        },
        {
          seq: 7,
          type: 'session.event',
          payload: {
            sessionId: 'dsh-session-1',
            event: { type: 'turn/end', seq: 5, time: 5, data: { reason: { kind: 'completed' } } },
          },
        },
      ],
      result: { finalResponse: 'Hello', finishReason: 'completed' },
    })
    mockStartDshRun.mockResolvedValueOnce(handle)

    const response = await POST(
      chatRequest({
        messages: userMessages,
        sessionId: 'session-abc',
        // Untrusted identity fields: the route must ignore them.
        actor: 'body-actor',
        userId: 'body-user',
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream')

    const events = await readSse(response)
    expect(events.map((event) => event.type)).toEqual([
      'thinking',
      'debug',
      'debug',
      'text',
      'text',
      'tool-call',
      'tool-result',
      'dsh.event',
      'done',
    ])

    expect(events[1]).toMatchObject({ type: 'debug', partType: 'status' })
    expect(events[2]).toEqual({ type: 'debug', partType: 'thinking', data: { text: 'thinking hard' } })
    expect(events[3]).toEqual({ type: 'text', content: 'Hel' })
    expect(events[4]).toEqual({ type: 'text', content: 'lo' })
    expect(events[5]).toEqual({
      type: 'tool-call',
      id: 'call-1',
      toolName: 'crm.find_companies',
      args: { q: 'acme' },
    })
    expect(events[6]).toEqual({
      type: 'tool-result',
      id: 'call-1',
      result: [{ type: 'text', text: 'ok' }],
    })
    expect(events[7]).toMatchObject({
      type: 'dsh.event',
      dshType: 'session.event',
      dshEventType: 'agent/inbox/spliced',
      seq: 6,
    })
    expect(events[8]).toEqual({ type: 'done', sessionId: 'dsh-session-1' })
    expect(events.filter((event) => event.type === 'done')).toHaveLength(1)

    expect(mockStartDshRun).toHaveBeenCalledTimes(1)
    const input = mockStartDshRun.mock.calls[0][0] as {
      prompt: string
      sessionId?: string
      timeoutMs: number
      workspace: string
      dshHome: string
    }
    expect(input).toMatchObject({ prompt: 'hi', sessionId: 'session-abc' })
    expect(input.workspace.startsWith('/tmp/om-dsh-route-test/workspaces/')).toBe(true)
    expect(input.dshHome.startsWith('/tmp/om-dsh-route-test/homes/')).toBe(true)
    // Derived paths are hashed: no readable identity leaks into the filesystem.
    expect(input.workspace).not.toContain('tenant-1')
    expect(input.workspace).not.toContain('user-1')
    expect(input.dshHome).not.toContain('user-1')

    expect(handle.close).toHaveBeenCalledTimes(1)
  })

  it('emits the final response as text when DSH only reports it on the result', async () => {
    const handle = makeHandle({
      events: [{ seq: 1, type: 'session.status', payload: { status: 'running' } }],
      result: { finalResponse: 'final answer from result', finishReason: 'completed' },
    })
    mockStartDshRun.mockResolvedValueOnce(handle)

    const events = await readSse(await POST(chatRequest({ messages: userMessages })))

    expect(events.map((event) => event.type)).toEqual(['thinking', 'debug', 'text', 'done'])
    expect(events[2]).toEqual({ type: 'text', content: 'final answer from result' })
    expect(events[3]).toEqual({ type: 'done', sessionId: 'dsh-session-1' })
  })

  it('returns 501 for answerQuestion instead of silently succeeding', async () => {
    const response = await POST(
      chatRequest({
        answerQuestion: { questionId: 'q-1', answer: 0, sessionId: 's-1' },
      }),
    )

    expect(response.status).toBe(501)
    await expect(response.json()).resolves.toEqual({
      error: 'answerQuestion is not supported by the DSH engine yet',
      code: 'dsh_answer_question_unsupported',
    })
    expect(mockStartDshRun).not.toHaveBeenCalled()
  })

  it('returns 502 with a JSON error when the runtime cannot start', async () => {
    mockStartDshRun.mockRejectedValueOnce(new Error('spawn failed'))

    const response = await POST(chatRequest({ messages: userMessages }))

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ error: 'DSH runtime failed to start' })
  })

  it('emits an error event and still closes with done when the event stream fails', async () => {
    const handle = makeHandle({
      events: [{ seq: 1, type: 'session.event', payload: { delta: 'partial' } }],
      throwAfterEvents: new Error('transport dropped'),
      result: { finalResponse: '', finishReason: 'failed', error: 'transport dropped' },
    })
    mockStartDshRun.mockResolvedValueOnce(handle)

    const events = await readSse(await POST(chatRequest({ messages: userMessages })))

    expect(events.map((event) => event.type)).toEqual(['thinking', 'text', 'error', 'done'])
    expect(events[2]).toEqual({ type: 'error', error: 'transport dropped' })
    expect(events[3]).toEqual({ type: 'done', sessionId: 'dsh-session-1' })
    expect(handle.close).toHaveBeenCalledTimes(1)
  })

  it('emits an error event and done when the run result reports failure', async () => {
    const handle = makeHandle({
      events: [],
      result: { finalResponse: '', finishReason: 'failed', error: 'model exploded' },
    })
    mockStartDshRun.mockResolvedValueOnce(handle)

    const events = await readSse(await POST(chatRequest({ messages: userMessages })))

    expect(events.map((event) => event.type)).toEqual(['thinking', 'error', 'done'])
    expect(events[1]).toEqual({ type: 'error', error: 'model exploded' })
  })
})
