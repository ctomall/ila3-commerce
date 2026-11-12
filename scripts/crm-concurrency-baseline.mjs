#!/usr/bin/env node
/**
 * Baseline for "online users" vs "parallel AI runs" (goal E).
 *
 * These are two different numbers and this script only measures the second:
 *
 * - online users: authenticated sessions active in a window (CRM sessions). Needs no
 *   model call; the product target is not defined yet, so this script does not invent it.
 * - parallel AI runs: assistant runs that are simultaneously executing DSH for one
 *   organization. This script starts N real runs (short prompts) and measures first
 *   streamed byte and total duration, plus the run rows the server persisted.
 *
 * It reports a BASELINE, not a target: with no agreed target, a number cannot pass or
 * fail. It writes one JSON artifact and prints the same facts.
 *
 * Usage: node scripts/crm-concurrency-baseline.mjs [--out <dir>] [--n 2]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { credentials, loginWithRetry } from './lib/session.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.M4_BASE_URL ?? 'http://127.0.0.1:3000'
const outFlag = process.argv.indexOf('--out')
const OUT = path.resolve(
  outFlag === -1 ? `docs/crm-platform/dsh-integration/evidence` : process.argv[outFlag + 1],
)
const nFlag = process.argv.indexOf('--n')
const N = Math.max(1, Math.min(Number(process.argv[nFlag + 1] ?? 2), 4))
const onlineOnly = process.argv.includes('--online-only')

function psqlValue(sql) {
  try {
    const out = execFileSync(
      'bash',
      ['-lc', `cd ${JSON.stringify(path.resolve(__dirname, '..'))} && export $(grep -E "^DATABASE_URL" .env | xargs) && psql "$DATABASE_URL" -At -c ${JSON.stringify(sql)}`],
      { encoding: 'utf8' },
    )
    return out.trim()
  } catch {
    return null
  }
}

/**
 * Online users, measured from the access log: distinct actors that performed an
 * audited action inside the window. Staff auth is a signed cookie with no
 * server-side session row (the `sessions` table is storefront-only), so activity is
 * the only honest server-side signal. It still measures "users who did something",
 * not "people staring at a screen", and it is reported separately from AI runs.
 */
function onlineUsers(windowMinutes) {
  const row = psqlValue(
    `select count(distinct actor_user_id) || '|' || count(*) from access_logs where deleted_at is null and actor_user_id is not null and created_at > now() - interval '${windowMinutes} minutes'`,
  ) ?? ''
  const [users, events] = row.split('|')
  return { windowMinutes, users: Number(users || 0), events: Number(events || 0) }
}

const online = { last15m: onlineUsers(15), last24h: onlineUsers(1440) }
if (onlineOnly) {
  const payload = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    kind: 'online-users-baseline',
    note: 'Activity-based proxy; a baseline is not a target.',
    definitions: {
      onlineUsers: 'distinct actors with an audited action in the window (proxy, not people at a screen)',
    },
    online,
  }
  fs.mkdirSync(OUT, { recursive: true })
  const file = path.join(OUT, `online-users-baseline-${payload.generatedAt.replace(/[:.]/g, '-')}.json`)
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`)
  console.log(JSON.stringify({ ...payload, file }, null, 2))
  process.exit(0)
}

const creds = credentials()
if (!creds.has('employee')) {
  console.error('FAIL no employee credentials: the baseline needs a real employee session')
  process.exit(1)
}
const cookie = await loginWithRetry(BASE, creds.get('employee'), { role: 'employee' })

const before = psqlValue("select count(*) from customer_entities")

/** One real assistant run; measures time to first streamed byte and total duration. */
async function oneRun(label, nonce) {
  const startedAt = Date.now()
  const response = await fetch(`${BASE}/api/ai_assistant/chat`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          content: `Reply with exactly the word OK and nothing else. (baseline ${nonce})`,
        },
      ],
    }),
  })
  let firstByteAt = null
  let text = ''
  if (response.body) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (firstByteAt === null) firstByteAt = Date.now()
      text += decoder.decode(value, { stream: true })
    }
  } else {
    text = await response.text()
    firstByteAt = Date.now()
  }
  const finishedAt = Date.now()
  return {
    label,
    status: response.status,
    firstByteMs: firstByteAt === null ? null : firstByteAt - startedAt,
    totalMs: finishedAt - startedAt,
    bytes: text.length,
    hasOk: /OK/.test(text),
    errorLine: (text.match(/event:\s*error[\s\S]*?data:\s*(\{[^\n]*\})/) ?? [])[1] ?? null,
  }
}

const nonce = `${Date.now()}`
const sequential = await oneRun('single', `${nonce}-1`)

const parallelStartedAt = Date.now()
const parallel = await Promise.all(
  Array.from({ length: N }, (_, index) => oneRun(`parallel-${index + 1}`, `${nonce}-p${index + 1}`)),
)
const parallelWallMs = Date.now() - parallelStartedAt

const after = psqlValue("select count(*) from customer_entities")
const latestRuns = psqlValue(
  "select status || ':' || count(*) from dsh_runs group by status order by status",
)
const activeRuns = psqlValue("select count(*) from dsh_runs where status in ('queued','running','awaiting_approval')")

const payload = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  kind: 'baseline',
  note: 'A baseline is not a target: no pass/fail without an agreed target.',
  definitions: {
    onlineUsers: 'authenticated CRM sessions active in a window (not measured here)',
    parallelAiRuns: 'assistant runs simultaneously executing DSH for one organization',
  },
  n: N,
  sequential,
  parallel,
  parallelWallMs,
  wallOverheadMs: parallelWallMs - Math.max(...parallel.map((run) => run.totalMs)),
  online,
  runsByStatus: latestRuns,
  activeRuns,
  customerEntities: { before, after, unchanged: before !== null && before === after },
}

fs.mkdirSync(OUT, { recursive: true })
const file = path.join(OUT, `concurrency-baseline-${payload.generatedAt.replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`)
console.log(JSON.stringify({ ...payload, file }, null, 2))
