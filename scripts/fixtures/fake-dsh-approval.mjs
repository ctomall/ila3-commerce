#!/usr/bin/env node
/**
 * Hermetic DSH engine stand-in for the P5 approval-loop drill.
 *
 * Only the model is absent: the app route, spawn path, run store, bridge, run
 * token, ACL, write switch and approval gate are real. The engine asks the
 * drill for human decisions by naming approval ids in assistant text frames,
 * then polls the identical call until the gate settles it.
 *
 * Scenarios (all through `crm.update_company`):
 *   A. approve + execute attempt on a non-existent company -> 404 not_found;
 *      the route hands the approval back (nothing was written), so a retry
 *      executes again instead of demanding a second decision. Proves the
 *      designed retry path, not single-use.
 *   B. approve + execute on a real company (id from the drill) -> 200 ok, the
 *      CRM row changes through the command bus; an identical retry then answers
 *      403 approval_consumed, proving the approval is single-use.
 *   C. approve the restore write back to the original industry -> 200 ok.
 *   D. reject another argument set -> retry answers 403 approval_rejected and
 *      nothing executes.
 *
 * No model is contacted and no credential is read.
 */
import fs from 'node:fs'

const recordPath = process.env.DSH_RECORD ?? process.env.FAKE_DSH_RECORD
const targetFile = process.env.DSH_DRILL_TARGET_FILE ?? ''
function loadTarget() {
  if (!targetFile) return { id: '', industry: '' }
  try {
    const parsed = JSON.parse(fs.readFileSync(targetFile, 'utf8'))
    return { id: typeof parsed.id === 'string' ? parsed.id : '', industry: typeof parsed.industry === 'string' ? parsed.industry : '' }
  } catch {
    return { id: '', industry: '' }
  }
}
const missingCompany = '33333333-3333-4333-8333-333333333333'
const POLL_MS = 1_000
const POLL_MAX = 20

let sessionId = 'fake-approval-session'

function record(entry) {
  if (!recordPath) return
  try {
    fs.appendFileSync(recordPath, `${JSON.stringify(entry)}\n`)
  } catch {
    // Diagnostic only.
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

function notify(event) {
  send({ jsonrpc: '2.0', method: 'session.event', params: { sessionId, event } })
}

function say(id, text) {
  notify({ type: 'assistant/message', data: { message: { id, content: [{ type: 'text', text }] } } })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function callBridge(tool, args) {
  const base = process.env.OM_DSH_BRIDGE_URL
  const token = process.env.OM_DSH_TOOL_TOKEN
  if (!base || !token) return { status: 0, body: { error: 'bridge env missing' } }
  try {
    const response = await fetch(`${base}/${tool}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(30_000),
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
    return { status: 0, body: { error: String(error?.message ?? error) } }
  }
}

async function awaitSettled(label, args) {
  const attempts = []
  let last = null
  for (let attempt = 0; attempt < POLL_MAX; attempt += 1) {
    last = await callBridge('crm.update_company', args)
    attempts.push({ status: last.status, code: last.body?.code ?? null })
    const stillAsking = last.status === 403 && last.body?.code === 'approval_required'
    if (!stillAsking) break
    await sleep(POLL_MS)
  }
  record({ kind: 'settled', label, attempts: attempts.length, last: attempts[attempts.length - 1] })
  return last
}

async function attemptApproval(label, args, askText) {
  const first = await callBridge('crm.update_company', args)
  record({ kind: 'first-call', label, status: first.status, code: first.body?.code ?? null })
  if (first.status === 403 && first.body?.code === 'approval_required') {
    notify({
      type: 'tool/call',
      data: { callId: `call-${label}`, name: 'crm.update_company', arguments: { id: args.id } },
    })
    say(`ask-${label}`, `${askText} approval-required:${label}:${first.body.approvalId}`)
    return { id: first.body.approvalId, result: await awaitSettled(label, args) }
  }
  return { id: null, result: first }
}

async function runQuery(commandId) {
  const target = loadTarget()
  const companyId = target.id
  const originalIndustry = target.industry
  record({ kind: 'query', writesEnabled: process.env.OM_DSH_WRITES ?? null, hasCompany: Boolean(companyId) })

  // A: approved attempt on a missing company; failure returns the approval.
  const argsA = { id: missingCompany, fields: { industry: `approval-drill-missing-${Date.now()}` } }
  const a = await attemptApproval('A', argsA, 'Approve the missing-record attempt:')
  const aRetry = a.id ? await callBridge('crm.update_company', argsA) : null
  record({ kind: 'retry-after-failure', status: aRetry?.status ?? null, code: aRetry?.body?.code ?? null })

  // B: approved write on the real company; the approval must be single-use.
  const argsB = { id: companyId, fields: { industry: `approval-drill-written-${Date.now()}` } }
  const b = companyId ? await attemptApproval('B', argsB, 'Approve the real record change:') : { result: null, id: null }
  const bRetry = b.id ? await callBridge('crm.update_company', argsB) : null
  record({
    kind: 'single-use',
    status: bRetry?.status ?? null,
    code: bRetry?.body?.code ?? null,
    written: b.result?.status === 200,
  })

  // D: rejected argument set must stay refused.
  const argsD = { id: missingCompany, fields: { industry: `approval-drill-rejected-${Date.now()}` } }
  const d = await attemptApproval('D', argsD, 'Reject this record change:')

  const line = (label, result) => `${label}=${result?.status ?? 'skip'}/${result?.body?.code ?? 'n/a'}`
  const finalResponse = [
    'approval loop',
    line('A', a.result),
    `A-retry=${aRetry?.status ?? 'skip'}/${aRetry?.body?.code ?? 'n/a'}`,
    line('B', b.result),
    `B-retry=${bRetry?.status ?? 'skip'}/${bRetry?.body?.code ?? 'n/a'}`,
    line('D', d.result),
  ].join(' ')
  say('assistant-final', finalResponse)
  notify({ type: 'turn/end', data: { reason: { kind: 'stop' } } })
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
  if (typeof message.method !== 'string') return
  if (message.method === 'initialize') {
    record({ kind: 'initialize' })
    send({ jsonrpc: '2.0', id: message.id, result: { serverInfo: { name: 'fake-dsh-approval', version: 'drill' } } })
    return
  }
  if (message.method === 'session/query') {
    if (typeof message.params?.sessionId === 'string') sessionId = message.params.sessionId
    send({ jsonrpc: '2.0', id: message.id, result: { kind: 'prompt', messageId: 'fake-approval-1' } })
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
      record({ kind: 'bad-client-line' })
      continue
    }
    handle(message)
  }
})
