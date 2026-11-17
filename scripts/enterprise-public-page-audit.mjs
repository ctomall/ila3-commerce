#!/usr/bin/env node
/**
 * Read-only audit of the public front-end routes (no employee session).
 *
 * Covers the 29 frontend routes from the inventory: start/login/reset/privacy/
 * terms/docs/onboarding, the org-scoped customer portal, quote and message
 * token pages, and the pay/checkout pages. Every page is opened anonymously
 * with sentinel tokens; nothing is submitted.
 *
 * Safety: only GET/HEAD/OPTIONS leave the browser. Every non-GET is aborted
 * (except the verified read-only permission probe), every request to a host
 * other than the loopback base is aborted, so no payment provider, analytics
 * or email endpoint can be contacted. A page that crashes, hangs or widens the
 * 390px document is reported; nothing is fixed here.
 *
 * Usage: BASE_URL=http://127.0.0.1:3000 node scripts/enterprise-public-page-audit.mjs <out.json>
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'

const base = process.env.BASE_URL
const output = process.argv[2]
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base) || !output) throw Error('Explicit loopback BASE_URL and output required')
const baselinePath = process.env.INVENTORY_BASELINE ?? '.ai/analysis/enterprise-inventory-baseline.json'
const SENTINEL = process.env.PUBLIC_SENTINEL ?? 'public-audit-sentinel-7d1a6'
const READINESS_BUDGET_MS = 4_000
const loopbackHost = new URL(base).host

function databaseUrl() {
  const env = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8')
  const line = env.split('\n').find((entry) => entry.startsWith('DATABASE_URL='))
  if (!line) throw new Error('DATABASE_URL missing from .env')
  return line.slice('DATABASE_URL='.length).trim()
}

function orgSlug() {
  if (process.env.PUBLIC_ORG_SLUG) return process.env.PUBLIC_ORG_SLUG
  const slug = execFileSync('psql', [databaseUrl(), '-At', '-c', 'select slug from organizations order by created_at limit 1'], { encoding: 'utf8', timeout: 20_000 }).trim()
  if (!slug) throw new Error('no organization slug found')
  return slug
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
const frontendRoutes = baseline.pages
  .filter((page) => page.routes === undefined)
  .filter((page) => {
    const route = page.route ?? ''
    return !route.startsWith('/backend') && route !== '/'
  })
  .map((page) => page.route)

const routes = [...new Set([
  '/start', '/login', '/reset', '/terms', '/privacy', '/docs/api',
  ...frontendRoutes,
])]
const slug = orgSlug()

function concrete(route) {
  return route
    .replace(/\[orgSlug\]/g, slug)
    .replace(/\[(token|slug|id|transactionId|offerId|variantId|entityId|productId|channelId|recordId)\]/g, SENTINEL)
    .replace(/\[\.\.\.slug\]/g, 'public-audit-unknown')
}

const browser = await chromium.launch({ timeout: 30_000 })
const context = await browser.newContext({ viewport: { width: 390, height: 900 } })
const results = []
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true })

await context.route('**/*', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  if (url.host !== loopbackHost) return route.abort()
  if (request.method() === 'POST' && url.pathname === '/api/auth/feature-check') return route.continue()
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.abort()
  return route.continue()
})

try {
  for (const route of routes) {
    const url = concrete(route)
    const record = { route, url, viewports: [] }
    const pageErrors = []
    const request = { blockedWrites: [], externalBlocked: [] }
    const page = await context.newPage()
    page.on('pageerror', (error) => pageErrors.push(error.name))
    page.on('requestfailed', (failed) => {
      const target = failed.url()
      if (!target.startsWith(base)) request.externalBlocked.push(target.slice(0, 120))
    })
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
          const main = document.querySelector('main') ?? document.body
          // innerText skips <script>/<style> text, textContent includes them.
          const text = (main?.innerText ?? '').replace(/\s+/g, ' ').trim()
          return {
            status: null,
            title: document.title,
            url: location.pathname + location.search,
            width: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            text: text.slice(0, 240),
            crashed: /Application error|Something went wrong|出错了/.test(text),
            denied: /Access Denied|无权访问|没有权限/.test(text),
            notFound: /not found|未找到|不存在|无效|已过期/i.test(text),
          }
        })
        record.viewports.push({ viewport, httpStatus: response?.status() ?? null, readiness, ...view })
      } catch (error) {
        record.viewports.push({ viewport, failure: error.name })
      }
    }
    record.pageErrors = [...new Set(pageErrors)]
    record.overflow = record.viewports.some((view) => view.scrollWidth > view.width + 1)
    record.verdict = record.viewports.some((view) => view.crashed) ? 'crashed'
      : record.viewports.some((view) => view.failure) ? 'navigation-failure'
        : record.viewports.some((view) => view.denied) ? 'denied-or-auth'
          : record.viewports.some((view) => view.notFound || elementNotFound(view)) ? 'not-found-state'
            : 'rendered'
    await page.close()
    results.push(record)
    const payload = { base, scope: 'public-frontend-routes-anonymous', orgSlug: slug, count: routes.length, completed: results.length, results }
    fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`)
    console.log(JSON.stringify({ route: record.url, verdict: record.verdict, overflow: record.overflow }))
  }
} finally {
  await context.unrouteAll({ behavior: 'wait' })
  await context.close()
  await browser.close()
}

function elementNotFound() {
  return false
}
