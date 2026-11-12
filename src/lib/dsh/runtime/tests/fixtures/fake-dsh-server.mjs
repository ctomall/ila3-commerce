#!/usr/bin/env node
/**
 * Minimal fake DSH runtime for A1 tests: speaks newline-JSON-RPC over stdio
 * and never imports the real runtime or a model.
 *
 * The scenario is selected with FAKE_DSH_MODE. Every observable fact the
 * tests need (cwd, allow-listed env, query params, server-request answers,
 * signal delivery, descendant pid) is appended as one JSON line to
 * FAKE_DSH_RECORD, so no test has to parse human-readable stderr.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'

const mode = process.env.FAKE_DSH_MODE ?? 'success'
const recordPath = process.env.FAKE_DSH_RECORD

function record(entry) {
  if (!recordPath) return
  try {
    fs.appendFileSync(recordPath, `${JSON.stringify(entry)}\n`)
  } catch {
    // Recording is diagnostic only; a failed write must not change protocol behavior.
  }
}
function send(message) {
  try {
    process.stdout.write(`${JSON.stringify(message)}\n`)
  } catch {
    // The parent may already have killed us; exiting is the right response.
    process.exit(0)
  }
}

function notify(method, params) {
  send({ jsonrpc: '2.0', method, params })
}

function answer(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function answerError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

process.stdout.on('error', () => process.exit(0))

record({
  kind: 'start',
  pid: process.pid,
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  env: {
    DSH_HOME: process.env.DSH_HOME,
    DSH_PARENT: process.env.DSH_PARENT,
    FAKE_ALLOWED: process.env.FAKE_ALLOWED,
    MERCATO_DB_URL: process.env.MERCATO_DB_URL,
    PATH: process.env.PATH,
    HOME: process.env.HOME,
  },
})

let sessionId = 'fake-session'
let queryCount = 0
let serverRequestsFinished = false
let treePid

function emitAssistant(text) {
  notify('session.event', {
    sessionId,
    event: {
      type: 'assistant/message',
      data: { message: { content: [{ type: 'text', text }] } },
    },
  })
}

function emitTurnEnd(reason = 'stop') {
  notify('session.event', {
    sessionId,
    event: { type: 'turn/end', data: { reason: { kind: reason } } },
  })
}

function complete(finalResponse, finishReason = 'completed', commandId) {
  notify('session.query.completed', {
    sessionId,
    ...(commandId === undefined ? {} : { commandId }),
    finalResponse,
    finishReason,
  })
}

function afterQuery(messageId, commandId) {
  if (mode === 'malformed') {
    process.stdout.write('this is not json\n')
    process.stdout.write('{"jsonrpc":"2.0","id":{}}\n')
    process.stdout.write('\r\n')
    emitAssistant('ok')
    emitTurnEnd()
    complete('ok', 'completed', commandId)
    return
  }

  if (mode === 'server-requests') {
    // Two opt-in server→client requests; completion waits for both answers so
    // the test can assert the client replied fail-closed.
    send({
      jsonrpc: '2.0',
      id: 'srv-approval-1',
      method: 'approval/request',
      params: { sessionId, toolName: 'crm.write', callId: 'call-1' },
    })
    send({
      jsonrpc: '2.0',
      id: 'srv-question-1',
      method: 'user-question/ask',
      params: { requestId: 'q-1', sessionId, questions: [{ id: 'q-1', question: 'Proceed?' }] },
    })
    return
  }

  if (mode === 'ignore-sigterm' || mode === 'tree') {
    emitAssistant('partial')
    return
  }

  if (mode === 'hang-query') return

  emitAssistant('hello ')
  emitAssistant('world')
  emitTurnEnd()
  complete('hello world', 'completed', commandId)
  if (mode === 'self-exit') {
    setTimeout(() => process.exit(0), 25)
  }
  record({ kind: 'completed', messageId, commandId: commandId ?? null })
}

function maybeFinishServerRequests() {
  if (mode !== 'server-requests' || serverRequestsFinished) return
  const answered = new Set(
    readEntries()
      .filter((entry) => entry.kind === 'server-response')
      .map((entry) => entry.id),
  )
  if (!answered.has('srv-approval-1') || !answered.has('srv-question-1')) return
  serverRequestsFinished = true
  emitAssistant('approved? no.')
  emitTurnEnd()
  complete('rejected by policy', 'completed')
}

function readEntries() {
  if (!recordPath) return []
  try {
    return fs.readFileSync(recordPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch {
    return []
  }
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  for (;;) {
    const newline = buffer.indexOf('\n')
    if (newline < 0) break
    const line = buffer.slice(0, newline).replace(/\r$/, '')
    buffer = buffer.slice(newline + 1)
    if (line.trim() === '') continue
    let message
    try {
      message = JSON.parse(line)
    } catch {
      record({ kind: 'bad-client-line', line })
      continue
    }
    handle(message)
  }
})

function handle(message) {
  if (!message || typeof message !== 'object') return
  const id = message.id
  const method = message.method
  // Response to one of our server→client requests.
  if (method === undefined && (typeof id === 'string' || typeof id === 'number')) {
    record({ kind: 'server-response', id, result: message.result, error: message.error })
    maybeFinishServerRequests()
    return
  }
  if (typeof method !== 'string') return

  if (method === 'initialize') {
    record({ kind: 'initialize', params: message.params })
    if (mode === 'init-hang') return
    if (mode === 'init-slow') {
      setTimeout(() => answer(id, { serverInfo: { name: 'fake-dsh', version: 'test' } }), 1_200)
      return
    }
    if (mode === 'init-error') {
      answerError(id, -32000, 'no model route')
      return
    }
    answer(id, { serverInfo: { name: 'fake-dsh', version: 'test' } })
    return
  }

  if (method === 'session/query') {
    queryCount += 1
    const params = message.params ?? {}
    sessionId = typeof params.sessionId === 'string' ? params.sessionId : sessionId
    record({ kind: 'query', id, params })
    if (mode === 'hang-query') return
    if (mode === 'query-error') {
      answerError(id, -32602, 'bad prompt')
      return
    }
    if (mode === 'command') {
      answer(id, { kind: 'command', execution: { commandId: 'cmd-1', result: { kind: 'success' } } })
      setTimeout(() => afterQuery('cmd-1', 'cmd-1'), 5)
      return
    }
    const messageId = `msg-${queryCount}`
    answer(id, { kind: 'prompt', messageId })
    setTimeout(() => afterQuery(messageId), 5)
    return
  }

  if (method === 'shutdown') {
    record({ kind: 'shutdown' })
    answer(id, {})
    if (mode !== 'ignore-sigterm' && mode !== 'tree') {
      setTimeout(() => process.exit(0), 10)
    }
    return
  }

  if (method === 'session/prompt') {
    record({ kind: 'wrong-protocol', method })
    answerError(id, -32601, 'A1 must use session/query')
    return
  }

  answerError(id, -32601, `unknown method ${method}`)
}

if (mode === 'tree') {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  treePid = child.pid
  record({ kind: 'tree-child', pid: treePid })
}

process.on('SIGTERM', () => {
  record({ kind: 'sigterm' })
  if (mode !== 'ignore-sigterm') process.exit(0)
})
process.on('SIGINT', () => {
  record({ kind: 'sigint' })
  process.exit(0)
})

record({ kind: 'ready', mode, treePid: treePid ?? null })
