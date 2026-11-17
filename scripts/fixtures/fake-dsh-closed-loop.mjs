#!/usr/bin/env node
/**
 * Hermetic DSH engine stand-in for the P4 read-only closed-loop drill.
 *
 * It speaks the same newline JSON-RPC dialect as the runtime transport
 * (`initialize`, `session/query`, `session.event`, `session.query.completed`)
 * and, instead of asking a model, performs the exact HTTP calls the CRM MCP
 * child would perform: one read-only tool call and one write-tool attempt.
 *
 * Everything except the engine is real: the app route, the run store, the
 * bridge endpoint, the run token, the tool policy and the ACL decision. No
 * model is contacted and no credential is read.
 *
 * Every observable fact is appended as one JSON line to FAKE_DSH_RECORD.
 */
import fs from 'node:fs'

const recordPath = process.env.DSH_RECORD ?? process.env.FAKE_DSH_RECORD
let sessionId = 'fake-closed-loop-session'

function record(entry) {
  if (!recordPath) return
  try {
    fs.appendFileSync(recordPath, `${JSON.stringify(entry)}\n`)
  } catch {
    // Diagnostic only; never change protocol behaviour because of it.
  }
}

function send(message) {
  try {
    process.stdout.write(`${JSON.stringify(message)}\n`)
  } catch {
    process.exit(0)
  }
}

process.stdout.on('error', () => process.exit(0))

async function callBridge(tool, args) {
  const base = process.env.OM_DSH_BRIDGE_URL
  const token = process.env.OM_DSH_TOOL_TOKEN
  if (!base || !token) return { status: 0, error: 'bridge env missing' }
  try {
    const response = await fetch(`${base}/${tool}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(20_000),
    })
    const text = await response.text()
    let body = null
    try {
      body = JSON.parse(text)
    } catch {
      body = { raw: text.slice(0, 200) }
    }
    return { status: response.status, body }
  } catch (error) {
    return { status: 0, error: String(error?.message ?? error) }
  }
}

function notifySessionEvent(event) {
  send({ jsonrpc: '2.0', method: 'session.event', params: { sessionId, event } })
}

const QUERY_DELAY_MS = Number(process.env.DSH_DRILL_QUERY_DELAY_MS ?? 0)

async function runQuery(commandId) {
  record({ kind: 'query', hasCommandId: commandId !== undefined, writesEnabled: process.env.OM_DSH_WRITES ?? null, delayMs: QUERY_DELAY_MS })
  if (QUERY_DELAY_MS > 0) await new Promise((resolve) => setTimeout(resolve, QUERY_DELAY_MS))

  const callId = `call-${Date.now()}`
  notifySessionEvent({
    type: 'tool/call',
    data: { callId, name: 'crm.find_companies', arguments: { limit: 2 } },
  })
  const read = await callBridge('crm.find_companies', { limit: 2 })
  const companies = Array.isArray(read.body?.result?.companies) ? read.body.result.companies : []
  record({
    kind: 'bridge-read',
    status: read.status,
    ok: read.body?.ok === true,
    tool: read.body?.tool ?? null,
    companies: companies.length,
    scope: read.body?.result?.scope ?? null,
    error: read.body?.error ?? read.error ?? null,
  })
  notifySessionEvent({
    type: 'tool/result',
    data: {
      callId,
      message: {
        toolCallId: callId,
        content: read.body?.result ?? { error: read.body?.error ?? read.error ?? 'no result' },
      },
    },
  })

  const write = await callBridge('crm.update_company', {
    companyId: '00000000-0000-0000-0000-000000000000',
  })
  record({
    kind: 'bridge-write-attempt',
    status: write.status,
    code: write.body?.code ?? null,
    error: write.body?.error ?? write.error ?? null,
  })

  const first = companies[0]
  const name = first ? (first.name ?? first.displayName ?? first.id ?? 'unknown') : 'none'
  const finalResponse = `read-only loop ok: ${companies.length} compan${companies.length === 1 ? 'y' : 'ies'}, first=${name}, write=${write.status}/${write.body?.code ?? 'n/a'}`
  notifySessionEvent({
    type: 'assistant/message',
    data: { message: { id: 'assistant-closed-loop', content: [{ type: 'text', text: finalResponse }] } },
  })
  notifySessionEvent({ type: 'turn/end', data: { reason: { kind: 'stop' } } })
  send({
    jsonrpc: '2.0',
    method: 'session.query.completed',
    params: { sessionId, ...(commandId === undefined ? {} : { commandId }), finalResponse, finishReason: 'completed' },
  })
  record({ kind: 'completed', finalResponse })
  setTimeout(() => process.exit(0), 50)
}

function handle(message) {
  if (!message || typeof message !== 'object') return
  if (typeof message.method !== 'string') {
    // Answers to server→client requests; this fixture sends none.
    return
  }
  if (message.method === 'initialize') {
    record({ kind: 'initialize', elapsed: process.uptime() })
    send({ jsonrpc: '2.0', id: message.id, result: { serverInfo: { name: 'fake-dsh-closed-loop', version: 'drill' } } })
    return
  }
  if (message.method === 'session/query') {
    // Echo the caller's session id: the route filters completion by it.
    if (typeof message.params?.sessionId === 'string') sessionId = message.params.sessionId
    // Real DSH answers the query with a receipt before/while streaming events.
    send({ jsonrpc: '2.0', id: message.id, result: { kind: 'prompt', messageId: 'fake-message-1' } })
    void runQuery(message.params?.commandId)
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
      record({ kind: 'bad-client-line', line: line.slice(0, 120) })
      continue
    }
    handle(message)
  }
})
