#!/usr/bin/env node
/**
 * P4E: one-in-flight-run concurrency + idempotent replay, hermetic engine.
 *
 * Real app route, real run store (Postgres), real spawn path. The scripted
 * engine holds its turn for a few seconds so a second prompt can race it:
 *
 *   A. first prompt starts and stays running;
 *   B. second prompt (different idempotency key) -> 409 run_in_progress and no
 *      run row is created for key B;
 *   C. the same prompt replayed with key A after completion -> idempotent replay
 *      (SSE done frame, no new run row).
 *
 * No model is called and no CRM data is written; the only rows created are the
 * run/event rows for key A, left for audit.
 *
 * Usage: node scripts/dsh-concurrency-drill.mjs [--port 3909] [--out <dir>]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 || !process.argv[index + 1] ? fallback : process.argv[index + 1]
}
const PORT = Number(argOf('--port', process.env.DRILL_PORT ?? '3909'))
const OUT = path.resolve(argOf('--out', path.join(repo, 'docs/crm-platform/dsh-integration/evidence')))
const DIST = process.env.DRILL_DIST ?? '.mercato/enterprise-p310'
const CREDS = process.env.DRILL_CREDS_FILE ?? '/home/pro/.ila3-admin-credentials'
const BASE = `http://127.0.0.1:${PORT}`
const STAMP = new Date().toISOString().replace(/[:.]/g, '')
const RUN_DIR = path.join(repo, '.mercato', 'dsh-concurrency-drill')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function databaseUrl() {
  const env = fs.readFileSync(path.join(repo, '.env'), 'utf8')
  return env.split('\n').find((line) => line.startsWith('DATABASE_URL=')).slice('DATABASE_URL='.length).trim()
}
const psql = (sql) => execFileSync('psql', [databaseUrl(), '-At', '-c', sql], { encoding: 'utf8', timeout: 30_000 }).trim()

async function login() {
  const rows = fs.readFileSync(CREDS, 'utf8').split('\n').map((line) => line.split(/\s+/))
  const account = rows.find((fields) => fields[0] === 'employee')
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: account[1], password: account[2] }),
    redirect: 'manual',
  })
  if (response.status !== 200) throw new Error(`login failed: ${response.status}`)
  return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
}

async function readSse(response) {
  const frames = []
  if (!response.body) return frames
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    for (;;) {
      const index = buffer.indexOf('\n\n')
      if (index < 0) break
      const block = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      for (const line of block.split('\n')) {
        if (!line.startsWith('data: ')) continue
        try { frames.push(JSON.parse(line.slice('data: '.length))) } catch { frames.push({ type: 'unparsed' }) }
      }
    }
  }
  return frames
}

async function main() {
  fs.mkdirSync(RUN_DIR, { recursive: true })
  fs.mkdirSync(OUT, { recursive: true })
  const keyA = `drill-concurrency-${STAMP}`
  const keyB = `${keyA}-b`
  const env = {
    ...process.env,
    PORT: String(PORT),
    OM_DIST_DIR: DIST,
    OM_DSH_PERSIST: 'orm',
    OM_DSH_OS_ISOLATION: '0',
    OM_DSH_MODEL_ENV: 'off',
    OM_DSH_ROOT: path.join(RUN_DIR, 'root'),
    OM_DSH_RUN_TOKEN_SECRET: randomBytes(32).toString('hex'),
    OM_DSH_BRIDGE_URL: `${BASE}/api/internal/dsh-tools`,
    OM_DSH_MCP_SCRIPT: path.join(repo, 'scripts', 'dsh-crm-mcp.mjs'),
    OM_DSH_WRITES: '0',
    OM_DSH_RUN_TIMEOUT_MS: '60000',
    DSH_BIN: path.join(repo, 'scripts', 'fixtures', 'fake-dsh-closed-loop.mjs'),
    DSH_RECORD: path.join(RUN_DIR, `engine-${STAMP}.jsonl`),
    DSH_DRILL_QUERY_DELAY_MS: '6000',
  }
  const logPath = path.join(RUN_DIR, `server-${STAMP}.log`)
  const log = fs.openSync(logPath, 'w')
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], { cwd: repo, env, stdio: ['ignore', log, log] })
  const evidence = { drill: 'dsh-concurrency', startedAt: new Date().toISOString(), keys: { a: keyA, b: keyB }, checks: {} }
  let failure = null
  try {
    const started = Date.now()
    for (;;) {
      try {
        if ((await fetch(`${BASE}/start`, { signal: AbortSignal.timeout(3_000) })).ok) break
      } catch { /* not up */ }
      if (Date.now() - started > 180_000) throw new Error('server did not start')
      await sleep(1_000)
    }
    const cookie = await login()
    const body = JSON.stringify({ messages: [{ role: 'user', content: 'concurrency drill' }], idempotencyKey: keyA })

    // A: start, keep the stream open.
    const aResponse = await fetch(`${BASE}/api/internal/ai-assistant-dsh-chat`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body })
    evidence.checks.firstStatus = aResponse.status
    await sleep(1_200)
    evidence.checks.runWhileRunning = psql(`select status from dsh_runs where idempotency_key = '${keyA}' order by created_at desc limit 1`)

    // B: second prompt races the first.
    const bResponse = await fetch(`${BASE}/api/internal/ai-assistant-dsh-chat`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'concurrency drill second' }], idempotencyKey: keyB }),
    })
    const bText = await bResponse.text()
    evidence.checks.second = { status: bResponse.status, body: bText.slice(0, 200).replace(/\s+/g, ' ') }

    const framesA = await readSse(aResponse)
    evidence.checks.firstFrames = [...new Set(framesA.map((frame) => frame.type))]
    evidence.checks.firstDone = framesA.some((frame) => frame.type === 'done')

    // C: replay the completed prompt with the same key.
    const replay = await fetch(`${BASE}/api/internal/ai-assistant-dsh-chat`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body })
    const replayFrames = await readSse(replay)
    evidence.checks.replay = { status: replay.status, done: replayFrames.some((frame) => frame.type === 'done'), frames: replayFrames.length }

    evidence.checks.runs = {
      a: psql(`select count(*) from dsh_runs where idempotency_key = '${keyA}'`),
      b: psql(`select count(*) from dsh_runs where idempotency_key = '${keyB}'`),
      aStatus: psql(`select status from dsh_runs where idempotency_key = '${keyA}' order by created_at desc limit 1`),
    }

    const failures = []
    if (aResponse.status !== 200) failures.push(`A status ${aResponse.status}`)
    if (!['running', 'queued', 'awaiting_approval'].includes(evidence.checks.runWhileRunning)) failures.push(`A not in flight: ${evidence.checks.runWhileRunning}`)
    if (bResponse.status !== 409) failures.push(`B status ${bResponse.status}, expected 409`)
    if (!bText.includes('run_in_progress')) failures.push('B did not return run_in_progress')
    if (!evidence.checks.firstDone) failures.push('A stream did not finish')
    if (replay.status !== 200 || !evidence.checks.replay.done) failures.push('idempotent replay did not finish')
    if (evidence.checks.runs.a !== '1') failures.push(`expected 1 run row for A, got ${evidence.checks.runs.a}`)
    if (evidence.checks.runs.b !== '0') failures.push(`expected 0 run rows for B, got ${evidence.checks.runs.b}`)
    if (evidence.checks.runs.aStatus !== 'completed') failures.push(`A ended ${evidence.checks.runs.aStatus}`)
    evidence.failures = failures
  } catch (error) {
    failure = error
    evidence.failures = [String(error?.message ?? error)]
  } finally {
    server.kill('SIGTERM')
    for (let attempt = 0; attempt < 20 && server.exitCode === null; attempt += 1) await sleep(250)
    if (server.exitCode === null) server.kill('SIGKILL')
    fs.closeSync(log)
    evidence.finishedAt = new Date().toISOString()
    evidence.result = (evidence.failures ?? []).length === 0 ? 'passed' : 'failed'
    fs.writeFileSync(path.join(OUT, `concurrency-${STAMP}.json`), `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(JSON.stringify({ result: evidence.result, failures: evidence.failures ?? [], evidence: path.join(OUT, `concurrency-${STAMP}.json`) }))
  }
  if ((evidence.failures ?? []).length > 0) process.exitCode = 1
}

await main()
