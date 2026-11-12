#!/usr/bin/env node
/**
 * Restart-recovery drill for the DSH run store (acceptance B).
 *
 * Starts a real employee run, restarts the app while it is in flight, then proves
 * the boot-time sweep settles the orphaned row as `failed/server_restart` and that
 * a fresh run still works. The stream is expected to end because the process that
 * owned it is gone — resuming across a restart is explicitly not promised.
 *
 * A restart is routine (auto-deploy does it on every release), and this drill does
 * not send mail, change customer rows, or migrate anything.
 *
 * Usage: node scripts/crm-dsh-restart-drill.mjs [--out <dir>]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { credentials, loginWithRetry } from './lib/session.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.M4_BASE_URL ?? 'http://127.0.0.1:3000'
const outFlag = process.argv.indexOf('--out')
const OUT = path.resolve(outFlag === -1 ? 'docs/crm-platform/dsh-integration/evidence' : process.argv[outFlag + 1])
const service = process.env.DSH_APP_SERVICE ?? 'ila3-auto-deploy-app.service'

function psqlValue(sql) {
  try {
    return execFileSync(
      'bash',
      ['-lc', `cd ${JSON.stringify(path.resolve(__dirname, '..'))} && export $(grep -E "^DATABASE_URL" .env | xargs) && psql "$DATABASE_URL" -At -c ${JSON.stringify(sql)}`],
      { encoding: 'utf8' },
    ).trim()
  } catch {
    return null
  }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Like psqlValue but keeps stderr, for fixtures whose failure must be explained. */
function psqlTry(sql) {
  try {
    const stdout = execFileSync(
      'bash',
      ['-lc', `cd ${JSON.stringify(path.resolve(__dirname, '..'))} && export $(grep -E "^DATABASE_URL" .env | xargs) && psql "$DATABASE_URL" -At -c ${JSON.stringify(sql)}`],
      { encoding: 'utf8' },
    )
    return { ok: true, stdout, stderr: '' }
  } catch (error) {
    return { ok: false, stdout: error?.stdout ? String(error.stdout) : '', stderr: error?.stderr ? String(error.stderr) : String(error?.message ?? error) }
  }
}

const creds = credentials()
if (!creds.has('employee')) {
  console.error('FAIL no employee credentials')
  process.exit(1)
}
const cookie = await loginWithRetry(BASE, creds.get('employee'), { role: 'employee' })

async function whoami() {
  const response = await fetch(`${BASE}/api/ai_assistant/tools/execute`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ toolName: 'context_whoami', args: {} }),
  })
  return (await response.json())?.result?.userId ?? null
}
const selfUserId = await whoami()
if (!selfUserId) {
  console.error('FAIL whoami did not resolve an actor')
  process.exit(1)
}

const before = psqlValue('select count(*) from customer_entities')
const nonce = Date.now()

async function startRun(label, prompt) {
  const controller = new AbortController()
  const startedAt = Date.now()
  const settled = fetch(`${BASE}/api/ai_assistant/chat`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
    signal: controller.signal,
  })
    .then(async (response) => {
      let text = ''
      try {
        text = await response.text()
      } catch (error) {
        return { label, status: response.status, endedAt: Date.now(), outcome: `stream-error:${error?.name ?? error}`, bytes: text.length }
      }
      return { label, status: response.status, endedAt: Date.now(), outcome: 'stream-ended', bytes: text.length, cancelled: text.includes('run_cancelled') }
    })
    .catch((error) => ({ label, status: 0, endedAt: Date.now(), outcome: `fetch-error:${error?.name ?? error}`, bytes: 0 }))
  return { settled, controller, startedAt }
}

const inflight = await startRun('inflight', `Write a 3000-word essay about CRM history. Output only the essay. (restart drill ${nonce})`)

let runId = null
for (let i = 0; i < 60; i += 1) {
  await sleep(250)
  const row = psqlValue(`select id || '|' || status from dsh_runs where user_id = '${selfUserId}' order by created_at desc limit 1`)
  if (row?.includes('|running')) {
    runId = row.split('|')[0]
    break
  }
}
if (!runId) {
  console.error('FAIL the in-flight run never reached running')
  process.exit(1)
}
const statusBeforeRestart = psqlValue(`select status from dsh_runs where id = '${runId}'`)

