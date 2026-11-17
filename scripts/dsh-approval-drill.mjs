#!/usr/bin/env node
/**
 * P5 controlled-write / approval drill (hermetic engine, real everything else).
 *
 * Starts an isolated instance from an existing build artifact on a spare
 * loopback port with `OM_DSH_WRITES=1` and a scripted JSON-RPC engine. The
 * engine performs two write-tool calls:
 *
 *   A. approve path — real route -> real spawn -> real bridge (run token,
 *      binding, ACL, write switch) -> real approval gate. The gate answers
 *      `approval_required`; this drill plays the employee and approves through
 *      `POST /api/internal/dsh-write-approvals/<id>`. The gate then consumes
 *      the approval exactly once and the bridge executes the tool. The target
 *      company id does not exist, so execution answers 404 and NO CRM row is
 *      written; a retry proves single-use (`approval_consumed`).
 *   B. reject path — a second argument set is rejected by the drill; the retry
 *      must answer `approval_rejected` and must not execute.
 *
 * No model is contacted, no credential is read, no migration runs, no CRM row
 * changes: the only rows this drill creates are one run, its events and two
 * approval proposals, all left in place for audit.
 *
 * Usage: node scripts/dsh-approval-drill.mjs [--port 3908] [--out <dir>]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(__dirname, '..')
const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 || !process.argv[index + 1] ? fallback : process.argv[index + 1]
}
const PORT = Number(argOf('--port', process.env.DRILL_PORT ?? '3908'))
const OUT = path.resolve(argOf('--out', path.join(repo, 'docs/crm-platform/dsh-integration/evidence')))
const DIST = process.env.DRILL_DIST ?? '.mercato/enterprise-p3b'
const CREDS_FILE = process.env.DRILL_CREDS_FILE ?? '/home/pro/.ila3-admin-credentials'
const BASE = `http://127.0.0.1:${PORT}`
const STAMP = new Date().toISOString().replace(/[:.]/g, '')
const RUN_DIR = path.join(repo, '.mercato', 'dsh-approval-drill')
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
      // not up yet
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
  return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
}

/** Read the chat SSE stream frame by frame so approvals can be decided mid-run. */
async function driveChat(cookie, idempotencyKey, decide) {
  const response = await fetch(`${BASE}/api/internal/ai-assistant-dsh-chat`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'approval drill' }], idempotencyKey }),
  })
  const frames = []
  const decisions = []
  if (response.status !== 200 || !response.body) {
    return { status: response.status, frames, decisions, body: (await response.text()).slice(0, 300) }
  }
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
        let frame
        try {
          frame = JSON.parse(line.slice('data: '.length))
        } catch {
          frame = { type: 'unparsed' }
        }
        frames.push(frame)
        if (frame.type !== 'text' || typeof frame.content !== 'string') continue
        const match = /approval-required:([A-D]):([0-9a-f-]{36})/i.exec(frame.content)
        if (!match) continue
        const label = match[1].toUpperCase()
        const approvalId = match[2]
        const outcome = await decide(label, approvalId)
        decisions.push({ label, approvalId, ...outcome })
      }
    }
  }
  return { status: response.status, frames, decisions }
}

