#!/usr/bin/env node
/**
 * Read-only return-path audit for detail/create/edit pages.
 *
 * The render sweeps prove a page appears; this one proves the page tells the
 * caller how to leave it: a contextual return control (`[data-navigation-return]`)
 * or a breadcrumb link to an authorized ancestor (not just the dashboard).
 * Nothing is clicked and nothing is written.
 *
 * Usage: BASE_URL=http://127.0.0.1:3000 CRM_TEST_CREDENTIAL_FILE=... \
 *        node scripts/enterprise-return-path-audit.mjs <out.json>
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const base = process.env.BASE_URL
const output = process.argv[2]
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base) || !output) throw Error('Explicit loopback BASE_URL and output required')
const credentialFile = process.env.CRM_TEST_CREDENTIAL_FILE
if (!credentialFile) throw Error('Explicit test credential file required')
const matrixPath = process.env.COVERAGE_MATRIX ?? '.ai/analysis/enterprise-coverage-matrix.json'
const SENTINEL = process.env.DIRECT_SENTINEL ?? '11111111-1111-4111-8111-111111111111'
const loopbackHost = new URL(base).host

const rows = fs.readFileSync(credentialFile, 'utf8').split('\n').map((line) => line.trim().split(/\s+/))
const account = rows.find((fields) => fields.includes('superadmin@acme.com'))
const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  body: new URLSearchParams({ email: account[1], password: account[2] }),
  signal: AbortSignal.timeout(15_000),
})
if (!login.ok) throw Error(`Test login failed: ${login.status}`)
const { token } = await login.json()

const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'))

// Resolve a real record id where a list API is known, so the return path is
// measured on the populated page rather than on its not-found state.
const ID_SOURCES = [
  { prefix: '/backend/customers/companies', api: '/api/customers/companies?limit=1' },
  { prefix: '/backend/customers/companies-v2', api: '/api/customers/companies?limit=1' },
  { prefix: '/backend/customers/people-v2', api: '/api/customers/people?limit=1' },
  { prefix: '/backend/customers/people', api: '/api/customers/people?limit=1' },
  { prefix: '/backend/customers/deals', api: '/api/customers/deals?limit=1' },
  { prefix: '/backend/catalog/products', api: '/api/catalog/products?limit=1' },
  { prefix: '/backend/catalog/categories', api: '/api/catalog/categories?limit=1' },
  { prefix: '/backend/sales/orders', api: '/api/sales/orders?limit=1' },
  { prefix: '/backend/sales/quotes', api: '/api/sales/quotes?limit=1' },
  { prefix: '/backend/auth/users', api: '/api/auth/users?limit=1' },
  { prefix: '/backend/auth/roles', api: '/api/auth/roles?limit=1' },
  { prefix: '/backend/directory/organizations', api: '/api/directory/organizations?limit=1' },
  { prefix: '/backend/directory/tenants', api: '/api/directory/tenants?limit=1' },
]
const idCache = new Map()
async function resolveId(token, route) {
  const candidates = ID_SOURCES.filter((source) => route.startsWith(`${source.prefix}/`)).sort((a, b) => b.prefix.length - a.prefix.length)
  const source = candidates[0]
  if (!source || /\[[^\]]+\]\/[^/]+\//.test(route)) return SENTINEL
  if (!idCache.has(source.api)) {
    try {
      const response = await fetch(base + source.api, { headers: { cookie: `auth_token=${token}` }, signal: AbortSignal.timeout(15_000) })
      const body = response.ok ? await response.json() : null
      idCache.set(source.api, Array.isArray(body?.items) && body.items[0]?.id ? body.items[0].id : SENTINEL)
    } catch {
      idCache.set(source.api, SENTINEL)
    }
  }
  return idCache.get(source.api)
}
const routes = matrix.rows
  .filter((row) => ['backend-create-edit', 'backend-detail-dynamic', 'backend-profile'].includes(row.className))
  .map((row) => row.route)
const concrete = (route, id = SENTINEL) => route.replace(/\[[^\]]+\]/g, id)
const segmentPrefix = (ancestor, current) => ancestor === current || current.startsWith(`${ancestor}/`)

const browser = await chromium.launch({ timeout: 30_000 })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addCookies([{ name: 'auth_token', value: token, url: base, httpOnly: true, sameSite: 'Lax' }])
await context.route('**/*', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  if (url.host !== loopbackHost) return route.abort()
  if (request.method() === 'POST' && url.pathname === '/api/auth/feature-check') return route.continue()
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.abort()
  return route.continue()
})

const results = []
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true })
try {
  for (const route of routes) {
    const id = await resolveId(token, route)
    const url = concrete(route, id)
    const record = { route, url, links: [], returnHref: null, verdict: 'unknown' }
    const page = await context.newPage()
    try {
      await page.goto(base + url, { waitUntil: 'domcontentloaded', timeout: 25_000 })
      await page.locator('header').waitFor({ timeout: 15_000 })
      // Chrome and the contextual return control can arrive after hydration.
      await page
        .waitForFunction(
          () => Boolean(document.querySelector('[data-navigation-return]')) || document.querySelectorAll('header nav a[href]').length > 1,
          { timeout: 8_000 },
        )
        .catch(() => {})
      await page.waitForTimeout(500)
      const view = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('header nav a[href]')).map((anchor) => anchor.getAttribute('href')).filter(Boolean)
        const ret = document.querySelector('[data-navigation-return]')
        const path = `${location.pathname}${location.search}`
        return { links, returnHref: ret?.getAttribute('href') ?? null, path }
      })
      record.links = [...new Set(view.links)]
      record.returnHref = view.returnHref
      const ancestors = record.links.filter((href) => href !== '/backend' && segmentPrefix(href.split('?')[0], view.path.split('?')[0]))
      record.ancestors = ancestors
      record.verdict = record.returnHref
        ? 'return-control'
        : ancestors.length > 0
          ? 'ancestor-breadcrumb'
          : 'dashboard-only'
    } catch (error) {
      record.verdict = 'navigation-failure'
      record.failure = error.name
    }
    await page.close()
    results.push(record)
    fs.writeFileSync(output, `${JSON.stringify({ base, scope: 'return-path-create-edit-detail', count: routes.length, completed: results.length, results }, null, 2)}\n`)
    console.log(JSON.stringify({ route: record.url, verdict: record.verdict, returnHref: record.returnHref }))
  }
} finally {
  await context.unrouteAll({ behavior: 'wait' })
  await context.close()
  await browser.close()
}
