#!/usr/bin/env node
/**
 * P4 read-only closed loop drill (hermetic engine, real everything else).
 *
 * Starts an isolated instance from an existing build artifact on a spare
 * loopback port with `DSH_BIN` pointing at a scripted JSON-RPC engine, then
 * drives one real chat turn:
 *
 *   browser-style SSE client -> real chat route -> real spawn path ->
 *   fake engine -> real CRM bridge endpoint (real run token, binding, ACL,
 *   tool policy) -> real run store/DB -> SSE stream back
 *
 * The fake engine performs the read tool call and one write-tool attempt, so
 * the same run proves both the read-only result path and the write refusal.
 * No model is contacted, no credential is read, no ACL or settings row changes.
 *
 * Usage:
 *   node scripts/dsh-closed-loop-drill.mjs [--out <dir>] [--port 3907]
 * Requires: an existing build in OM_DIST_DIR (default .mercato/enterprise-p4a),
 * DATABASE_URL in the app .env, credentials file with an `employee` line.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(__dirname, '..')
const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 || !process.argv[index + 1] ? fallback : process.argv[index + 1]
}
const PORT = Number(argOf('--port', process.env.DRILL_PORT ?? '3907'))
const OUT = path.resolve(argOf('--out', path.join(repo, 'docs/crm-platform/dsh-integration/evidence')))
const DIST = process.env.DRILL_DIST ?? '.mercato/enterprise-p4a'
const CREDS_FILE = process.env.DRILL_CREDS_FILE ?? '/home/pro/.ila3-admin-credentials'
const BASE = `http://127.0.0.1:${PORT}`
const STAMP = new Date().toISOString().replace(/[:.]/g, '')
const RUN_DIR = path.join(repo, '.mercato', 'dsh-closed-loop')
const RECORD = path.join(RUN_DIR, `engine-${STAMP}.jsonl`)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function databaseUrl() {
  const env = fs.readFileSync(path.join(repo, '.env'), 'utf8')
  const line = env.split('\n').find((entry) => entry.startsWith('DATABASE_URL='))
  if (!line) throw new Error('DATABASE_URL missing from .env')
  return line.slice('DATABASE_URL='.length).trim()
}

function psql(sql) {
  return execFileSync('psql', [databaseUrl(), '-At', '-c', sql], { encoding: 'utf8', timeout: 30_000 }).trim()
}

function readCredentials() {
  const rows = fs.readFileSync(CREDS_FILE, 'utf8').split('\n').map((line) => line.split(/\s+/))
  const row = rows.find((fields) => fields[0] === 'employee')
  if (!row) throw new Error('employee account missing from credentials file')
  return { email: row[1], password: row[2] }
}

async function waitForServer(deadlineMs) {
  const started = Date.now()
  for (;;) {
    try {
      const response = await fetch(`${BASE}/start`, { signal: AbortSignal.timeout(5_000) })
      if (response.ok) return
    } catch {
      // Not up yet.
    }
    if (Date.now() - started > deadlineMs) throw new Error(`server did not answer on ${BASE} within ${deadlineMs}ms`)
    await sleep(1_000)
  }
}

async function login(account) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(account),
    redirect: 'manual',
  })
  if (response.status !== 200) throw new Error(`login failed with ${response.status}`)
  const cookies = response.headers.getSetCookie()
  return cookies.map((value) => value.split(';')[0]).join('; ')
}

function parseSse(text) {
  const frames = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue
    try {
      frames.push(JSON.parse(line.slice('data: '.length)))
    } catch {
      // Keep the raw marker so a malformed frame fails the assertion loudly.
      frames.push({ type: 'unparsed', raw: line.slice(0, 120) })
    }
  }
  return frames
}

async function main() {
  fs.mkdirSync(RUN_DIR, { recursive: true })
  fs.mkdirSync(OUT, { recursive: true })

  const secret = randomBytes(32).toString('hex')
  const idempotencyKey = `drill-closed-loop-${STAMP}`
  const enginePath = path.join(repo, 'scripts', 'fixtures', 'fake-dsh-closed-loop.mjs')
  const mcpScript = path.join(repo, 'scripts', 'dsh-crm-mcp.mjs')
  const env = {
    ...process.env,
    PORT: String(PORT),
    OM_DIST_DIR: DIST,
    OM_DSH_PERSIST: 'orm',
    OM_DSH_OS_ISOLATION: '0',
    OM_DSH_MODEL_ENV: 'off',
    OM_DSH_ROOT: path.join(RUN_DIR, 'root'),
    OM_DSH_RUN_TOKEN_SECRET: secret,
    OM_DSH_BRIDGE_URL: `${BASE}/api/internal/dsh-tools`,
    OM_DSH_MCP_SCRIPT: mcpScript,
    OM_DSH_WRITES: '0',
    OM_DSH_RUN_TIMEOUT_MS: '60000',
    DSH_BIN: enginePath,
    DSH_RECORD: RECORD,
  }

  const logPath = path.join(RUN_DIR, `server-${STAMP}.log`)
  const log = fs.openSync(logPath, 'w')
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
    cwd: repo,
    env,
    stdio: ['ignore', log, log],
    detached: false,
  })

  const evidence = {
    drill: 'dsh-closed-loop',
    startedAt: new Date().toISOString(),
    port: PORT,
    dist: DIST,
    engine: 'scripts/fixtures/fake-dsh-closed-loop.mjs',
    idempotencyKey,
    engineRecord: RECORD,
    serverLog: logPath,
    checks: {},
  }

  let failure = null
  try {
    await waitForServer(180_000)
    const account = readCredentials()
    const cookie = await login(account)

    const response = await fetch(`${BASE}/api/internal/ai-assistant-dsh-chat`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'read-only closed loop drill' }],
        idempotencyKey,
      }),
    })
    const text = await response.text()
    const frames = parseSse(text)
    const types = frames.map((frame) => frame.type)

    evidence.checks.httpStatus = response.status
    evidence.checks.frames = types
    evidence.checks.toolCalls = frames.filter((frame) => frame.type === 'tool-call').map((frame) => frame.toolName)
    evidence.checks.toolResults = frames.filter((frame) => frame.type === 'tool-result').length
    evidence.checks.text = frames.filter((frame) => frame.type === 'text').map((frame) => frame.content).join('')
    evidence.checks.done = frames.some((frame) => frame.type === 'done')
    evidence.checks.unparsed = frames.filter((frame) => frame.type === 'unparsed').length

    const engineRecords = fs.existsSync(RECORD)
      ? fs.readFileSync(RECORD, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
      : []
    const readCall = engineRecords.find((entry) => entry.kind === 'bridge-read')
    const writeCall = engineRecords.find((entry) => entry.kind === 'bridge-write-attempt')
    const completed = engineRecords.find((entry) => entry.kind === 'completed')
    evidence.checks.bridgeRead = readCall ?? null
    evidence.checks.bridgeWriteAttempt = writeCall ?? null
    evidence.checks.engineRecords = engineRecords.map((entry) => entry.kind)

    const runId = psql(
      `select id from dsh_runs where idempotency_key = '${idempotencyKey}' order by created_at desc limit 1`,
    )
    evidence.checks.runId = runId || null
    if (runId) {
      const row = psql(
        `select status || '|' || coalesce(result_json::text,'') || '|' || cursor from dsh_runs where id = '${runId}'`,
      )
      const [status, result, cursor] = row.split('|')
      evidence.checks.runStatus = status
      evidence.checks.runCursor = Number(cursor || 0)
      evidence.checks.runResultMatches = Boolean(completed && result.includes(completed.finalResponse.slice(0, 40)))
      const eventRows = psql(`select seq from dsh_run_events where run_id = '${runId}' order by seq`).split('\n').filter(Boolean).map(Number)
      evidence.checks.eventSeqs = eventRows
      evidence.checks.eventSeqContiguous = eventRows.length > 0 && eventRows.every((seq, index) => seq === index + 1)
      evidence.checks.eventCount = eventRows.length
    }

    const failures = []
    if (response.status !== 200) failures.push(`http ${response.status}`)
    if (!types.includes('tool-call')) failures.push('no tool-call frame')
    if (!types.includes('tool-result')) failures.push('no tool-result frame')
    if (!evidence.checks.done) failures.push('no done frame')
    if (evidence.checks.unparsed > 0) failures.push(`${evidence.checks.unparsed} unparsed frames`)
    if (!types.includes('text') || !evidence.checks.text.includes('read-only loop ok')) failures.push('missing final text')
    if (!readCall || readCall.status !== 200 || readCall.ok !== true) failures.push('read tool did not return 200/ok')
    if (!Array.isArray(readCall?.companies) && (readCall?.companies ?? 0) < 1) failures.push('read tool returned no companies')
    if (!writeCall) failures.push('write attempt not recorded')
    else if (writeCall.status !== 403) failures.push(`write attempt status ${writeCall.status}`)
    else if (!['write_not_enabled', 'tool_not_allowed'].includes(writeCall.code)) failures.push(`write attempt code ${writeCall.code}`)
    if (!runId) failures.push('run row missing')
    else {
      if (evidence.checks.runStatus !== 'completed') failures.push(`run status ${evidence.checks.runStatus}`)
      if (!evidence.checks.eventSeqContiguous) failures.push('event seq not contiguous')
      if (!evidence.checks.runResultMatches) failures.push('run result does not carry final response')
    }
    evidence.failures = failures
    if (failures.length > 0) failure = new Error(`closed loop checks failed: ${failures.join('; ')}`)
  } catch (error) {
    failure = error
    evidence.failures = [String(error?.message ?? error)]
  } finally {
    server.kill('SIGTERM')
    for (let attempt = 0; attempt < 20 && server.exitCode === null; attempt += 1) await sleep(250)
    if (server.exitCode === null) server.kill('SIGKILL')
    fs.closeSync(log)
    evidence.finishedAt = new Date().toISOString()
    evidence.result = failure ? 'failed' : 'passed'
    fs.writeFileSync(path.join(OUT, `closed-loop-${STAMP}.json`), `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(JSON.stringify({ result: evidence.result, failures: evidence.failures ?? [], evidence: path.join(OUT, `closed-loop-${STAMP}.json`) }))
  }
  if (failure) process.exitCode = 1
}

await main()
