#!/usr/bin/env node
/**
 * M5 business acceptance with a real employee account: run -> candidate -> verify ->
 * approve -> idempotent CRM write -> replay.
 *
 * Every step is the HTTP API with the employee's own session; the CRM write goes
 * through `customers.companies.create` with that employee's identity. The script
 * asserts each response instead of printing it, and records the ids it created so
 * the fixture can be traced (and deleted under a separate decision).
 *
 * Usage: node scripts/crm-leadgen-acceptance.mjs [--out <dir>]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { credentials, loginWithRetry } from './lib/session.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.M4_BASE_URL ?? 'http://127.0.0.1:3000'
const outFlag = process.argv.indexOf('--out')
const OUT = path.resolve(
  outFlag === -1 ? 'docs/crm-platform/leadgen/evidence' : process.argv[outFlag + 1],
)

const creds = credentials()
if (!creds.has('employee')) {
  console.error('FAIL no employee credentials')
  process.exit(1)
}
const cookie = await loginWithRetry(BASE, creds.get('employee'), { role: 'employee' })

async function api(method, route, body, expected) {
  const response = await fetch(`${BASE}${route}`, {
    method,
    headers: { cookie, accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = { raw: text.slice(0, 400) }
  }
  const statuses = Array.isArray(expected) ? expected : [expected]
  if (!statuses.includes(response.status)) {
    throw new Error(`${method} ${route} expected ${statuses.join('/')} got ${response.status}: ${text.slice(0, 300)}`)
  }
  return { status: response.status, json: parsed }
}

const stamp = Date.now()
const runKey = `m5-accept-run-${stamp}`
const decisionKey = `m5-accept-decision-${stamp}`
const companyName = `M5 Acceptance Co ${stamp}`
const domain = `m5-acceptance-${stamp}.example`
const email = `li.wei@${domain}`
const evidence = {
  url: `https://${domain}/about`,
  fetchedAt: new Date().toISOString(),
  contentHash: `sha256:${'a'.repeat(64)}`,
  fields: { companyName, domain, email, contactName: 'Li Wei' },
}

const steps = []
function step(name, detail) {
  steps.push({ name, ...detail })
  console.log(`PASS ${name}`)
}

// 1. research run (idempotent by runKey)
const run = await api('POST', '/api/leadgen/runs', { runKey, source: 'manual' }, 201)
step('run-created', { runId: run.json.run.id })
const replayRun = await api('POST', '/api/leadgen/runs', { runKey, source: 'manual' }, 200)
step('run-replayed', { runId: replayRun.json.run.id, same: replayRun.json.run.id === run.json.run.id })

// 2. candidate with evidence
const candidate = await api(
  'POST',
  '/api/leadgen/candidates',
  {
    runId: run.json.run.id,
    companyName,
    domain,
    country: 'CN',
    contactName: 'Li Wei',
    contactEmail: email,
    sourceUrl: `https://${domain}/about`,
    evidence: [evidence],
  },
  201,
)
const candidateId = candidate.json.candidate.id
step('candidate-submitted', { candidateId })

// 3. deterministic verification
const verified = await api('POST', `/api/leadgen/candidates/${candidateId}/verify`, { mxChecked: false }, 200)
step('verified', { verdict: verified.json.verdict, cached: verified.json.cached })
if (verified.json.verdict !== 'pass') throw new Error(`verification verdict was ${verified.json.verdict}`)

// 4. human decision (replay must be a replay, not a second decision)
const decided = await api(
  'POST',
  `/api/leadgen/candidates/${candidateId}/decisions`,
  { decision: 'approve', decisionKey, reasonCode: 'm5_acceptance' },
  200,
)
step('approved', { replayed: decided.json.replayed })
const decidedAgain = await api(
  'POST',
  `/api/leadgen/candidates/${candidateId}/decisions`,
  { decision: 'approve', decisionKey, reasonCode: 'm5_acceptance' },
  200,
)
if (decidedAgain.json.replayed !== true) throw new Error('decision replay was not reported as a replay')
step('decision-replayed', { replayed: true })

// 5. idempotent CRM write
const write = await api('POST', `/api/leadgen/candidates/${candidateId}/crm-write`, {}, 201)
const crmEntityId = write.json.crmEntityId
step('crm-written', { crmEntityId, created: write.json.created })
const replayWrite = await api('POST', `/api/leadgen/candidates/${candidateId}/crm-write`, {}, 200)
if (replayWrite.json.crmEntityId !== crmEntityId) throw new Error('replay returned a different company')
if (replayWrite.json.created !== false) throw new Error('replay reported a second creation')
step('crm-write-replayed', { crmEntityId, created: false })

// 6. the candidate is visible to the employee through the list API
const list = await api('GET', '/api/leadgen/candidates?limit=100', undefined, 200)
const listed = list.json.items.find((item) => item.id === candidateId)
if (!listed) throw new Error('candidate is not visible in the organization list')
step('listed', { status: listed.status })

const payload = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  actor: 'employee',
  steps,
  runId: run.json.run.id,
  candidateId,
  crmEntityId,
  fixture: { companyName, domain, email, note: 'test company created by M5 acceptance; deletion needs a separate decision' },
}
fs.mkdirSync(OUT, { recursive: true })
const file = path.join(OUT, `m5-acceptance-${payload.generatedAt.replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`)
console.log(JSON.stringify({ result: 'PASS', file, candidateId, crmEntityId, steps: steps.map((s) => s.name) }, null, 2))
