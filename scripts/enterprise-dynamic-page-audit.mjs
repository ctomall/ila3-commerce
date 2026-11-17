#!/usr/bin/env node
/**
 * Read-only render sweep for the dynamic backend pages the static sweep cannot reach.
 *
 * The authorized-navigation sweep covers 137 static destinations. The inventory
 * also declares ~105 routes containing placeholders (`/backend/customers/companies/[id]`),
 * which never appear in navigation and were therefore never exercised. This sweep
 * fills that gap without writing anything:
 *
 *  - one placeholder id is resolved per resolvable module through its own GET
 *    list endpoint, inside the caller's authorized scope;
 *  - every other route uses a sentinel UUID, which exercises the not-found /
 *    empty-state path (a page that crashes or spins forever on a missing record
 *    is a real defect and is reported as such);
 *  - navigation, layout, readiness, skeletons, uncaught errors and narrow-width
 *    overflow are recorded per route and viewport;
 *  - every non-GET is aborted except the verified read-only permission query.
 *
 * This is evidence, not a pass/fail gate: outcomes are recorded and the exit code
 * stays 0 unless the sweep itself fails.
 *
 * Usage: BASE_URL=http://127.0.0.1:3387 CRM_TEST_CREDENTIAL_FILE=... \
 *        node scripts/enterprise-dynamic-page-audit.mjs .ai/analysis/<out>.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const base = process.env.BASE_URL
const output = process.argv[2]
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base) || !output) throw Error('Explicit loopback BASE_URL and output required')
const credentialFile = process.env.CRM_TEST_CREDENTIAL_FILE
if (!credentialFile) throw Error('Explicit test credential file required')
const baselinePath = process.env.INVENTORY_BASELINE ?? '.ai/analysis/enterprise-inventory-baseline.json'
const SENTINEL_UUID = '11111111-1111-4111-8111-111111111111'
const READINESS_BUDGET_MS = 4000

const rows = fs.readFileSync(credentialFile, 'utf8').split('\n').map((line) => line.trim().split(/\s+/))
const account = rows.find((fields) => fields.includes('superadmin@acme.com'))
if (!account) throw Error('Superadmin test credential missing')
const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  body: new URLSearchParams({ email: account[1], password: account[2] }),
  signal: AbortSignal.timeout(15_000),
})
if (!login.ok) throw Error(`Test login failed: ${login.status}`)
const { token } = await login.json()
const headers = { Cookie: `auth_token=${token}` }

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
const dynamicRoutes = baseline.pages
  .filter((page) => typeof page.route === 'string' && page.route.includes('['))
  .filter((page) => page.declared?.requireAuth === true)
  .map((page) => page.route)

/** Route-prefix -> list API that yields a real id in the caller's scope. */
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
async function resolveId(route) {
  const candidates = ID_SOURCES.filter((source) => route.startsWith(`${source.prefix}/`))
  // Longest matching prefix wins (`companies-v2` before `companies`).
  candidates.sort((a, b) => b.prefix.length - a.prefix.length)
  const source = candidates[0]
  if (!source) return { id: SENTINEL_UUID, source: 'sentinel' }
  if (!idCache.has(source.api)) {
    try {
      const response = await fetch(base + source.api, { headers, signal: AbortSignal.timeout(20_000) })
      const body = response.ok ? await response.json() : null
      idCache.set(source.api, Array.isArray(body?.items) && body.items[0]?.id ? body.items[0].id : null)
    } catch {
      idCache.set(source.api, null)
    }
  }
  const id = idCache.get(source.api)
  return id ? { id, source: `list-api:${source.api}` } : { id: SENTINEL_UUID, source: 'sentinel-after-empty-list' }
}

function concrete(route, id) {
  return route.replace(/\[[^\]]+\]/g, encodeURIComponent(id))
}

const browser = await chromium.launch({ timeout: 30_000 })
const results = []
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true })