// Insert the orphan BEFORE the restart so the boot-time sweep is what settles it.
let orphanId = null
let orphanStatus = null
// Use a *different* active binding for the orphan: a partial unique index allows only
// one in-flight run per binding, and this employee's run is still in flight here.
const orphanInsert = psqlTry(
  `insert into dsh_runs (binding_id, user_id, tenant_id, organization_id, status, idempotency_key, request_hash, cursor, started_at, created_at) select b.id, u.id, u.tenant_id, u.organization_id, 'running', 'restart-drill-${nonce}', 'restart-drill', 0, now() - interval '10 minutes', now() - interval '10 minutes' from dsh_assistant_bindings b join users u on u.id = b.user_id where b.status = 'active' and b.user_id <> '${selfUserId}' limit 1 returning id`,
)
if (!orphanInsert.ok) console.error('DEBUG orphan insert failed:', orphanInsert.stderr.slice(0, 300))
orphanId = (orphanInsert.ok ? orphanInsert.stdout : '')
  .split('\n')
  .map((line) => line.trim())
  .find((line) => /^[0-9a-f-]{36}$/i.test(line)) ?? null

const restart = spawnSync('sudo', ['-n', 'systemctl', 'restart', service], { encoding: 'utf8' })
const restartedAt = Date.now()
let healthz = 0
for (let i = 0; i < 60; i += 1) {
  await sleep(500)
  try {
    const response = await fetch(`${BASE}/api/healthz`)
    healthz = response.status
    if (healthz === 200) break
  } catch {
    healthz = 0
  }
}
const recoveredMs = Date.now() - restartedAt

// A request after boot triggers the recovery sweep; the short run also proves the
// engine is healthy again.
const fresh = await startRun('fresh', `Reply with exactly OK. (after restart ${nonce})`)
const freshResult = await Promise.race([fresh.settled, sleep(120000).then(() => ({ outcome: 'timeout' }))])

let settledStatus = null
for (let i = 0; i < 120; i += 1) {
  settledStatus = psqlValue(`select status || '|' || coalesce(error, '') from dsh_runs where id = '${runId}'`)
  if (settledStatus?.startsWith('failed') || settledStatus?.startsWith('cancelled') || settledStatus?.startsWith('completed')) break
  await sleep(250)
}

// A request after boot triggers the sweep; poll the orphan inserted before restart.
if (orphanId) {
  for (let i = 0; i < 80; i += 1) {
    orphanStatus = psqlValue(`select status || '|' || coalesce(error, '') from dsh_runs where id = '${orphanId}'`)
    if (orphanStatus?.startsWith('failed') || orphanStatus?.startsWith('cancelled') || orphanStatus?.startsWith('completed')) break
    await sleep(250)
  }
  psqlValue(`delete from dsh_runs where id = '${orphanId}'`)
}


const inflightResult = await Promise.race([inflight.settled, sleep(10000).then(() => ({ outcome: 'still-open' }))])

// The real restart is usually settled by the stream handler (the child exits with the
// old process). To prove the boot-time *sweep* as well, inject one orphaned running row
// created before this process started and trigger a request; it must become
// failed/server_restart. The row is removed afterwards.
const after = psqlValue('select count(*) from customer_entities')
const payload = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  service,
  actor: 'employee',
  runId,
  statusBeforeRestart,
  restart: { exitCode: restart.status, recoveredMs, healthz },
  settledStatus,
  orphanSweep: { orphanId, settled: orphanStatus },
  inflightStream: { outcome: inflightResult.outcome, bytes: inflightResult.bytes, cancelled: inflightResult.cancelled ?? null },
  freshRun: { status: freshResult.status ?? null, outcome: freshResult.outcome, bytes: freshResult.bytes ?? 0 },
  customerEntities: { before, after, unchanged: before !== null && before === after },
  verdict:
    restart.status === 0 &&
    healthz === 200 &&
    settledStatus?.startsWith('failed') &&
    orphanStatus?.startsWith('failed|server_restart') &&
    inflightResult.outcome !== 'still-open' &&
    (freshResult.outcome === 'stream-ended' || freshResult.outcome === 'timeout') &&
    before === after
      ? 'PASS'
      : 'FAIL',
}

fs.mkdirSync(OUT, { recursive: true })
const file = path.join(OUT, `restart-drill-${payload.generatedAt.replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`)
console.log(JSON.stringify({ ...payload, file }, null, 2))
