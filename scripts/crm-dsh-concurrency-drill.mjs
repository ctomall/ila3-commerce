#!/usr/bin/env node
/**
 * Concurrency drill for parallel AI runs, kept separate from the online-user metric.
 *
 * Measures what the deployment actually enforces today:
 *  - two different employees can stream at the same time, each in their own run;
 *  - one employee cannot have two runs at once: the second request is refused with
 *    409 run_in_progress (no queue).
 *
 * Targets are a product decision; this script only records measured facts. It costs
 * three short real model calls.
 *
 * Usage: node scripts/crm-dsh-concurrency-drill.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { credentials, loginWithRetry } from './lib/session.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(__dirname, '..')
const BASE = process.env.DRILL_BASE_URL ?? 'http://127.0.0.1:3000'

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
const roles = ['employee', 'admin'].filter((role) => creds.has(role))
if (roles.length < 2) {
  console.error(`[concurrency] need two roles in the credentials file, found: ${roles.join(', ') || 'none'}`)
  process.exit(2)
}
const sessions = {}
for (const role of roles) sessions[role] = await loginWithRetry(BASE, creds.get(role), { role })

const nonce = new Date().toISOString().replace(/[:.]/g, '')
async function chat(role, label, { read = true } = {}) {
  const started = Date.now()
  const res = await fetch(`${BASE}/api/ai_assistant/chat`, {
    method: 'POST',
    headers: { cookie: sessions[role], 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: `只回答两个字：收到（${label} ${nonce}）` }] }),
  })
  const text = read ? await res.text() : ''
  return {
    role,
    label,
    status: res.status,
    ms: Date.now() - started,
    bytes: text.length,
    sessionId: (text.match(/"sessionId":"([a-z0-9-]+)"/) ?? [])[1] ?? null,
    body: text.slice(0, 160),
  }
}

const runFor = (sessionId) =>
  sessionId
    ? psqlValue(`select id || '|' || status || '|' || user_id from dsh_runs where session_id = '${sessionId.replace(/'/g, "''")}' order by created_at desc limit 1`)
    : null

// 1) two different employees in parallel
const parallelStart = Date.now()
const [a, b] = await Promise.all([chat('employee', 'parallel-employee'), chat('admin', 'parallel-admin')])
const parallelMs = Date.now() - parallelStart
const runA = (runFor(a.sessionId) ?? '').split('|')
const runB = (runFor(b.sessionId) ?? '').split('|')

const checks = {
  'both-stream-200': a.status === 200 && b.status === 200,
  'both-runs-persisted': Boolean(runA[0]) && Boolean(runB[0]),
  'both-runs-completed': runA[1] === 'completed' && runB[1] === 'completed',
  'runs-belong-to-different-users': Boolean(runA[2]) && Boolean(runB[2]) && runA[2] !== runB[2],
}

// 2) one employee, two requests at once: exactly one may run
const [x, y] = await Promise.all([chat('employee', 'same-user-a', { read: false }), chat('employee', 'same-user-b', { read: false })])
const statuses = [x.status, y.status].sort()
checks['same-user-conflict'] = statuses[0] === 200 && statuses[1] === 409

const record = {
  probedAt: new Date().toISOString(),
  release: (() => {
    try {
      return JSON.parse(fs.readFileSync('/home/pro/releases/mercato/current/release.json', 'utf8')).sha
    } catch {
      return null
    }
  })(),
  base: BASE,
  roles,
  parallelAcrossEmployees: {
    wallMs: parallelMs,
    requests: [a, b].map(({ body, ...rest }) => rest),
    runs: [{ id: runA[0] ?? null, status: runA[1] ?? null, userId: runA[2] ?? null }, { id: runB[0] ?? null, status: runB[1] ?? null, userId: runB[2] ?? null }],
  },
  sameEmployeeAtOnce: {
    statuses: [x.status, y.status],
    latenciesMs: [x.ms, y.ms],
  },
  checks,
  ok: Object.values(checks).every(Boolean),
}

const outDir = path.join(repo, 'docs/crm-platform/dsh-integration/evidence')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, `concurrency-drill-${record.probedAt.replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(outFile, `${JSON.stringify(record, null, 1)}\n`)
console.log(`[concurrency] ${record.ok ? 'PASS' : 'FAIL'} — ${JSON.stringify(checks)}`)
console.log(`[concurrency] parallel=${parallelMs}ms sameUser=${JSON.stringify([x.status, y.status])} evidence=${path.relative(repo, outFile)}`)
process.exit(record.ok ? 0 : 1)
