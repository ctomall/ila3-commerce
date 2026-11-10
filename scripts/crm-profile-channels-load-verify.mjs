#!/usr/bin/env node
/**
 * Profile communication-channels page: bounded-load verification.
 *
 * Proves the thing the page promised and did not do before this fix: a table whose
 * data request never answers must not spin forever. Two scenarios run against a real
 * browser and a real session (credentials stay in `~/.ila3-admin-credentials`):
 *
 *   1. normal  — the page renders its real empty state; no timeout surface appears.
 *   2. stalled — `GET /api/communication_channels/me/channels` is intercepted and never
 *                answered; past the budget the table must be replaced by the readable
 *                error with a retry exit, and the page itself must stay usable.
 *
 * Usage:
 *   node scripts/crm-profile-channels-load-verify.mjs [--base URL] [--budget-ms N] [--out DIR]
 *
 * Exit code 0 = both scenarios held. Non-zero = at least one assertion failed (the
 * report names which). Screenshots are written to --out for the audit trail.
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { credentials, loginWithRetry } from './lib/session.mjs'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const BASE = String(arg('base', process.env.CRM_NAV_BASE_URL ?? 'http://127.0.0.1:3000')).replace(/\/+$/, '')
const ROLE = arg('role', 'superadmin')
const BUDGET_MS = Number(arg('budget-ms', process.env.CRM_TABLE_LOAD_BUDGET_MS ?? '20000'))
const OUT_DIR = path.resolve(arg('out', '/storage/artifacts/pro/menu-declaration-audit/acceptance-closure/t1-shots'))
const PAGE_PATH = '/backend/profile/communication-channels'
const CHANNELS_API = '**/api/communication_channels/me/channels'
/** Locale-robust: the deployment serves zh by default and en for English sessions. */
const TIMEOUT_TITLE = /加载超时|Loading timed out/
const RETRY_LABEL = /重新加载|Reload/
const EMPTY_STATE = /no connected channels|connected yet|还没有连接|未连接任何渠道|暂无|没有已连接/i
const TABLE_LOADING = /正在加载表格|Loading data/i

function fail(report, message) {
  report.failures.push(message)
  report.exitCode = 1
}

async function loginCookies() {
  const credential = credentials().get(ROLE)
  if (!credential) throw new Error(`no "${ROLE}" credential in ~/.ila3-admin-credentials`)
  const cookieHeader = await loginWithRetry(BASE, credential, { role: ROLE })
  const host = new URL(BASE).hostname
  return cookieHeader.split('; ').map((pair) => {
    const i = pair.indexOf('=')
    return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: host, path: '/' }
  })
}

async function openPage(browser, cookies, { intercept }) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  })
  await context.addCookies(cookies)
  const page = await context.newPage()
  const api = []
  page.on('response', async (response) => {
    if (!response.url().includes('/api/communication_channels/me/channels')) return
    let body = null
    try {
      body = (await response.text()).slice(0, 200)
    } catch {
      body = '[unreadable]'
    }
    api.push({ url: response.url(), status: response.status(), body })
  })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error).slice(0, 300)))
  if (intercept) {
    // A handler that never resolves: the request stays open exactly like a route
    // handler that stopped answering or an ingress that holds the stream.
    await page.route(CHANNELS_API, async () => {
      await new Promise(() => {})
    })
  }
  await page.goto(`${BASE}${PAGE_PATH}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  return { context, page, api, pageErrors }
}

async function waitFor(predicate, timeoutMs, stepMs = 250) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, stepMs))
  }
  return false
}

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const report = {
    schemaVersion: 1,
    label: 'profile-channels-bounded-load',
    base: BASE,
    page: PAGE_PATH,
    budgetMs: BUDGET_MS,
    generatedAt: new Date().toISOString(),
    scenarios: {},
    failures: [],
    exitCode: 0,
  }
  const cookies = await loginCookies()
  const browser = await chromium.launch({ headless: true })
  try {
    // ---- scenario 1: a healthy page keeps its own empty state --------------------
    {
      const { context, page, api, pageErrors } = await openPage(browser, cookies, { intercept: false })
      const shot = path.join(OUT_DIR, 'channels-normal-empty.png')
      try {
        const settled = await waitFor(
          async () => !(await page.evaluate((src) => new RegExp(src, 'i').test(document.body?.innerText ?? ''), TABLE_LOADING.source)),
          30_000,
        )
        const text = await page.evaluate(() => document.body?.innerText ?? '')
        const scenario = {
          settled,
          sawEmptyState: EMPTY_STATE.test(text),
          sawTimeoutSurface: TIMEOUT_TITLE.test(text),
          api,
          pageErrors,
          screenshot: shot,
        }
        if (!settled) fail(report, 'normal: the table never left its loading state')
        if (!scenario.sawEmptyState) fail(report, 'normal: the empty state is missing')
        if (scenario.sawTimeoutSurface) fail(report, 'normal: the timeout surface appeared on a healthy load')
        report.scenarios.normal = scenario
        await page.screenshot({ path: shot, fullPage: false })
      } finally {
        await context.close()
      }
    }

    // ---- scenario 2: a request that never answers is bounded ---------------------
    {
      const { context, page, api, pageErrors } = await openPage(browser, cookies, { intercept: true })
      const shot = path.join(OUT_DIR, 'channels-stalled-timeout.png')
      try {
        const appeared = await waitFor(
          async () => TIMEOUT_TITLE.test(await page.evaluate(() => document.body?.innerText ?? '')),
          BUDGET_MS + 20_000,
        )
        const text = await page.evaluate(() => document.body?.innerText ?? '')
        const bodyStillLoading = TABLE_LOADING.test(text)
        const retry = await page.getByRole('button', { name: RETRY_LABEL }).first().isVisible().catch(() => false)
        const alertRole = await page.getByRole('alert').first().isVisible().catch(() => false)
        const pageUsable = /我的通信渠道|My communication channels|Connect/i.test(text)
        const scenario = {
          timeoutSurfaceAppeared: appeared,
          tableStillSpinning: bodyStillLoading,
          retryVisible: retry,
          roleAlert: alertRole,
          pageStillUsable: pageUsable,
          interceptedApiResponses: api,
          pageErrors,
          screenshot: shot,
        }
        if (!appeared) fail(report, `stalled: no timeout surface within ${BUDGET_MS + 20_000} ms`)
        if (bodyStillLoading) fail(report, 'stalled: the table is still showing its loading row')
        if (!retry) fail(report, 'stalled: the retry exit is missing')
        if (!alertRole) fail(report, 'stalled: the error is not announced (role="alert")')
        if (!pageUsable) fail(report, 'stalled: the page header/connect entry disappeared')
        if (api.length > 0) fail(report, 'stalled: the intercepted request produced a response')
        report.scenarios.stalled = scenario
        await page.screenshot({ path: shot, fullPage: false })
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
  return report
}

const report = await run()
const outPath = path.join(OUT_DIR, 'profile-channels-bounded-load-report.json')
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ ...report, reportPath: outPath }, null, 2))
process.exitCode = report.exitCode
