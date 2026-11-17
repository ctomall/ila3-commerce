#!/usr/bin/env node
/**
 * Read-only empty-state audit for the authorized list destinations.
 *
 * For every static navigation destination the sweep looks for a search input,
 * types a query that cannot match, and records whether the page settles into a
 * readable empty state (or at least shows zero result rows). Nothing is
 * submitted: a search is a GET, and all writes stay blocked.
 *
 * Usage: BASE_URL=http://127.0.0.1:3000 CRM_TEST_CREDENTIAL_FILE=... \
 *        node scripts/enterprise-empty-state-audit.mjs <out.json>
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
const NONSENSE = `zzz-no-match-${Date.now()}`
const EMPTY_TEXT = /no\s+[^.!]{0,48}\b(match|matches|found|results?|records?|items?)\b|nothing (found|matches)|empty|没有(找到|匹配|数据|记录)|暂无(数据|记录|内容)?|无匹配|未找到/i
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

const staticAudit = JSON.parse(fs.readFileSync(STATIC_AUDIT, 'utf8'))
const routes = [...new Set((staticAudit.results ?? []).map((entry) => String(entry.route ?? '').split('?')[0]))].filter((route) => route.startsWith('/backend'))

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
    const record = { route, verdict: 'unknown', rowsBefore: null, rowsAfter: null }
    const page = await context.newPage()
    try {
      await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 25_000 })
      await page.locator('main').waitFor({ timeout: 15_000 })
      await page.waitForTimeout(1_200)
      record.rowsBefore = await page.locator('main tbody tr').count()
      const search = page.locator(
        'main input[type="search"], main input[placeholder*="搜索"], main input[placeholder*="Search"], main [data-testid*="search"] input, [data-manage-search]',
      ).first()
      if ((await search.count()) === 0) {
        record.verdict = 'no-search-control'
      } else {
        await search.fill(NONSENSE, { timeout: 5_000 })
        await search.press('Enter').catch(() => {})
        for (let attempt = 0; attempt < 8; attempt += 1) {
          await page.waitForTimeout(500)
          record.rowsAfter = await page.locator('main tbody tr').count()
          const text = (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ')
          record.emptyTextVisible = EMPTY_TEXT.test(text)
          if (record.emptyTextVisible || record.rowsAfter === 0) break
        }
        record.verdict = record.emptyTextVisible
          ? 'empty-state-text'
          : record.rowsAfter === 0
            ? 'zero-rows'
            : 'no-empty-state'
      }
    } catch (error) {
      record.verdict = 'error'
      record.failure = error.name
    }
    await page.close()
    results.push(record)
    fs.writeFileSync(output, `${JSON.stringify({ base, scope: 'empty-state-list-destinations', nonsense: NONSENSE, count: routes.length, completed: results.length, results }, null, 2)}\n`)
    console.log(JSON.stringify({ route, verdict: record.verdict, before: record.rowsBefore, after: record.rowsAfter }))
  }
} finally {
  await context.unrouteAll({ behavior: 'wait' })
  await context.close()
  await browser.close()
}
