#!/usr/bin/env node
/**
 * Read-only render sweep for pages that are not authorized-navigation
 * destinations: create/edit forms, hidden settings sub-pages, profile detail and
 * placeholder routes outside the dynamic sweep. The route list comes from the
 * coverage matrix gaps, so this only ever exercises what is still unverified.
 *
 * Same read-only contract as the other sweeps: one authenticated session, only
 * GET/HEAD/OPTIONS (plus the verified read-only permission probe), every
 * foreign host aborted, 1440 + 390 viewports, bounded settling window.
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:3000 CRM_TEST_CREDENTIAL_FILE=... \
 *   node scripts/enterprise-direct-page-audit.mjs .ai/analysis/enterprise-direct-page-audit.json
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
const READINESS_BUDGET_MS = 4_000
const loopbackHost = new URL(base).host

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

const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'))
const gapRoutes = matrix.rows
  .filter((row) => row.evidence?.status === 'gap' && typeof row.route === 'string' && row.route.startsWith('/backend'))
  .map((row) => row.route)
if (gapRoutes.length === 0) {
  console.log(JSON.stringify({ skipped: true, reason: 'no backend gaps in matrix' }))
  process.exit(0)
}
const concrete = (route) => route.replace(/\[[^\]]+\]/g, SENTINEL)

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
  for (const route of gapRoutes) {
    const url = concrete(route)
    const record = { route, url, viewports: [], pageErrors: [] }
    const page = await context.newPage()
    page.on('pageerror', (error) => record.pageErrors.push(error.name))
    for (const viewport of [1440, 390]) {
      await page.setViewportSize({ width: viewport, height: 900 })
      try {
        const response = await page.goto(base + url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
        const readiness = await page.evaluate((budget) => new Promise((resolve) => {
          const main = document.querySelector('main')
          if (!main) return resolve('no-main')
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
            resolve(kind)
          }
          observer.observe(main, { childList: true, subtree: true, attributes: true })
          deadline = setTimeout(() => finish('budget-exceeded'), budget)
          quiet = setTimeout(() => finish('dom-quiet'), 500)
        }), READINESS_BUDGET_MS)
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        const view = await page.evaluate(() => {
          const main = document.querySelector('main')
          const text = (main?.innerText ?? '').replace(/\s+/g, ' ').trim()
          return {
            width: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            skeletons: main ? main.querySelectorAll('.animate-pulse').length : 0,
            title: main?.querySelector('h1,h2')?.textContent?.trim() ?? null,
            text: text.slice(0, 200),
            crashed: /Application error|Something went wrong|出错了/.test(text),
            denied: /Access Denied|无权访问|没有权限/.test(text),
            notFound: /not found|未找到|不存在|无效|已过期/i.test(text),
          }
        })
        if (view.scrollWidth > view.width + 1) {
          // A mid-load editor/table can be wider for a moment. Re-measure after
          // the page settles and keep the overflow only if it still holds.
          await page.waitForTimeout(400)
          const again = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
          view.width = again.width
          view.scrollWidth = again.scrollWidth
        }
        record.viewports.push({ viewport, httpStatus: response?.status() ?? null, readiness, ...view })
      } catch (error) {
        record.viewports.push({ viewport, failure: error.name })
      }
    }
    record.pageErrors = [...new Set(record.pageErrors)]
    record.overflow = record.viewports.some((view) => view.scrollWidth > view.width + 1)
    record.verdict = record.viewports.some((view) => view.crashed) ? 'crashed'
      : record.viewports.some((view) => view.failure) ? 'navigation-failure'
        : record.viewports.some((view) => view.denied) ? 'denied'
          : record.viewports.some((view) => view.notFound) ? 'not-found-state'
            : 'rendered'
    await page.close()
    results.push(record)
    fs.writeFileSync(output, `${JSON.stringify({ base, scope: 'direct-gap-routes', count: gapRoutes.length, completed: results.length, results }, null, 2)}\n`)
    console.log(JSON.stringify({ route: record.url, verdict: record.verdict, overflow: record.overflow }))
  }
} finally {
  await context.unrouteAll({ behavior: 'wait' })
  await context.close()
  await browser.close()
}