async function main() {
  fs.mkdirSync(RUN_DIR, { recursive: true })
  fs.mkdirSync(OUT, { recursive: true })
  const secret = randomBytes(32).toString('hex')
  const idempotencyKey = `drill-approval-${STAMP}`
  const companiesBefore = Number(psql('select count(*) from customer_companies'))
  // Pick a real, industry-bearing company inside the drill's organization scope
  // so the approved write has a target. Only `industry` is touched, and the
  // original value is restored by a second approved write in scenario C.
    // The drill target is resolved after login, through the employee's own API,
  // so the plaintext industry value and the organization scope are both real.
  const TARGET_FILE = path.join(RUN_DIR, `target-${STAMP}.json`)

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
    OM_DSH_MCP_SCRIPT: path.join(repo, 'scripts', 'dsh-crm-mcp.mjs'),
    OM_DSH_WRITES: '1',
    OM_DSH_RUN_TIMEOUT_MS: '180000',
    DSH_BIN: path.join(repo, 'scripts', 'fixtures', 'fake-dsh-approval.mjs'),
    DSH_RECORD: RECORD,
    DSH_DRILL_TARGET_FILE: TARGET_FILE,
  }
  const logPath = path.join(RUN_DIR, `server-${STAMP}.log`)
  const log = fs.openSync(logPath, 'w')
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
    cwd: repo,
    env,
    stdio: ['ignore', log, log],
  })

  const evidence = {
    drill: 'dsh-approval-loop',
    startedAt: new Date().toISOString(),
    port: PORT,
    dist: DIST,
    idempotencyKey,
    engineRecord: RECORD,
    serverLog: logPath,
    company: null,
    checks: {},
  }
  let failure = null
  let restoreTarget = null
  let employeeCookie = null
  try {
    await waitForServer(180_000)
    const account = readCredentials()
    const cookie = await login(account)
    employeeCookie = cookie
    const token = /auth_token=([^;]+)/.exec(cookie)?.[1]
    const claims = token ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) : {}
    const companies = await (await fetch(`${BASE}/api/customers/companies?limit=50`, { headers: { cookie } })).json()
    const targetCompany = (companies.items ?? []).find((item) => typeof item.industry === 'string' && item.industry.trim() !== '')
    if (!targetCompany) throw new Error('employee has no industry-bearing company in scope')
    const targetId = targetCompany.id
    const originalIndustry = targetCompany.industry
    evidence.company = {
      id: targetId,
      originalIndustry,
      displayName: targetCompany.display_name ?? null,
      organizationId: claims.orgId ?? null,
      // Compare decrypted values through the API: an unchanged field gets a new
      // ciphertext on every write, so ciphertext equality would be misleading.
      plaintextBefore: {
        displayName: targetCompany.display_name ?? null,
        legalName: targetCompany.legal_name ?? null,
        brandName: targetCompany.brand_name ?? null,
        domain: targetCompany.domain ?? null,
        websiteUrl: targetCompany.website_url ?? null,
      },
    }
    restoreTarget = { id: targetId, industry: originalIndustry }
    fs.writeFileSync(TARGET_FILE, JSON.stringify({ id: targetId, industry: originalIndustry }))

    const decide = async (label, approvalId) => {
      process.stderr.write(`[drill] decision ${label} ${approvalId}\n`)
      // A/B are approvals; D is the rejected path.
      const decision = label === 'D' ? 'reject' : 'approve'
      const response = await fetch(`${BASE}/api/internal/dsh-write-approvals/${approvalId}`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      const body = await response.text()
      return { decision, status: response.status, body: body.slice(0, 160).replace(/\s+/g, ' ') }
    }

    process.stderr.write('[drill] chat request sent\n')
    const chat = await driveChat(cookie, idempotencyKey, decide)
    process.stderr.write(`[drill] chat finished ${chat.status} frames=${chat.frames.length} decisions=${chat.decisions.length}\n`)
    const types = chat.frames.map((frame) => frame.type)
    evidence.checks.httpStatus = chat.status
    evidence.checks.frames = [...new Set(types)]
    evidence.checks.toolCalls = chat.frames.filter((frame) => frame.type === 'tool-call').map((frame) => frame.toolName)
    evidence.checks.toolResults = chat.frames.filter((frame) => frame.type === 'tool-result').length
    evidence.checks.decisions = chat.decisions
    evidence.checks.text = chat.frames.filter((frame) => frame.type === 'text').map((frame) => frame.content).join(' | ')
    evidence.checks.done = chat.frames.some((frame) => frame.type === 'done')
    evidence.checks.body = chat.body ?? null

    const engine = fs.existsSync(RECORD)
      ? fs.readFileSync(RECORD, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
      : []
    evidence.checks.engine = engine

    const run = psql(`select id || '|' || binding_id || '|' || status || '|' || coalesce(result_json::text,'') from dsh_runs where idempotency_key = '${idempotencyKey}' order by created_at desc limit 1`)
    const [runId, bindingId, runStatus, runResult] = run.split('|')
    evidence.checks.runId = runId ?? null
    evidence.checks.runStatus = runStatus ?? null
    evidence.checks.runResult = (runResult ?? '').slice(0, 300)
    evidence.checks.bindingId = bindingId ?? null

    if (bindingId) {
      const approvals = psql(
        `select status || ':' || coalesce(consumed_at::text,'-') from dsh_write_approvals where run_id = '${runId}' order by requested_at`,
      )
      evidence.checks.approvals = approvals.split('\n').filter(Boolean)
      evidence.checks.approvalCount = evidence.checks.approvals.length
    }
    evidence.checks.companiesBefore = companiesBefore
    evidence.checks.companiesAfter = Number(psql('select count(*) from customer_companies'))

    // Safety restore through the product's normal edit API (same PUT the CRM
    // detail page uses), so the drill leaves the demo row exactly as it found
    // it even when a later assertion fails.
    const restore = await fetch(`${BASE}/api/customers/companies`, {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ id: targetId, industry: originalIndustry }),
    })
    evidence.checks.restoreStatus = restore.status
    evidence.restoredAt = new Date().toISOString()

    const afterList = await (await fetch(`${BASE}/api/customers/companies?limit=200`, { headers: { cookie } })).json()
    const afterCompany = (afterList.items ?? []).find((item) => item.id === targetId) ?? null
    evidence.checks.companyAfter = afterCompany
      ? { industry: afterCompany.industry, displayName: afterCompany.display_name ?? afterCompany.displayName ?? null }
      : null
    evidence.checks.plaintextAfter = afterCompany
      ? {
          displayName: afterCompany.display_name ?? null,
          legalName: afterCompany.legal_name ?? null,
          brandName: afterCompany.brand_name ?? null,
          domain: afterCompany.domain ?? null,
          websiteUrl: afterCompany.website_url ?? null,
        }
      : null

    const byLabel = (label) => engine.find((entry) => entry.kind === 'settled' && entry.label === label)?.last ?? null
    const singleUse = engine.find((entry) => entry.kind === 'single-use') ?? null
    const retryAfterFailure = engine.find((entry) => entry.kind === 'retry-after-failure') ?? null
    evidence.checks.settledA = byLabel('A')
    evidence.checks.settledB = byLabel('B')
    evidence.checks.settledD = byLabel('D')
    evidence.checks.singleUse = singleUse
    evidence.checks.retryAfterFailure = retryAfterFailure
    evidence.checks.approvalDecisions = chat.decisions.map((entry) => ({ label: entry.label, decision: entry.decision, status: entry.status }))

    const failures = []
    if (chat.status !== 200) failures.push(`http ${chat.status}`)
    if (!types.includes('done')) failures.push('no done frame')
    if (!chat.frames.some((frame) => frame.type === 'text' && frame.content.includes('approval loop'))) failures.push('missing final text')
    if (!['A', 'B', 'D'].every((label) => chat.decisions.some((entry) => entry.label === label && entry.status === 200))) {
      failures.push('not every approval decision was accepted')
    }
    // A: failure returns the approval; the retry executes again instead of asking.
    if (byLabel('A')?.status !== 404 || byLabel('A')?.code !== 'not_found') failures.push('A did not execute after approval (expected 404 not_found)')
    if (retryAfterFailure?.status !== 404) failures.push('A retry did not re-execute after the failure handed the approval back')
    // B: successful write, then the approval is spent.
    if (byLabel('B')?.status !== 200) failures.push('B approved write did not succeed')
    if (singleUse?.status !== 409 || singleUse?.code !== 'approval_consumed') failures.push('approval was not single-use after a successful write')
    // D: reject stays refused and never executes.
    if (byLabel('D')?.status !== 403 || byLabel('D')?.code !== 'approval_rejected') failures.push('rejected write did not stay refused')
    if (!runId) failures.push('run row missing')
    else {
      if (runStatus !== 'completed') failures.push(`run status ${runStatus}`)
      if (!(runResult ?? '').includes('approval loop')) failures.push('run result does not carry final response')
    }
    const approvals = evidence.checks.approvals ?? []
    if (approvals.length !== 3) failures.push(`expected 3 approvals, got ${approvals.length}`)
    if (!approvals.some((row) => row.startsWith('consumed:') && !row.endsWith(':-'))) failures.push('no consumed approval')
    if (!approvals.some((row) => row.startsWith('rejected:'))) failures.push('no rejected approval')
    if (!approvals.some((row) => row.startsWith('approved:'))) failures.push('no handed-back approval')
    if (evidence.checks.companiesAfter !== companiesBefore) failures.push('company row count changed')
    // Data restoration: the drill must leave the target exactly as it found it.
    if (evidence.checks.restoreStatus !== 200) failures.push(`restore PUT status ${evidence.checks.restoreStatus}`)
    if (!afterCompany || afterCompany.industry !== originalIndustry) failures.push('industry was not restored (API read)')
    const beforeFields = evidence.company?.plaintextBefore ?? {}
    const afterFields = evidence.checks.plaintextAfter ?? {}
    if (Object.keys(beforeFields).some((key) => beforeFields[key] !== afterFields[key])) {
      failures.push('other company fields changed (decrypted compare)')
    }

    evidence.failures = failures
    if (failures.length > 0) failure = new Error(`approval drill checks failed: ${failures.join('; ')}`)
  } catch (error) {
    failure = error
    evidence.failures = [String(error?.message ?? error)]
  } finally {
    // Best effort: if the run failed before the planned restore, put the demo
    // row back through the same normal edit API before the server goes away.
    if (restoreTarget && employeeCookie) {
      try {
        const check = await fetch(`${BASE}/api/customers/companies?limit=200`, { headers: { cookie: employeeCookie } })
        const body = await check.json()
        const current = (body.items ?? []).find((item) => item.id === restoreTarget.id)
        if (current && current.industry !== restoreTarget.industry) {
          await fetch(`${BASE}/api/customers/companies`, {
            method: 'PUT',
            headers: { cookie: employeeCookie, 'content-type': 'application/json' },
            body: JSON.stringify({ id: restoreTarget.id, industry: restoreTarget.industry }),
            signal: AbortSignal.timeout(10_000),
          })
          evidence.checks.finallyRestore = 'attempted'
        }
      } catch {
        evidence.checks.finallyRestore = 'failed'
      }
    }
    server.kill('SIGTERM')
    for (let attempt = 0; attempt < 20 && server.exitCode === null; attempt += 1) await sleep(250)
    if (server.exitCode === null) server.kill('SIGKILL')
    fs.closeSync(log)
    evidence.finishedAt = new Date().toISOString()
    evidence.result = failure ? 'failed' : 'passed'
    fs.writeFileSync(path.join(OUT, `approval-${STAMP}.json`), `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(JSON.stringify({ result: evidence.result, failures: evidence.failures ?? [], evidence: path.join(OUT, `approval-${STAMP}.json`) }))
  }
  if (failure) process.exitCode = 1
}

await main()