async function renderRoute(page, url, viewport) {
  await page.setViewportSize({ width: viewport, height: 900 })
  const startedAt = Date.now()
  let status = null
  try {
    const response = await page.goto(base + url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    status = response?.status() ?? null
  } catch (error) {
    return { viewport, status, failure: error.name, loading: false, skeletons: 0 }
  }
  const readiness = await page.evaluate((budget) => new Promise((resolve) => {
    const main = document.querySelector('main')
    if (!main) return resolve({ kind: 'no-main' })
    let quiet
    let deadline
    const observer = new MutationObserver(() => {
      clearTimeout(quiet)
      quiet = setTimeout(() => finish('dom-quiet'), 500)
    })
    const finish = (kind) => {
      clearTimeout(quiet)
      clearTimeout(deadline)
      observer.disconnect()
      resolve({ kind })
    }
    observer.observe(main, { childList: true, subtree: true, attributes: true })
    deadline = setTimeout(() => finish('budget-exceeded'), budget)
    quiet = setTimeout(() => finish('dom-quiet'), 500)
  }), READINESS_BUDGET_MS)
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const view = await page.evaluate(() => {
    const main = document.querySelector('main')
    const text = main?.textContent ?? ''
    return {
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      skeletons: main ? main.querySelectorAll('.animate-pulse').length : 0,
      title: main?.querySelector('h1,h2')?.textContent?.trim() ?? null,
      denied: /Access Denied|无权访问|没有权限/.test(text),
      crashed: /Application error|Something went wrong|出错了/.test(text),
      notFound: /not found|未找到|不存在/i.test(text),
    }
  })
  return { viewport, status, readiness: readiness.kind, elapsedMs: Date.now() - startedAt, ...view }
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addCookies([{ name: 'auth_token', value: token, url: base, httpOnly: true, sameSite: 'Lax' }])
  await context.route('**/api/**', async (route) => {
    const request = route.request()
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/auth/feature-check') return route.continue()
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.abort()
    return route.continue()
  })

  for (const route of dynamicRoutes) {
    const { id, source } = await resolveId(route)
    const url = concrete(route, id)
    const record = { route, url, idSource: source, viewports: [] }
    const pageErrors = []
    const page = await context.newPage()
    page.on('pageerror', (error) => pageErrors.push(error.name))
    try {
      for (const viewport of [1440, 390]) {
        record.viewports.push(await renderRoute(page, url, viewport))
      }
    } catch (error) {
      record.failure = error.name
    }
    record.pageErrors = [...new Set(pageErrors)]
    const descriptors = record.viewports.map((view) => {
      if (view.failure) return 'navigation-failure'
      if (view.crashed) return 'crashed'
      if (view.denied) return 'denied'
      if (view.skeletons > 0 && view.readiness !== 'dom-quiet') return 'stuck-loading'
      if (view.overflow) return 'overflow'
      if (view.notFound) return 'not-found-state'
      return 'rendered'
    })
    record.verdict = descriptors.includes('crashed') ? 'crashed'
      : descriptors.includes('denied') ? 'denied'
        : descriptors.includes('stuck-loading') ? 'stuck-loading'
          : descriptors.includes('navigation-failure') ? 'navigation-failure'
            : descriptors.includes('not-found-state') ? 'not-found-state'
              : descriptors.includes('overflow') ? 'overflow'
                : 'rendered'
    record.overflow = record.viewports.some((view) => view.scrollWidth > view.width + 1)
    await page.close()
    results.push(record)
    const completed = { base, scope: 'dynamic-placeholder-routes', count: dynamicRoutes.length, completed: results.length, results }
    fs.writeFileSync(output, `${JSON.stringify(completed, null, 2)}\n`)
    console.log(JSON.stringify({ route: record.url, verdict: record.verdict, idSource: source, overflow: record.overflow }))
  }
  await context.unrouteAll({ behavior: 'wait' })
  await context.close()
} finally {
  await browser.close()
}
