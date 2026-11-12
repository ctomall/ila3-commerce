/** @jest-environment node */

import { afterAll, beforeEach, describe, expect, it, jest, test } from '@jest/globals'
import { createHash } from 'node:crypto'

import { NextRequest } from 'next/server'

import type { DshRunHandle, DshRunInput } from '@/lib/dsh/runtime/types'
import type {
  FinishRunInput,
  ReplayRunResult,
  RunIdentity,
  SubmitServiceInput,
  SubmitServiceResult,
} from '@/modules/dsh_runs/services/run-service'
import { TerminalRunError } from '@/modules/dsh_runs/services/run-store'
import type { BindingRecord, RunEventRecord, RunRecord } from '@/modules/dsh_runs/services/run-store'

const mockStartDshRun = jest.fn<(input: DshRunInput) => Promise<DshRunHandle>>()

jest.mock('@/lib/dsh/runtime', () => ({ startDshRun: mockStartDshRun }))

jest.mock('@/bootstrap-api', () => ({ bootstrap: jest.fn() }))

const mockGetAuthFromRequest = jest.fn<
  () => Promise<{ sub: string; tenantId: string | null; orgId: string | null } | null>
>()

jest.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: mockGetAuthFromRequest,
}))

const mockLog = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

jest.mock('@open-mercato/shared/lib/logger', () => ({
  createLogger: () => mockLog,
}))

type FakeRunService = {
  ensureBinding: jest.Mock<(identity: RunIdentity, assistantId?: string) => Promise<BindingRecord>>
  submit: jest.Mock<(input: SubmitServiceInput) => Promise<SubmitServiceResult>>
  begin: jest.Mock<(runId: string, input: { sessionId: string }) => Promise<RunRecord>>
  appendEvent: jest.Mock<
    (runId: string, input: { type: string; payload?: unknown }) => Promise<RunEventRecord>
  >
  finish: jest.Mock<(runId: string, input: FinishRunInput) => Promise<RunRecord>>
  getRun: jest.Mock<(runId: string) => Promise<RunRecord | null>>
  recoverInFlight: jest.Mock<() => Promise<Array<{ runId: string; createdAt: string }>>>
  replay: jest.Mock<(userId: string, runId: string, cursor?: number) => Promise<ReplayRunResult>>
}

const mockCreateRequestRunService = jest.fn<() => Promise<FakeRunService>>()

jest.mock('@/modules/dsh_runs/services/run-service', () => ({
  createRequestRunService: mockCreateRequestRunService,
}))

const mockOpenCodePost = jest.fn(async () => new Response('opencode', { status: 200 }))

jest.mock('@/lib/dsh/opencode-fallback', () => ({
  callOpenCodeChat: mockOpenCodePost,
}))

import { POST } from '../route'
import type { DshEvent, DshRunResult } from '@/lib/dsh/runtime/types'
import { verifyRunToken } from '@/lib/dsh/tool-bridge/run-token'

const TOOL_WIRING_ENV_KEYS = [
  'OM_DSH_MCP_SCRIPT',
  'OM_DSH_BRIDGE_URL',
  'OM_DSH_CRM_PATCH',
  'OM_DSH_RUN_TOKEN_SECRET',
  'OM_DSH_TOOL_TOKEN',
] as const

type SseEvent = { type: string; [key: string]: unknown }

function chatRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/ai_assistant/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
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

type SseFrame = { event: SseEvent; id?: number }

/** Persisted frames may carry an `id: <seq>` line before `data:`. */
async function readSseFrames(response: Response): Promise<SseFrame[]> {
  const body = await response.text()
  return body
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      const lines = chunk.split('\n')
      const idLine = lines.find((line) => line.startsWith('id: '))
      const dataLine = lines.find((line) => line.startsWith('data: '))
      expect(dataLine).toBeDefined()
      return {
        ...(idLine ? { id: Number(idLine.slice('id: '.length)) } : {}),
        event: JSON.parse(dataLine!.slice('data: '.length)) as SseEvent,
      }
    })
}

function bindingRecord(overrides: Partial<BindingRecord> = {}): BindingRecord {
  return {
    id: 'binding-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    userId: 'user-1',
    assistantId: 'crm-assistant',
    status: 'active',
    revision: 1,
    createdAt: '2026-11-11T09:00:00.000Z',
    updatedAt: '2026-11-11T09:00:00.000Z',
    ...overrides,
  }
}

function persistedRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: 'run-1',
    bindingId: 'binding-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    sessionId: 'dsh-session-1',
    status: 'queued',
    idempotencyKey: 'key-1',
    requestHash: 'hash-1',
    cursor: 0,
    resultJson: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-11-11T09:00:00.000Z',
    ...overrides,
  }
}

function persistedEvent(overrides: Partial<RunEventRecord> = {}): RunEventRecord {
  return {
    id: 'event-1',
    runId: 'run-1',
    seq: 1,
    type: 'thinking',
    payloadJson: { type: 'thinking' },
    createdAt: '2026-11-11T09:00:00.000Z',
    ...overrides,
  }
}

function fakeRunService(): FakeRunService {
  let seq = 0
  return {
    ensureBinding: jest.fn(async () => bindingRecord()),
    submit: jest.fn(async () => ({ run: persistedRun(), replay: false })),
    begin: jest.fn(async (runId: string, input: { sessionId: string }) =>
      persistedRun({ id: runId, status: 'running', sessionId: input.sessionId }),
    ),
    appendEvent: jest.fn(async (_runId: string, input: { type: string; payload?: unknown }) =>
      persistedEvent({ seq: ++seq, type: input.type, payloadJson: input.payload }),
    ),
    finish: jest.fn(async (runId: string, input: FinishRunInput) =>
      persistedRun({ id: runId, status: input.status }),
    ),
    // Default: still running. The poll is stopped before terminal finish on the
    // normal path, so tests do not have to advance timers.
    getRun: jest.fn(async (runId: string) => persistedRun({ id: runId, status: 'running' })),
    recoverInFlight: jest.fn(async () => []),
    replay: jest.fn(async () => ({
      run: persistedRun({ status: 'completed' }),
      events: [] as RunEventRecord[],
      resumable: true,
    })),
  }
}

const userMessages = [{ role: 'user', content: 'hi' }]

beforeEach(() => {
  jest.clearAllMocks()
  mockCreateRequestRunService.mockReset()
  mockCreateRequestRunService.mockResolvedValue(fakeRunService())
  delete process.env.OM_DSH_PERSIST
  delete process.env.OM_DSH_PERSIST_POLL_MS
  process.env.OM_DSH_ROOT = '/tmp/om-dsh-route-test'
  delete process.env.OM_DSH_RUN_TIMEOUT_MS
  delete process.env.PORT
  for (const key of TOOL_WIRING_ENV_KEYS) delete process.env[key]
  mockGetAuthFromRequest.mockResolvedValue({
    sub: 'user-1',
    tenantId: 'tenant-1',
    orgId: 'org-1',
  })
})

afterAll(() => {
  delete process.env.OM_DSH_PERSIST
  delete process.env.OM_DSH_PERSIST_POLL_MS
  delete process.env.OM_DSH_ROOT
  delete process.env.OM_DSH_RUN_TIMEOUT_MS
  delete process.env.PORT
  for (const key of TOOL_WIRING_ENV_KEYS) delete process.env[key]
})

