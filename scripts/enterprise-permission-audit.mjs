#!/usr/bin/env node
/**
 * Employee-view permission sweep for the authorized navigation destinations.
 *
 * The render sweeps run as superadmin. This one signs in as the demo employee
 * and records what each destination answers: rendered, permission denied, not
 * found, or crashed. It shows the pages an employee is given are not silently
 * broken or empty, and that the fixed account/management entries stay present.
 *
 * Read-only: only GET/HEAD/OPTIONS plus the verified permission probe; writes
 * blocked, foreign hosts aborted.
 *
 * Usage: BASE_URL=http://127.0.0.1:3000 CRM_TEST_CREDENTIAL_FILE=... \
 *        node scripts/enterprise-permission-audit.mjs <out.json>
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const base = process.env.BASE_URL
const output = process.argv[2]
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base) || !output) throw Error('Explicit loopback BASE_URL and output required')
const credentialFile = process.env.CRM_TEST_CREDENTIAL_FILE
if (!credentialFile) throw Error('Explicit test credential file required')
const STATIC_AUDIT = process.env.STATIC_AUDIT ?? '.ai/analysis/enterprise-static-page-audit.json'
const loopbackHost = new URL(base).host

const rows = fs.readFileSync(credentialFile, 'utf8').split('\n').map((line) => line.trim().split(/\s+/))
const account = rows.find((fields) => fields[0] === 'employee')
if (!account) throw Error('employee credential missing')
const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  body: new URLSearchParams({ email: account[1], password: account[2] }),
  signal: AbortSignal.timeout(15_000),
})
if (!login.ok) throw Error(`Employee login failed: ${login.status}`)
const { token } = await login.json()

// Use the EMPLOYEE's own authorized catalogue, not the superadmin sweep list:
// the question is whether the links this employee is shown actually open.
const navResponse = await fetch(`${base}/api/crm_navigation/navigation?chrome=1&path=/backend`, {
  headers: { cookie: `auth_token=${token}` },
  signal: AbortSignal.timeout(20_000),
})
if (!navResponse.ok) throw Error(`employee navigation failed: ${navResponse.status}`)
const nav = await navResponse.json()
const catalogue = nav.crm
const entries = [
  ...(catalogue?.groups ?? []).flatMap((group) => group.items ?? []),
  ...(catalogue?.manage?.categories ?? []).flatMap((category) => category.items ?? []),
  ...(catalogue?.personal?.items ?? []),
]
const routes = [...new Set(entries.map((entry) => String(entry.href ?? '').split('?')[0]))].filter((route) => route.startsWith('/backend'))

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
    const record = { route, verdict: 'unknown' }
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.name))
    try {
      // A shared host can stall one navigation; retry once before calling the
      // page unreachable. The retry is recorded so it cannot hide a pattern.
      let response = null
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          response = await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 25_000 })
          break
        } catch (error) {
          if (attempt === 1) throw error
          record.retried = true
          await page.waitForTimeout(1_000)
        }
      }
      record.status = response?.status() ?? null
      await page.locator('header').waitFor({ timeout: 15_000 })
      await page.waitForTimeout(1_500)
      const view = await page.evaluate(() => {
        const main = document.querySelector('main')
        const text = (main?.innerText ?? '').replace(/\s+/g, ' ')
        return {
          url: `${location.pathname}${location.search}`,
          denied: /Access Denied|无权访问|没有权限|Forbidden/.test(text),
          crashed: /Application error|Something went wrong|出错了/.test(text),
          notFound: /not found|未找到|不存在/i.test(text),
          fixedEntries: [...document.querySelectorAll('a[href="/backend/manage"], a[href="/backend/profile"], a[href^="/backend/profile?"]')].length,
          text: text.slice(0, 160),
        }
      })
      // "not found" text is common inside empty table placeholders, so it stays a
      // recorded flag rather than a verdict; only an explicit denial/crash wins.
      record.notFoundText = view.notFound
      record.verdict = view.denied ? 'denied' : view.crashed ? 'crashed' : 'rendered'
      record.fixedEntries = view.fixedEntries
      record.authorizedLabel = entries.find((entry) => String(entry.href ?? '').split('?')[0] === route)?.label ?? null
      record.finalUrl = view.url
      record.text = view.text
    } catch (error) {
      record.verdict = 'navigation-failure'
      record.failure = error.name
    }
    record.pageErrors = [...new Set(pageErrors)]
    await page.close()
    results.push(record)
    fs.writeFileSync(output, `${JSON.stringify({ base, scope: 'employee-view-navigation', count: routes.length, completed: results.length, results }, null, 2)}\n`)
    console.log(JSON.stringify({ route, verdict: record.verdict, status: record.status, fixed: record.fixedEntries }))
  }
} finally {
  await context.unrouteAll({ behavior: 'wait' })
  await context.close()
  await browser.close()
}
