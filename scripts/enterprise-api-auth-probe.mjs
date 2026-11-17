#!/usr/bin/env node
/**
 * Runtime authorization probe for the page-referenced API surface.
 *
 * The matrix resolved each page's static API references against OpenAPI/static
 * routes/existence. This probe asks the authorization question: does the same
 * path answer anonymously, and does an employee session reach it?
 *
 * Read-only: GET only, no body, no writes. Results are classified, not judged:
 * a page reference can legitimately point at an admin-only endpoint, and some
 * endpoints (docs) are public by design. The report highlights only the
 * anomalies that need a human decision.
 *
 * Usage: node scripts/enterprise-api-auth-probe.mjs [out.json]
 */
import fs from 'node:fs'
import path from 'node:path'

const repo = process.cwd()
const out = path.resolve(process.argv[2] ?? path.join(repo, '.ai/analysis/enterprise-api-auth-probe.json'))
const BASE = process.env.AUTH_PROBE_BASE ?? 'http://127.0.0.1:3000'
const CREDS = process.env.CRM_TEST_CREDENTIAL_FILE ?? '/home/pro/.ila3-admin-credentials'
const HEADERS = { host: 'mercato.ila3.top', 'x-forwarded-proto': 'https' }
const TIMEOUT = 10_000
const CONCURRENCY = 4

const baseline = JSON.parse(fs.readFileSync(path.join(repo, '.ai/analysis/enterprise-inventory-baseline.json'), 'utf8'))
const references = [...new Set(
  baseline.pages
    .flatMap((page) => (page.apiMapping?.references ?? []).map((entry) => String(entry.path ?? '').split('?')[0]))
    .filter((path) => path.startsWith('/api/')),
)].sort()

const rows = fs.readFileSync(CREDS, 'utf8').split('\n').map((line) => line.split(/\s+/))
const account = rows.find((fields) => fields[0] === 'employee')
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ email: account[1], password: account[2] }),
})
if (!login.ok) throw Error(`employee login failed: ${login.status}`)
const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')

async function probe(target, cookieHeader) {
  try {
    const response = await fetch(BASE + target, {
      method: 'GET',
      headers: { ...HEADERS, ...(cookieHeader ? { cookie: cookieHeader } : {}) },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT),
    })
    return response.status
  } catch (error) {
    return `err:${error?.name ?? 'fetch'}`
  }
}

const results = new Array(references.length)
let cursor = 0
async function worker() {
  for (;;) {
    const index = cursor
    cursor += 1
    if (index >= references.length) return
    const target = references[index]
    const [anonymous, employee] = await Promise.all([probe(target, null), probe(target, cookie)])
    results[index] = { path: target, anonymous, employee }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

const classify = (row) => {
  if (row.anonymous === 'err:' || String(row.anonymous).startsWith('err:')) return 'probe-failed'
  if (row.anonymous === 200) return 'anonymous-200'
  if (row.anonymous === 401 || row.anonymous === 403) return row.employee === 200 ? 'protected-and-reachable' : 'protected'
  if (row.anonymous === 404 || row.anonymous === 405) return 'route-not-found-by-get'
  return 'other'
}
const annotated = results.map((row) => ({ ...row, classification: classify(row) }))
const summary = annotated.reduce((acc, row) => {
  acc[row.classification] = (acc[row.classification] ?? 0) + 1
  return acc
}, {})

fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, `${JSON.stringify({
  probedAt: new Date().toISOString(),
  base: BASE,
  role: 'employee',
  references: references.length,
  summary,
  anonymous200: annotated.filter((row) => row.classification === 'anonymous-200'),
  employee401: annotated.filter((row) => row.employee === 401),
  results: annotated,
}, null, 2)}\n`)
console.log(JSON.stringify({ out, references: references.length, summary, anonymous200: annotated.filter((row) => row.classification === 'anonymous-200').map((row) => row.path), employee401: annotated.filter((row) => row.employee === 401).map((row) => row.path) }))
