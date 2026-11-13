#!/usr/bin/env node
/**
 * Prove the *business-facing* chat surface runs the DSH engine, with a real model call.
 *
 * `/api/ai_assistant/ai/chat` is the path the CRM assistant composer uses (AI SDK
 * UI-message stream). With `OM_AI_ENGINE=dsh` + `OM_DSH_AGENTIC=1` the proxy rewrites
 * it to the DSH bridge, so a real turn must leave a `dsh_runs` row behind — that row
 * is the distinguishing fact, because the packaged AI-SDK loop writes a different
 * store and never creates one.
 *
 * Costs one short model call; run it on purpose, not in a loop.
 *
 * Usage: node scripts/crm-agentic-chat-probe.mjs
 * Writes docs/crm-platform/dsh-integration/evidence/agentic-chat-path-<ts>.json
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
// A nonce keeps a replay from being mistaken for a fresh turn: the bridge derives its
// idempotency key from the conversation id + transcript, so a new nonce is a new run.
const nonce = startedAt.replace(/[:.]/g, '')
const marker = `AGENTIC_${nonce}_OK`
const beforeId = psqlValue('select id from dsh_runs order by created_at desc limit 1')
  || '00000000-0000-0000-0000-000000000000'

const res = await fetch(`${BASE}/api/ai_assistant/ai/chat`, {
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify({
    sessionId: `probe-${nonce}`,
    messages: [{ role: 'user', content: `只回答这一串，不要加别的：${marker}` }],
  }),
})
const text = await res.text()
const contentType = res.headers.get('content-type') ?? ''

const deltas = [...text.matchAll(/"type":"text-delta","(?:id":"[^"]*",)?"delta":"((?:[^"\\]|\\.)*)"/g)]
  .map((match) => {
    try {
      return JSON.parse(`"${match[1]}"`)
    } catch {
      return ''
    }
  })
  .join('')
const finishMarker = text.includes('"type":"finish"') || text.includes('[DONE]')

// Join on the run row rather than on the clock: the bridge does not echo a session id,
// so the marker we asked the model to repeat is what identifies this turn's row.
const safeMarker = marker.replace(/'/g, "''")
const markedRow = psqlValue(
  `select id || '|' || status || '|' || coalesce(finished_at::text, '') from dsh_runs where result_json::text like '%${safeMarker}%' order by created_at desc limit 1`,
)
const latestRow = markedRow || psqlValue(
  `select id || '|' || status || '|' || coalesce(finished_at::text, '') from dsh_runs where id <> '${beforeId}'::uuid order by created_at desc limit 1`,
)
const [runId, runStatus] = (latestRow ?? '').split('|')

const checks = {
  'status-200': res.status === 200,
  'stream-content-type': /event-stream|text\/plain|application\/json/.test(contentType),
  'text-delta-present': deltas.length > 0,
  'finish-marker': finishMarker,
  'run-persisted': Boolean(runId),
  'run-completed': runStatus === 'completed',
  'reply-carries-marker': deltas.includes(marker),
  'run-bound-to-turn': Boolean(markedRow),
}
const ok = Object.values(checks).every(Boolean)

const record = {
  probedAt: startedAt,
  base: BASE,
  role,
  path: '/api/ai_assistant/ai/chat',
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
  marker,
  textDeltaBytes: deltas.length,
  finishMarker,
  joinedHead: deltas.slice(0, 200),
  dshRunId: runId ?? null,
  dshRunStatus: runStatus ?? null,
  joinedByMarker: Boolean(markedRow),
  checks,
  ok,
  firstBytes: text.slice(0, 300),
  lastBytes: text.slice(-300),
}
const outDir = path.join(repo, 'docs/crm-platform/dsh-integration/evidence')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, `agentic-chat-path-${startedAt.replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(outFile, `${JSON.stringify(record, null, 1)}\n`)

console.log(`[agentic-chat] ${ok ? 'PASS' : 'FAIL'} — ${JSON.stringify(checks)}`)
console.log(`[agentic-chat] release=${record.release?.slice(0, 8) ?? '?'} run=${runId ?? '-'} (${runStatus ?? '-'}) evidence=${path.relative(repo, outFile)}`)
process.exit(ok ? 0 : 1)
