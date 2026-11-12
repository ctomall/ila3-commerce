#!/usr/bin/env node
/**
 * Live SSE disconnect/reconnect drill against the deployed release.
 *
 * 1. starts a real run as the employee and aborts the fetch once the engine is
 *    streaming (a browser tab closing mid-answer),
 * 2. polls the run row until it settles — a disconnect must not leave it `running`,
 *    because the per-binding one-in-flight rule would then 409 every new prompt,
 * 3. reconnects by `runId` with `last-event-id: 0` and records the replayed frames.
 *
 * Costs one short model call (the aborted one) and one replay. Writes its evidence
 * next to the other probes under docs/crm-platform/dsh-integration/evidence/.
 *
 * Usage: node scripts/crm-dsh-reconnect-drill.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { credentials, loginWithRetry } from '/home/pro/apps/mercato/scripts/lib/session.mjs'

const BASE = 'http://127.0.0.1:3000'
const creds = credentials(); const role = 'employee'
const cookie = await loginWithRetry(BASE, creds.get(role), { role })
const psql = (sql) => { try { return execFileSync('bash', ['-lc', `cd /home/pro/apps/mercato && export $(grep -E "^DATABASE_URL" .env | xargs) && psql "$DATABASE_URL" -At -c ${JSON.stringify(sql)}`], { encoding: 'utf8' }).trim() } catch { return null } }

const nonce = new Date().toISOString().replace(/[:.]/g, '')
const startedAt = new Date().toISOString()
const controller = new AbortController()
let received = ''
let firstStatus = null
let aborted = false
try {
  const res = await fetch(`${BASE}/api/ai_assistant/chat`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: `用五十个字介绍客户关系管理的价值（断线演练 ${nonce}）` }] }),
    signal: controller.signal,
  })
  firstStatus = res.status
  const reader = res.body?.getReader()
  const decoder = new TextDecoder()
  const deadline = Date.now() + 15000
  while (reader && Date.now() < deadline) {
    const { done, value } = await reader.read()
    if (done) break
    received += decoder.decode(value, { stream: true })
    // Abort only after the engine has actually started streaming.
    if (received.includes('"sessionId"') && (received.match(/"type":"/g) ?? []).length >= 3) {
      aborted = true
      controller.abort()
      break
    }
  }
} catch (e) {
  received += `\n[aborted: ${String(e?.name ?? e)}]`
}

const sessionId = (received.match(/"sessionId":"([a-z0-9-]+)"/) ?? [])[1] ?? null
const runRow = sessionId
  ? psql(`select id || '|' || status || '|' || coalesce(finished_at::text,'') from dsh_runs where session_id = '${sessionId}' order by created_at desc limit 1`)
  : null
let [runId, runStatus, finishedAt] = (runRow ?? '').split('|')
// The handler settles the run asynchronously: poll briefly like a client would.
const deadline = Date.now() + 20000
while (runId && ['queued', 'running', 'awaiting_approval'].includes(runStatus) && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 500))
  const row = psql(`select status || '|' || coalesce(finished_at::text,'') from dsh_runs where id = '${runId}'`)
  const [st, fin] = (row ?? '').split('|')
  runStatus = st ?? runStatus
  finishedAt = fin ?? finishedAt
}

let replayStatus = null
let replayBody = ''
if (runId) {
  const res = await fetch(`${BASE}/api/ai_assistant/chat`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json', 'last-event-id': '0' },
    body: JSON.stringify({ runId }),
  })
  replayStatus = res.status
  replayBody = await res.text()
}
const replayTypes = [...new Set([...replayBody.matchAll(/"type":"([a-z_.]+)"/g)].map((m) => m[1]))]
const replayError = (replayBody.match(/"type":"error","error":"([^"]*)"/) ?? [])[1] ?? null

const checks = {
  'first-stream-started': firstStatus === 200,
  'aborted-mid-stream': aborted,
  'session-id-seen': Boolean(sessionId),
  'run-row-found': Boolean(runId),
  'run-terminal-after-disconnect': ['cancelled', 'failed', 'completed'].includes(runStatus),
  'run-has-finished-at': Boolean(finishedAt),
  'reconnect-200': replayStatus === 200,
  'reconnect-frames-present': replayTypes.length > 0,
  'reconnect-ends-with-done': replayBody.trimEnd().endsWith('data: {"type":"done"}') || replayBody.includes('"type":"done"'),
}
const ok = Object.values(checks).every(Boolean)
const rec = {
  probedAt: startedAt,
  release: JSON.parse(fs.readFileSync('/home/pro/releases/mercato/current/release.json', 'utf8')).sha,
  firstStatus, framesBeforeAbort: (received.match(/"type":"/g) ?? []).length, sessionId,
  runId: runId ?? null, runStatus: runStatus ?? null, finishedAt: finishedAt ?? null,
  reconnectStatus: replayStatus, replayTypes, replayError, checks, ok,
  firstStreamHead: received.slice(0, 200), replayHead: replayBody.slice(0, 300),
}
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'docs/crm-platform/dsh-integration/evidence')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, `reconnect-drill-${startedAt.replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(outFile, `${JSON.stringify(rec, null, 1)}\n`)
console.log(`[reconnect] evidence=${path.relative(repo, outFile)}`)
console.log(JSON.stringify({ ok, checks, runStatus, replayTypes, replayError }))
