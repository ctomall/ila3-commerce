#!/usr/bin/env node
/**
 * Live run-timeout drill (B): a run that outlives `OM_DSH_RUN_TIMEOUT_MS` must end as a
 * failed run with a timed-out result — not stay `running` and not look like a success.
 *
 * The unit tests pin the launcher's deadline arithmetic; this proves the deployed route
 * turns that deadline into the observable state a client and an operator both see.
 *
 * Run it against an instance started with a short timeout, so it costs one bounded model
 * call instead of two minutes:
 *   PORT=3912 OM_DSH_RUN_TIMEOUT_MS=6000 OM_DSH_ROOT=/tmp/timeout-drill-runs \
 *     node_modules/.bin/next start -p 3912
 *   DRILL_BASE_URL=http://127.0.0.1:3912 node scripts/crm-dsh-timeout-drill.mjs
 *
 * Writes docs/crm-platform/dsh-integration/evidence/timeout-<ts>.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { credentials, loginWithRetry } from './lib/session.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(__dirname, '..')
const BASE = process.env.DRILL_BASE_URL ?? 'http://127.0.0.1:3912'
const EXPECTED_TIMEOUT_MS = Number(process.env.DRILL_TIMEOUT_MS ?? '6000')

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
const startedMs = Date.now()
// A nonce makes this a fresh run: the same prompt replays the stored run (that is the
// idempotency contract), and a replayed timed-out run would pass this drill without
// exercising the deadline at all.
const nonce = startedAt.replace(/[:.]/g, '')
const res = await fetch(`${BASE}/api/ai_assistant/chat`, {
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: `请写一篇 600 字的产品介绍，逐段展开，不要提前结束（探针 ${nonce}）。` }],
  }),
})
const text = await res.text()
const elapsedMs = Date.now() - startedMs
const sessionId = (text.match(/"sessionId":"([a-z0-9-]+)"/) ?? [])[1] ?? null

const errorFrame = (text.match(/"type":"error","error":"([^"]*)"/) ?? [])[1] ?? null
const doneFrame = text.includes('"type":"done"')

// The row can land a moment after the stream closes; poll whatever the route settled on.
let row = null
for (let attempt = 0; attempt < 20; attempt += 1) {
  row = sessionId
    ? psqlValue(
        `select status || '|' || coalesce(error, '') || '|' || coalesce(result_json::text, '') || '|' || started_at::text from dsh_runs where session_id = '${sessionId.replace(/'/g, "''")}' order by created_at desc limit 1`,
      )
    : null
  if (row && !row.startsWith('running')) break
  await new Promise((resolve) => setTimeout(resolve, 2_000))
}
const [status, error, resultJson, startedAtRow] = (row ?? '').split('|')
const finishReason = (() => {
  try {
    return JSON.parse(resultJson || '{}')?.finishReason ?? null
  } catch {
    return null
  }
})()
const leftoverChildren = (() => {
  try {
    return execFileSync('bash', ['-lc', "ps -eo cmd | grep -c '[s]dk-minimal' || true"], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
})()

const checks = {
  'status-200': res.status === 200,
  'stream-reports-timeout': Boolean(errorFrame) && /timed out/i.test(errorFrame ?? ''),
  'stream-names-the-bound': errorFrame?.includes(`${EXPECTED_TIMEOUT_MS}ms`) ?? false,
  'stream-ends-with-done': doneFrame,
  'run-terminal': Boolean(status) && status !== 'running',
  'run-failed': status === 'failed',
  'run-error-is-timeout': /timed out/i.test(error ?? ''),
  'finish-reason-timed-out': finishReason === 'timed-out',
  'elapsed-near-the-bound': elapsedMs < EXPECTED_TIMEOUT_MS * 4,
  'fresh-run-not-a-replay': Boolean(startedAtRow) && Date.parse(startedAtRow) >= startedMs - 10_000,
}
const ok = Object.values(checks).every(Boolean)

const record = {
  probedAt: startedAt,
  base: BASE,
  role,
  path: '/api/ai_assistant/chat',
  expectedTimeoutMs: EXPECTED_TIMEOUT_MS,
  release: (() => {
    try {
      return JSON.parse(fs.readFileSync('/home/pro/releases/mercato/current/release.json', 'utf8')).sha
    } catch {
      return null
    }
  })(),
  status: res.status,
  bytes: text.length,
  elapsedMs,
  nonce,
  sessionId,
  runStartedAt: startedAtRow ?? null,
  errorFrame,
  dshRunStatus: status ?? null,
  dshRunError: error ?? null,
  finishReason,
  leftoverChildren,
  checks,
  ok,
  tail: text.slice(-300),
}
const outDir = path.join(repo, 'docs/crm-platform/dsh-integration/evidence')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, `timeout-${startedAt.replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(outFile, `${JSON.stringify(record, null, 1)}\n`)

console.log(`[timeout] ${ok ? 'PASS' : 'FAIL'} — ${JSON.stringify(checks)}`)
console.log(`[timeout] run=${status ?? '-'} reason=${finishReason ?? '-'} elapsed=${elapsedMs}ms children=${leftoverChildren} evidence=${path.relative(repo, outFile)}`)
process.exit(ok ? 0 : 1)
