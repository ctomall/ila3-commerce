#!/usr/bin/env node
/**
 * Prove the *public* chat entry point runs the DSH engine, with a real model call.
 *
 * This is not a mock: it logs in as the employee, POSTs the same path the UI uses
 * (`/api/ai_assistant/chat`), and requires the stream to contain DSH frames plus a
 * persisted `dsh_runs` row that reaches `completed`. The OpenCode path produced a
 * different event vocabulary, so the `dsh.event` frames are the distinguishing fact.
 *
 * Costs one short model call; run it on purpose, not in a loop.
 *
 * Usage: node scripts/crm-public-chat-dsh-probe.mjs
 * Writes docs/crm-platform/dsh-integration/evidence/public-chat-path-<ts>.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { credentials, loginWithRetry } from './lib/session.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(__dirname, '..')
const BASE = process.env.PROBE_BASE_URL ?? 'http://127.0.0.1:3000'

function psqlValue(sql) {
  try {
    return execFileSync(
      'bash',
      ['-lc', `cd ${JSON.stringify(repo)} && export $(grep -E "^DATABASE_URL" .env | xargs) && psql "$DATABASE_URL" -At -c ${JSON.stringify(sql)}`],
      { encoding: 'utf8' },
    ).trim()
  } catch {
    return null
  }
}

const creds = credentials()
const role = creds.has('employee') ? 'employee' : 'admin'
const cookie = await loginWithRetry(BASE, creds.get(role), { role })
const startedAt = new Date().toISOString()
// A nonce is required: the same prompt replays the same run (idempotency by design),
// and the replay of a failed run streams only `done` — which would look like a pass.
const nonce = startedAt.replace(/[:.]/g, '')
const res = await fetch(`${BASE}/api/ai_assistant/chat`, {
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify({ messages: [{ role: 'user', content: `只回答两个字：收到（探针 ${nonce}）` }] }),
})
const text = await res.text()
const contentType = res.headers.get('content-type') ?? ''

const dshFrames = [...text.matchAll(/"type":"dsh\.event"/g)].length
const doneFrame = text.includes('"type":"done"')
const textFrames = [...text.matchAll(/"type":"text"/g)].length
const sessionId = (text.match(/"sessionId":"([a-z0-9-]+)"/) ?? [])[1] ?? null

// The session id from the stream is the reliable join key: the credential email does
// not always map to one user row, and `created_at > before` races the clock.
const runRow = sessionId
  ? psqlValue(
      `select id || '|' || status || '|' || coalesce(finished_at::text, '') from dsh_runs where session_id = '${sessionId.replace(/'/g, "''")}' order by created_at desc limit 1`,
    )
  : null
const [runId, runStatus] = (runRow ?? '').split('|')

const checks = {
  'status-200': res.status === 200,
  'sse-content-type': contentType.includes('text/event-stream'),
  'dsh-frames': dshFrames > 0,
  'text-frame-present': textFrames > 0,
  'done-frame': doneFrame,
  'run-persisted': Boolean(runId),
  'run-bound-to-session': Boolean(runId),
  'run-completed': runStatus === 'completed',
}
const ok = Object.values(checks).every(Boolean)

const record = {
  probedAt: startedAt,
  base: BASE,
  role,
  path: '/api/ai_assistant/chat',
  release: (() => {
    try {
      return JSON.parse(fs.readFileSync('/home/pro/releases/mercato/current/release.json', 'utf8')).sha
    } catch {
      return null
    }
  })(),
  status: res.status,
  contentType,
  bytes: text.length,
  dshFrames,
  textFrames,
  sessionId,
  dshRunId: runId ?? null,
  dshRunStatus: runStatus ?? null,
  checks,
  ok,
  firstBytes: text.slice(0, 300),
  lastBytes: text.slice(-300),
}
const outDir = path.join(repo, 'docs/crm-platform/dsh-integration/evidence')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, `public-chat-path-${startedAt.replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(outFile, `${JSON.stringify(record, null, 1)}\n`)

console.log(`[public-chat] ${ok ? 'PASS' : 'FAIL'} — ${JSON.stringify(checks)}`)
console.log(`[public-chat] release=${record.release?.slice(0, 8) ?? '?'} run=${runId ?? '-'} (${runStatus ?? '-'}) evidence=${path.relative(repo, outFile)}`)
process.exit(ok ? 0 : 1)
