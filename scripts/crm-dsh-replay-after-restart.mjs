#!/usr/bin/env node
/**
 * Replay a completed run *after* the app restarted: the run and its events must
 * survive, the replay must return the same frames without duplicating any, and the
 * replay must not create a second run.
 *
 * This is the persistence half of restart recovery (the restart drill covers the
 * in-flight half: a run that was streaming when the process died).
 *
 * Restarts the release service, so run it on purpose. Costs one short real model call.
 *
 * Usage: node scripts/crm-dsh-replay-after-restart.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { credentials, loginWithRetry } from './lib/session.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(__dirname, '..')
const BASE = process.env.DRILL_BASE_URL ?? 'http://127.0.0.1:3000'
const SERVICE = process.env.DRILL_SERVICE ?? 'ila3-auto-deploy-app.service'

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
const role = creds.has('employee') ? 'employee' : [...creds.keys()][0]
const cookie = await loginWithRetry(BASE, creds.get(role), { role })

const nonce = new Date().toISOString().replace(/[:.]/g, '')
const startedAt = new Date().toISOString()
const first = await fetch(`${BASE}/api/ai_assistant/chat`, {
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify({ messages: [{ role: 'user', content: `只回答两个字：收到（重启重放 ${nonce}）` }] }),
})
const firstBody = await first.text()
const sessionId = (firstBody.match(/"sessionId":"([a-z0-9-]+)"/) ?? [])[1] ?? null
const runRow = sessionId
  ? psqlValue(`select id || '|' || status from dsh_runs where session_id = '${sessionId}' order by created_at desc limit 1`)
  : null
const [runId, runStatus] = (runRow ?? '').split('|')
const eventsBefore = runId ? Number(psqlValue(`select count(*) from dsh_run_events where run_id = '${runId}'`)) : 0
const runsBefore = Number(psqlValue(`select count(*) from dsh_runs`))

let restartOk = false
let healthMs = null
try {
  execFileSync('sudo', ['-n', 'systemctl', 'restart', SERVICE], { encoding: 'utf8', timeout: 120_000 })
  const restartAt = Date.now()
  const deadline = restartAt + 120_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/healthz`)
      if (res.ok) {
        restartOk = true
        healthMs = Date.now() - restartAt
        break
      }
    } catch {
      // still booting
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
} catch (error) {
  console.error(`[replay-after-restart] restart failed: ${String(error?.message ?? error).slice(0, 160)}`)
}

let replayStatus = null
let replayBody = ''
if (runId) {
  const res = await fetch(`${BASE}/api/ai_assistant/chat`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json', 'last-event-id': '0' },
    body: JSON.stringify({ runId }),
  })
  replayStatus = res.status
  replayBody = await res.text()
}
const replayTypes = [...new Set([...replayBody.matchAll(/"type":"([a-z_.]+)"/g)].map((m) => m[1]))]
const replayError = (replayBody.match(/"type":"error","error":"([^"]*)"/) ?? [])[1] ?? null
const eventsAfter = runId ? Number(psqlValue(`select count(*) from dsh_run_events where run_id = '${runId}'`)) : 0
const runsAfter = Number(psqlValue(`select count(*) from dsh_runs`))
const statusAfter = runId ? psqlValue(`select status from dsh_runs where id = '${runId}'`) : null

const checks = {
  'first-run-completed': first.status === 200 && runStatus === 'completed',
  'events-persisted': eventsBefore > 0,
  'service-restarted': restartOk,
  'replay-200': replayStatus === 200,
  'replay-has-frames': replayTypes.length > 0,
  'replay-ends-with-done': replayBody.includes('"type":"done"'),
  'replay-no-error-frame': !replayError,
  'run-still-completed': statusAfter === 'completed',
  'no-event-duplication': eventsAfter === eventsBefore,
  'replay-created-no-run': runsAfter === runsBefore,
}
const ok = Object.values(checks).every(Boolean)
const record = {
  probedAt: startedAt,
  release: (() => {
    try {
      return JSON.parse(fs.readFileSync('/home/pro/releases/mercato/current/release.json', 'utf8')).sha
    } catch {
      return null
    }
  })(),
  service: SERVICE,
  runId: runId ?? null,
  sessionId: sessionId ?? null,
  restartHealthMs: healthMs,
  eventsBefore,
  eventsAfter,
  runsBefore,
  runsAfter,
  replayStatus,
  replayTypes,
  replayError,
  checks,
  ok,
}
const outDir = path.join(repo, 'docs/crm-platform/dsh-integration/evidence')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, `replay-after-restart-${startedAt.replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(outFile, `${JSON.stringify(record, null, 1)}\n`)
console.log(`[replay-after-restart] ${ok ? 'PASS' : 'FAIL'} — ${JSON.stringify(checks)}`)
console.log(`[replay-after-restart] health=${healthMs ?? '-'}ms events ${eventsBefore}->${eventsAfter} evidence=${path.relative(repo, outFile)}`)
process.exit(ok ? 0 : 1)
