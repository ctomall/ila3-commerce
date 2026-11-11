import { describe, expect, it, jest } from '@jest/globals'
import { PassThrough } from 'node:stream'
import {
  DshRequestTimeoutError,
  DshTransportClosedError,
  createTransport,
  type DshTransport,
} from '../transport'

type WireMessage = Record<string, unknown>

function harness(defaultTimeoutMs = 500): {
  input: PassThrough
  output: PassThrough
  transport: DshTransport
  sent: WireMessage[]
} {
  const input = new PassThrough()
  const output = new PassThrough()
  const sent: WireMessage[] = []
  let buffer = ''
  output.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8')
    for (;;) {
      const newline = buffer.indexOf('\n')
      if (newline < 0) break
      const line = buffer.slice(0, newline).replace(/\r$/, '')
      buffer = buffer.slice(newline + 1)
      if (line.trim() !== '') sent.push(JSON.parse(line) as WireMessage)
    }
  })
  return { input, output, transport: createTransport({ input, output, defaultTimeoutMs }), sent }
}

async function waitFor<T>(probe: () => T | undefined, timeoutMs = 2_000): Promise<T> {
  const started = Date.now()
  for (;;) {
    const value = probe()
    if (value !== undefined) return value
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe('createTransport', () => {
  it('matches responses by id, accepts CRLF, dispatches notifications and ignores malformed lines', async () => {
    const { input, transport, sent } = harness()
    const notifications = jest.fn()
    transport.onNotification(notifications)

    const pending = transport.request('initialize', { cwd: '/tmp' }, 1_000)
    const request = await waitFor(() => sent.find((message) => message.method === 'initialize'))
    expect(request).toMatchObject({ jsonrpc: '2.0', method: 'initialize', params: { cwd: '/tmp' } })

    input.write('this is not json\n')
    input.write('{"jsonrpc":"2.0","id":{}}\n')
    input.write('\r\n')
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { ready: true } })}\r\n`)

    await expect(pending).resolves.toEqual({ ready: true })
    input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'session.event', params: { seq: 1 } })}\n`)
    await waitFor(() => (notifications.mock.calls.length > 0 ? true : undefined))
    expect(notifications).toHaveBeenCalledWith('session.event', { seq: 1 })
    await transport.close()
  })

  it('answers approval/request and user-question/ask fail-closed without a custom handler', async () => {
    const { input, transport, sent } = harness()

    input.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 'approval-1',
      method: 'approval/request',
      params: { toolName: 'crm.write' },
    })}\n`)
    input.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 'question-1',
      method: 'user-question/ask',
      params: { requestId: 'q', questions: [] },
    })}\n`)

    const approval = await waitFor(() => sent.find((message) => message.id === 'approval-1'))
    const question = await waitFor(() => sent.find((message) => message.id === 'question-1'))
    expect(approval).toMatchObject({ result: { outcome: 'rejected' } })
    expect(question).toMatchObject({ result: { cancelled: true } })
    await transport.close()
  })

  it('answers an unknown server request with a JSON-RPC error instead of hanging', async () => {
    const { input, transport, sent } = harness()
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 'unknown-1', method: 'other/request', params: {} })}\n`)
    const answer = await waitFor(() => sent.find((message) => message.id === 'unknown-1'))
    expect(answer).toMatchObject({ error: { code: -32601 } })
    await transport.close()
  })

  it('times out a request, ignores its late response and keeps serving later requests', async () => {
    const { input, transport, sent } = harness(50)
    const pending = transport.request('slow', {}, 30)
    const assertion = expect(pending).rejects.toBeInstanceOf(DshRequestTimeoutError)
    const request = await waitFor(() => sent.find((message) => message.method === 'slow'))
    await assertion

    // The pending entry was removed, so this late response has no waiter.
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { late: true } })}\n`)

    const followUp = transport.request('next', {}, 1_000)
    const next = await waitFor(() => sent.find((message) => message.method === 'next'))
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: next.id, result: { ok: true } })}\n`)
    await expect(followUp).resolves.toEqual({ ok: true })
    await transport.close()
  })

  it('rejects every pending request on close and refuses later requests', async () => {
    const { transport } = harness(5_000)
    const pending = transport.request('never', {}, 5_000)
    const assertion = expect(pending).rejects.toBeInstanceOf(DshTransportClosedError)
    await transport.close()
    await assertion
    await expect(transport.request('after-close')).rejects.toBeInstanceOf(DshTransportClosedError)
    await expect(transport.close()).resolves.toBeUndefined()
  })
})