beforeEach(() => {
  delete process.env.OM_DSH_ENGINE_USERS
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
  it('wires the CRM MCP overlay and a signed run token into the DSH launch without logging the token', async () => {
    process.env.OM_DSH_MCP_SCRIPT = '/opt/om/scripts/dsh-crm-mcp.mjs'
    process.env.OM_DSH_BRIDGE_URL = 'http://127.0.0.1:3456/api/internal/dsh-tools'
    process.env.OM_DSH_CRM_PATCH = '/opt/om/vendor/dsh/crm-profile.patch.yml'
    process.env.OM_DSH_RUN_TOKEN_SECRET = 'route-test-secret-not-real'
    process.env.OM_DSH_RUN_TIMEOUT_MS = '1000'

    const handle = makeHandle({ result: { finalResponse: 'ok', finishReason: 'completed' } })
    mockStartDshRun.mockResolvedValueOnce(handle)

    await POST(chatRequest({ messages: userMessages }))

    const input = mockStartDshRun.mock.calls[0][0]
    expect(input.args).toEqual([
      '--profile',
      'sdk-minimal',
      '--patch',
      '/opt/om/vendor/dsh/crm-profile.patch.yml',
    ])
    expect(input.env).toMatchObject({
      OM_DSH_BRIDGE_URL: 'http://127.0.0.1:3456/api/internal/dsh-tools',
      OM_DSH_MCP_SCRIPT: '/opt/om/scripts/dsh-crm-mcp.mjs',
    })

    const token = input.env?.OM_DSH_TOOL_TOKEN
    expect(typeof token).toBe('string')
    const verified = verifyRunToken(token, { secret: process.env.OM_DSH_RUN_TOKEN_SECRET })
    expect(verified.ok).toBe(true)
    if (!verified.ok) throw new Error(`token did not verify: ${verified.reason}`)
    expect(verified.claims).toMatchObject({
      runId: input.runId,
      bindingId: 'unbound',
      userId: 'user-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      tools: ['crm.find_companies'],
    })
    expect(verified.claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))

    const logDump = JSON.stringify([mockLog.debug.mock.calls, mockLog.info.mock.calls, mockLog.warn.mock.calls, mockLog.error.mock.calls])
    expect(logDump).not.toContain(String(token))
    expect(logDump).not.toContain('route-test-secret-not-real')
  })

  it('derives the loopback bridge URL from PORT when OM_DSH_BRIDGE_URL is unset', async () => {
    process.env.PORT = '4321'
    process.env.OM_DSH_MCP_SCRIPT = '/opt/om/scripts/dsh-crm-mcp.mjs'
    process.env.OM_DSH_RUN_TOKEN_SECRET = 'route-test-secret-not-real'

    const handle = makeHandle({ result: { finalResponse: 'ok', finishReason: 'completed' } })
    mockStartDshRun.mockResolvedValueOnce(handle)

    await POST(chatRequest({ messages: userMessages }))

    const input = mockStartDshRun.mock.calls[0][0]
    expect(input.env?.OM_DSH_BRIDGE_URL).toBe('http://127.0.0.1:4321/api/internal/dsh-tools')
    // Repo-relative default; no OM_DSH_CRM_PATCH is set here.
    expect(input.args).toEqual([
      '--profile',
      'sdk-minimal',
      '--patch',
      expect.stringContaining('/vendor/dsh/crm-profile.patch.yml'),
    ])
  })

  it('does not mount MCP tools when the session has no tenant/organization (fail closed)', async () => {
    process.env.OM_DSH_MCP_SCRIPT = '/opt/om/scripts/dsh-crm-mcp.mjs'
    process.env.OM_DSH_RUN_TOKEN_SECRET = 'route-test-secret-not-real'
    mockGetAuthFromRequest.mockResolvedValueOnce({ sub: 'user-1', tenantId: null, orgId: null })

    const handle = makeHandle({ result: { finalResponse: 'ok', finishReason: 'completed' } })
    mockStartDshRun.mockResolvedValueOnce(handle)

    await POST(chatRequest({ messages: userMessages }))

    const input = mockStartDshRun.mock.calls[0][0]
    expect(input.args).toEqual(['--profile', 'sdk-minimal'])
    expect(input.env).toEqual({})
    expect(mockLog.warn).toHaveBeenCalled()
  })

  it('delegates a non-allowlisted employee to the packaged OpenCode route', async () => {
    process.env.OM_DSH_ENGINE_USERS = 'someone-else'
    const response = await POST(chatRequest({ messages: userMessages }))

    expect(response.status).toBe(200)
    expect(mockOpenCodePost).toHaveBeenCalledTimes(1)
    expect(mockStartDshRun).not.toHaveBeenCalled()
    delete process.env.OM_DSH_ENGINE_USERS
  })

  it('does not mount MCP tools when no run-token secret is configured (fail closed)', async () => {
    process.env.OM_DSH_MCP_SCRIPT = '/opt/om/scripts/dsh-crm-mcp.mjs'

    const handle = makeHandle({ result: { finalResponse: 'ok', finishReason: 'completed' } })
    mockStartDshRun.mockResolvedValueOnce(handle)

    await POST(chatRequest({ messages: userMessages }))

    const input = mockStartDshRun.mock.calls[0][0]
    expect(input.args).toEqual(['--profile', 'sdk-minimal'])
    expect(input.env).toEqual({})
  })

  describe('OM_DSH_PERSIST=orm', () => {
    it('settles a stale in-flight run from a previous process as server_restart', async () => {
      process.env.OM_DSH_PERSIST = 'orm'
      process.env.OM_DSH_RECOVERY_SWEEP_MS = '0'
      const service = fakeRunService()
      service.recoverInFlight.mockResolvedValueOnce([
        {
          runId: 'stale-1',
          bindingId: 'binding-1',
          userId: 'user-1',
          tenantId: 'tenant-1',
          organizationId: 'org-1',
          sessionId: null,
          status: 'running',
          cursor: 3,
          createdAt: new Date(Date.now() - 3_600_000).toISOString(),
        } as never,
      ])
      mockCreateRequestRunService.mockResolvedValueOnce(service)
      service.submit.mockResolvedValueOnce({ run: persistedRun({ id: 'run-2', status: 'queued' }), replay: false })
      service.begin.mockResolvedValueOnce(persistedRun({ id: 'run-2', status: 'running', sessionId: 's' }))
      mockStartDshRun.mockResolvedValueOnce(makeHandle({}))

      await POST(chatRequest({ messages: userMessages }))

      expect(service.finish).toHaveBeenCalledWith('stale-1', { status: 'failed', error: 'server_restart' })
      delete process.env.OM_DSH_RECOVERY_SWEEP_MS
    })

    it('settles a run created before this process started when single-instance is set', async () => {
      process.env.OM_DSH_PERSIST = 'orm'
      process.env.OM_DSH_RECOVERY_SWEEP_MS = '0'
      process.env.OM_DSH_SINGLE_INSTANCE = '1'
      const service = fakeRunService()
      service.recoverInFlight.mockResolvedValueOnce([
        {
          runId: 'boot-stale-1',
          bindingId: 'binding-1',
          userId: 'user-1',
          tenantId: 'tenant-1',
          organizationId: 'org-1',
          sessionId: null,
          status: 'running',
          cursor: 2,
          createdAt: new Date(Date.now() - 10_000).toISOString(),
        } as never,
      ])
      mockCreateRequestRunService.mockResolvedValueOnce(service)
      service.submit.mockResolvedValueOnce({ run: persistedRun({ id: 'run-3', status: 'queued' }), replay: false })
      service.begin.mockResolvedValueOnce(persistedRun({ id: 'run-3', status: 'running', sessionId: 's' }))
      mockStartDshRun.mockResolvedValueOnce(makeHandle({}))

      await POST(chatRequest({ messages: userMessages }))

      expect(service.finish).toHaveBeenCalledWith('boot-stale-1', { status: 'failed', error: 'server_restart' })
      delete process.env.OM_DSH_RECOVERY_SWEEP_MS
      delete process.env.OM_DSH_SINGLE_INSTANCE
    })

    it('persists a new run event-by-event, finishes it, then emits done', async () => {
      process.env.OM_DSH_PERSIST = 'orm'
      const service = fakeRunService()
      mockCreateRequestRunService.mockResolvedValueOnce(service)
      service.submit.mockResolvedValueOnce({
        run: persistedRun({ id: 'run-1', status: 'queued' }),
        replay: false,
      })
      service.begin.mockResolvedValueOnce(
        persistedRun({ id: 'run-1', status: 'running', sessionId: 'dsh-session-1' }),
      )
      const handle = makeHandle({
        events: [{ seq: 1, type: 'session.event', payload: { delta: 'hello' } }],
        result: { finalResponse: 'hello', finishReason: 'completed' },
      })
      mockStartDshRun.mockResolvedValueOnce(handle)

      const response = await POST(
        chatRequest({ messages: userMessages, idempotencyKey: 'client-key' }),
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/event-stream')
      const frames = await readSseFrames(response)
      expect(frames.map((frame) => frame.event.type)).toEqual(['thinking', 'text', 'done'])
      expect(frames.map((frame) => frame.id)).toEqual([1, 2, undefined])
      expect(frames[1].event).toEqual({ type: 'text', content: 'hello' })
      expect(frames[2].event).toEqual({ type: 'done', sessionId: 'dsh-session-1' })

      expect(mockStartDshRun).toHaveBeenCalledTimes(1)
      expect(mockStartDshRun.mock.calls[0][0].runId).toBe('run-1')
      expect(service.ensureBinding).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
      })
      expect(service.submit).toHaveBeenCalledWith(
        expect.objectContaining({
          bindingId: 'binding-1',
          requestHash: createHash('sha256').update('hi').digest('hex'),
          prompt: 'hi',
          idempotencyKey: 'client-key',
        }),
      )
      expect(service.begin).toHaveBeenCalledWith('run-1', { sessionId: 'dsh-session-1' })
      expect(service.appendEvent).toHaveBeenCalledTimes(2)
      expect(service.appendEvent).toHaveBeenNthCalledWith(1, 'run-1', {
        type: 'thinking',
        payload: { type: 'thinking' },
      })
      expect(service.finish).toHaveBeenCalledWith('run-1', {
        status: 'completed',
        result: { finalResponse: 'hello', finishReason: 'completed' },
      })
      expect(handle.close).toHaveBeenCalledTimes(1)
    })

    it('replays a terminal idempotent request without starting the runtime', async () => {
      process.env.OM_DSH_PERSIST = 'orm'
      const service = fakeRunService()
      mockCreateRequestRunService.mockResolvedValueOnce(service)
      const completed = persistedRun({ id: 'run-1', status: 'completed', cursor: 2 })
      service.submit.mockResolvedValueOnce({ run: completed, replay: true })
      service.replay.mockResolvedValueOnce({
        run: completed,
        events: [
          persistedEvent({ seq: 1, type: 'thinking', payloadJson: { type: 'thinking' } }),
          persistedEvent({
            id: 'event-2',
            seq: 2,
            type: 'text',
            payloadJson: { type: 'text', content: 'previous' },
          }),
        ],
        resumable: true,
      })

      const frames = await readSseFrames(await POST(chatRequest({ messages: userMessages })))

      expect(frames.map((frame) => frame.event.type)).toEqual(['thinking', 'text', 'done'])
      expect(frames.map((frame) => frame.id)).toEqual([1, 2, undefined])
      expect(service.replay).toHaveBeenCalledWith('user-1', 'run-1', 0)
      expect(service.finish).not.toHaveBeenCalled()
      expect(mockStartDshRun).not.toHaveBeenCalled()
    })

    it('returns 409 idempotency_conflict for the same key with a different hash', async () => {
      process.env.OM_DSH_PERSIST = 'orm'
      const service = fakeRunService()
      mockCreateRequestRunService.mockResolvedValueOnce(service)
      service.submit.mockRejectedValueOnce(
        Object.assign(new Error('different hash'), { code: 'idempotency-conflict' }),
      )

      const response = await POST(chatRequest({ messages: userMessages }))

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toEqual({
        error: 'Idempotency key was already used with a different request',
        code: 'idempotency_conflict',
      })
      expect(mockStartDshRun).not.toHaveBeenCalled()
    })

    it('returns 409 run_in_progress with runId/cursor for an in-flight runId reconnect', async () => {
      process.env.OM_DSH_PERSIST = 'orm'
      const service = fakeRunService()
      mockCreateRequestRunService.mockResolvedValueOnce(service)
      service.replay.mockResolvedValueOnce({
        run: persistedRun({ id: 'run-live', status: 'running', cursor: 5 }),
        events: [],
        resumable: false,
      })

      const response = await POST(chatRequest({ runId: 'run-live', cursor: 3 }))

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toEqual({
        error: 'Run is already in progress',
        code: 'run_in_progress',
        runId: 'run-live',
        cursor: 5,
      })
      expect(service.replay).toHaveBeenCalledWith('user-1', 'run-live', 3)
      expect(service.ensureBinding).not.toHaveBeenCalled()
      expect(mockStartDshRun).not.toHaveBeenCalled()
    })

    it('returns 409 for an in-flight idempotent replay', async () => {
      process.env.OM_DSH_PERSIST = 'orm'
      const service = fakeRunService()
      mockCreateRequestRunService.mockResolvedValueOnce(service)
      service.submit.mockResolvedValueOnce({
        run: persistedRun({
          id: 'run-live',
          status: 'running',
          cursor: 4,
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
        }),
        replay: true,
      })

      const response = await POST(
        chatRequest({ messages: userMessages, idempotencyKey: 'same-key' }),
      )

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toMatchObject({
        code: 'run_in_progress',
        runId: 'run-live',
        cursor: 4,
      })
      expect(service.replay).not.toHaveBeenCalled()
      expect(mockStartDshRun).not.toHaveBeenCalled()
    })

    it('keeps refusing a fresh in-flight run (the one-in-flight rule)', async () => {
      process.env.OM_DSH_PERSIST = 'orm'
      const service = fakeRunService()
      mockCreateRequestRunService.mockResolvedValueOnce(service)
      service.submit.mockResolvedValueOnce({
        run: persistedRun({ id: 'run-live', status: 'running', startedAt: new Date().toISOString() }),
        replay: true,
      })

      const response = await POST(chatRequest({ messages: userMessages, idempotencyKey: 'same-key' }))

      expect(response.status).toBe(409)
      expect(service.finish).not.toHaveBeenCalled()
      expect(mockStartDshRun).not.toHaveBeenCalled()
    })

    it('settles a run that outlived its timeout and retries the submit', async () => {
      process.env.OM_DSH_PERSIST = 'orm'
      const service = fakeRunService()
      mockCreateRequestRunService.mockResolvedValueOnce(service)
      const stale = persistedRun({
        id: 'run-zombie',
        status: 'running',
        startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      })
      service.submit.mockResolvedValueOnce({ run: stale, replay: true })
      service.submit.mockResolvedValueOnce({ run: persistedRun({ id: 'run-new', status: 'queued' }), replay: false })
      mockStartDshRun.mockResolvedValueOnce(makeHandle({ result: { finalResponse: 'ok', finishReason: 'completed' } }))

      const response = await POST(chatRequest({ messages: userMessages }))

      expect(service.finish).toHaveBeenCalledWith('run-zombie', { status: 'failed', error: 'run_timeout' })
      expect(service.submit).toHaveBeenCalledTimes(2)
      expect(response.status).toBe(200)
      expect(mockStartDshRun).toHaveBeenCalledTimes(1)
      expect(mockStartDshRun.mock.calls[0][0].runId).toBe('run-new')
    })

    it('replays a terminal run from Last-Event-ID and appends done', async () => {
      process.env.OM_DSH_PERSIST = 'orm'
      const service = fakeRunService()
      mockCreateRequestRunService.mockResolvedValueOnce(service)
      const completed = persistedRun({
        id: 'run-1',
        status: 'completed',
        cursor: 2,
        sessionId: 'dsh-session-9',
      })
      service.replay.mockResolvedValueOnce({
        run: completed,
        events: [
          persistedEvent({
            id: 'event-2',
            seq: 2,
            type: 'text',
            payloadJson: { type: 'text', content: 'after-cursor' },
          }),
        ],
        resumable: true,
      })

      const frames = await readSseFrames(
        await POST(
          chatRequest({ runId: 'run-1' }, { 'last-event-id': '1' }),
        ),
      )

      expect(frames.map((frame) => frame.event.type)).toEqual(['text', 'done'])
      expect(frames.map((frame) => frame.id)).toEqual([2, undefined])
      expect(frames[1].event).toEqual({ type: 'done', sessionId: 'dsh-session-9' })
      expect(service.replay).toHaveBeenCalledWith('user-1', 'run-1', 1)
      expect(mockStartDshRun).not.toHaveBeenCalled()
    })

    it('tells the client a replayed run failed instead of a bare done', async () => {
      process.env.OM_DSH_PERSIST = 'orm'
      const service = fakeRunService()
      mockCreateRequestRunService.mockResolvedValueOnce(service)
      const failed = persistedRun({ id: 'run-1', status: 'failed', cursor: 0, error: 'initialize timed out after 10000ms' })
      service.replay.mockResolvedValueOnce({ run: failed, events: [], resumable: true })

      const frames = await readSseFrames(await POST(chatRequest({ runId: 'run-1' })))

      expect(frames.map((frame) => frame.event.type)).toEqual(['error', 'done'])
      expect(frames[0].event).toEqual({ type: 'error', error: 'initialize timed out after 10000ms' })
    })

    it('retries once when initialize times out, and succeeds', async () => {
      process.env.OM_DSH_PERSIST = 'orm'
      const service = fakeRunService()
      mockCreateRequestRunService.mockResolvedValueOnce(service)
      mockStartDshRun
        .mockRejectedValueOnce(new Error('dsh initialize failed: initialize timed out after 10000ms'))
        .mockResolvedValueOnce(makeHandle({ result: { finalResponse: 'ok', finishReason: 'completed' } }))

      const response = await POST(chatRequest({ messages: userMessages }))

      expect(response.status).toBe(200)
      expect(mockStartDshRun).toHaveBeenCalledTimes(2)
    })

    it('does not retry a start failure that is not an initialize timeout', async () => {
      process.env.OM_DSH_PERSIST = 'orm'
      const service = fakeRunService()
      mockCreateRequestRunService.mockResolvedValueOnce(service)
      mockStartDshRun.mockRejectedValueOnce(new Error('spawn EACCES'))

      const response = await POST(chatRequest({ messages: userMessages }))

      expect(response.status).toBe(502)
      expect(mockStartDshRun).toHaveBeenCalledTimes(1)
      expect(service.finish).toHaveBeenCalledWith('run-1', {
        status: 'failed',
        error: 'spawn EACCES',
      })
    })

    it('passes the configured initialize bound to the runtime and omits it by default', async () => {
      process.env.OM_DSH_PERSIST = 'orm'
      const service = fakeRunService()
      mockCreateRequestRunService.mockResolvedValueOnce(service)
      mockStartDshRun.mockResolvedValueOnce(makeHandle({ result: { finalResponse: 'ok', finishReason: 'completed' } }))
      delete process.env.OM_DSH_INIT_TIMEOUT_MS

      await POST(chatRequest({ messages: userMessages }))
      expect(mockStartDshRun.mock.calls[0][0]).not.toHaveProperty('initializeTimeoutMs')

      process.env.OM_DSH_INIT_TIMEOUT_MS = '25000'
      const second = fakeRunService()
      mockCreateRequestRunService.mockResolvedValueOnce(second)
      mockStartDshRun.mockResolvedValueOnce(makeHandle({ result: { finalResponse: 'ok', finishReason: 'completed' } }))
      await POST(chatRequest({ messages: userMessages }))
      expect(mockStartDshRun.mock.calls[1][0]).toMatchObject({ initializeTimeoutMs: 25_000 })
      delete process.env.OM_DSH_INIT_TIMEOUT_MS
    })

    it('fails closed with 503 persistence_unavailable when the table/repository is unavailable', async () => {
      process.env.OM_DSH_PERSIST = 'orm'
      const service = fakeRunService()
      mockCreateRequestRunService.mockResolvedValueOnce(service)
      service.ensureBinding.mockRejectedValueOnce(
        new Error('relation "dsh_assistant_bindings" does not exist'),
      )

      const response = await POST(chatRequest({ messages: userMessages }))

      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toMatchObject({ code: 'persistence_unavailable' })
      expect(mockStartDshRun).not.toHaveBeenCalled()
    })

    it('fails closed with 503 when the service cannot be constructed', async () => {
      process.env.OM_DSH_PERSIST = 'orm'
      mockCreateRequestRunService.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))

      const response = await POST(chatRequest({ messages: userMessages }))

      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toMatchObject({ code: 'persistence_unavailable' })
      expect(mockStartDshRun).not.toHaveBeenCalled()
    })

    it('emits a persistence_unavailable error and still closes the stream when an event cannot be stored', async () => {
      process.env.OM_DSH_PERSIST = 'orm'
      const service = fakeRunService()
      mockCreateRequestRunService.mockResolvedValueOnce(service)
      service.submit.mockResolvedValueOnce({
        run: persistedRun({ id: 'run-1', status: 'queued' }),
        replay: false,
      })
      service.begin.mockResolvedValueOnce(
        persistedRun({ id: 'run-1', status: 'running', sessionId: 'dsh-session-1' }),
      )
      service.appendEvent.mockRejectedValueOnce(new Error('db went away'))
      mockStartDshRun.mockResolvedValueOnce(
        makeHandle({ result: { finalResponse: 'ok', finishReason: 'completed' } }),
      )

      const frames = await readSseFrames(await POST(chatRequest({ messages: userMessages })))

      expect(frames.map((frame) => frame.event.type)).toEqual(['error', 'done'])
      expect(frames[0].event).toEqual({ type: 'error', error: 'persistence_unavailable' })
      expect(service.finish).toHaveBeenCalledWith('run-1', {
        status: 'failed',
        error: 'persistence_unavailable',
      })
    })

    it('keeps the legacy path when OM_DSH_PERSIST is not orm and rejects replay fields', async () => {
      process.env.OM_DSH_PERSIST = 'off'
      const handle = makeHandle({ result: { finalResponse: 'ok', finishReason: 'completed' } })
      mockStartDshRun.mockResolvedValueOnce(handle)

      const events = await readSse(await POST(chatRequest({ messages: userMessages })))
      expect(events.at(-1)).toEqual({ type: 'done', sessionId: 'dsh-session-1' })
      expect(mockCreateRequestRunService).not.toHaveBeenCalled()

      const replayAttempt = await POST(chatRequest({ runId: 'run-1', cursor: 1 }))
      expect(replayAttempt.status).toBe(400)
      await expect(replayAttempt.json()).resolves.toMatchObject({ code: 'persistence_disabled' })
      expect(mockStartDshRun).toHaveBeenCalledTimes(1)
    })
    it('cancels the DSH process within one poll interval when the persisted run is cancelled/revoked', async () => {
      jest.useFakeTimers()
      try {
        process.env.OM_DSH_PERSIST = 'orm'
        process.env.OM_DSH_PERSIST_POLL_MS = '1000'
        const service = fakeRunService()
        mockCreateRequestRunService.mockResolvedValueOnce(service)
        service.submit.mockResolvedValueOnce({
          run: persistedRun({ id: 'run-1', status: 'queued' }),
          replay: false,
        })
        service.begin.mockResolvedValueOnce(
          persistedRun({ id: 'run-1', status: 'running', sessionId: 'dsh-session-1' }),
        )
        // The endpoint/revoke already wrote the terminal row; the pump must see it.
        service.getRun.mockResolvedValue(
          persistedRun({
            id: 'run-1',
            status: 'cancelled',
            error: 'user_cancelled',
            finishedAt: '2026-11-11T09:00:05.000Z',
          }),
        )
        // The cancel endpoint already settled the row; finish() must treat that
        // as idempotent success rather than surfacing persistence_unavailable.
        service.finish.mockRejectedValueOnce(new TerminalRunError('run-1', 'cancelled'))

        let resolveResult!: (result: DshRunResult) => void
        const resultPromise = new Promise<DshRunResult>((resolve) => {
          resolveResult = resolve
        })
        let releaseEvents!: () => void
        const eventsGate = new Promise<void>((resolve) => {
          releaseEvents = resolve
        })
        const events = (async function* (): AsyncGenerator<DshEvent> {
          yield { seq: 1, type: 'session.event', payload: { delta: 'partial' } }
          await eventsGate
        })()
        const handle: DshRunHandle = {
          sessionId: 'dsh-session-1',
          events,
          result: resultPromise,
          cancel: jest.fn(async () => {
            releaseEvents()
            resolveResult({ finalResponse: '', finishReason: 'cancelled', error: 'cancelled' })
          }),
          close: jest.fn(async () => ({ stopped: true })),
        }
        mockStartDshRun.mockResolvedValueOnce(handle)

        const response = await POST(chatRequest({ messages: userMessages }))
        const framesPromise = readSseFrames(response)

        // One poll interval, well inside the 10 s revocation budget.
        await jest.advanceTimersByTimeAsync(1000)
        expect(handle.cancel).toHaveBeenCalledTimes(1)
        expect(handle.cancel).toHaveBeenCalledWith('revoked-or-cancelled')

        const frames = await framesPromise
        expect(frames.map((frame) => frame.event.type)).toEqual(['thinking', 'text', 'error', 'done'])
        expect(frames[2].event).toEqual({ type: 'error', error: 'cancelled' })
        expect(frames.at(-1)?.event).toEqual({ type: 'done', sessionId: 'dsh-session-1' })
        expect(frames.some((frame) => frame.event.error === 'persistence_unavailable')).toBe(false)

        // finish is idempotent: exactly one persisted terminal transition.
        expect(service.finish).toHaveBeenCalledTimes(1)
        expect(service.finish).toHaveBeenCalledWith(
          'run-1',
          expect.objectContaining({ status: 'cancelled', error: 'cancelled' }),
        )
        expect(handle.close).toHaveBeenCalledTimes(1)
      } finally {
        jest.useRealTimers()
      }
    })

  })

})
