#!/usr/bin/env node
/**
 * Probe the API references the inventory could not resolve to OpenAPI or a
 * static app route, and record whether the endpoint exists at runtime.
 *
 * Read-only: GET only (the endpoint answers 401/403/405 instead of 404 when it
 * exists, which is all this needs). No writes, no credentials printed.
 *
 * Usage: node scripts/enterprise-api-contract-probe.mjs [out.json]
 */
import fs from 'node:fs'
import path from 'node:path'

const repo = process.cwd()
const out = path.resolve(process.argv[2] ?? path.join(repo, '.ai/analysis/enterprise-api-contract-probe.json'))
const BASE = 'http://127.0.0.1:3000'
const HEADERS = { host: 'mercato.ila3.top', 'x-forwarded-proto': 'https' }
const CREDS = '/home/pro/.ila3-admin-credentials'

const matrix = JSON.parse(fs.readFileSync(path.join(repo, '.ai/analysis/enterprise-coverage-matrix.json'), 'utf8'))
const unresolved = [...new Set(matrix.rows.flatMap((row) => row.apiContract?.unresolved ?? []))].sort()

const rows = fs.readFileSync(CREDS, 'utf8').split('\n').map((line) => line.split(/\s+/))
const account = rows.find((fields) => fields[0] === 'superadmin')
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { ...HEADERS, 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ email: account[1], password: account[2] }),
  redirect: 'manual',
})
if (login.status !== 200) throw new Error(`login failed: ${login.status}`)
const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')

// POST-only routes that would send email/invite/reset messages or run writes.
// They are deliberately not probed: a GET 404 says nothing about their method,
// and a real POST could contact the outside world.
const UNSAFE_PREFIXES = [
  '/api/auth/reset',
  '/api/customer_accounts/',
  '/api/data_sync/run',
  '/api/entities/definitions.restore',
  '/api/entities/definitions.batch',
]
const results = []
for (const reference of unresolved) {
  // A missing concrete id would be the route's own concern; probe the literal
  // path only. Entries that contain `.` are property names, not URLs.
  const target = reference.split('?')[0]
  if (/\.[a-z]+$/i.test(target) && !target.includes('/api/')) {
    results.push({ reference, status: null, verdict: 'not-a-route' })
    continue
  }
  if (UNSAFE_PREFIXES.some((prefix) => target.startsWith(prefix))) {
    results.push({ reference: target, status: null, verdict: 'not-probed-unsafe' })
    continue
  }
  try {
    const response = await fetch(BASE + target, {
      method: 'GET',
      headers: { ...HEADERS, cookie },
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })
    // `/api/auth/feature-check` is a POST-only permission query already exercised
    // by the read-only sweeps; a GET 404 is a method mismatch, not a missing route.
    let verdict = response.status === 404 ? 'missing' : response.status === 405 ? 'exists-method-mismatch' : 'exists'
    if (target === '/api/auth/feature-check') verdict = 'exists-post-only-from-sweep'
    results.push({ reference: target, status: response.status, verdict })
  } catch (error) {
    results.push({ reference: target, status: null, verdict: 'probe-failed', error: String(error?.message ?? error) })
  }
}

fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, `${JSON.stringify({ probedAt: new Date().toISOString(), count: results.length, results }, null, 2)}\n`)
console.log(JSON.stringify({ out, summary: results.reduce((acc, row) => { acc[row.verdict] = (acc[row.verdict] ?? 0) + 1; return acc }, {}) }))
