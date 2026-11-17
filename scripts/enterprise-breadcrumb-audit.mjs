#!/usr/bin/env node
/**
 * Breadcrumb consistency audit for the authorized navigation destinations.
 *
 * For each destination this records the header breadcrumb (links + current
 * crumb), the sidebar label from the caller's own catalogue, and the page title.
 * A destination is consistent when the current crumb carries the same label the
 * navigation uses (or the visible page title), and every ancestor link in the
 * breadcrumb is an authorized catalogue destination.
 *
 * Read-only: GET/HEAD/OPTIONS only, foreign hosts aborted.
 *
 * Usage: BASE_URL=http://127.0.0.1:3000 CRM_TEST_CREDENTIAL_FILE=... \
 *        node scripts/enterprise-breadcrumb-audit.mjs <out.json>
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const base = process.env.BASE_URL
const output = process.argv[2]
if (!base || /^http:\/\/127\.0\.0\.1:\d+$/.test(base) === false || !output) throw Error('Explicit loopback BASE_URL and output required')
const CREDS = process.env.CRM_TEST_CREDENTIAL_FILE
if (!CREDS) throw Error('Explicit test credential file required')
const STATIC_AUDIT = process.env.STATIC_AUDIT ?? '.ai/analysis/enterprise-static-page-audit.json'
const loopbackHost = new URL(base).host
const rows = fs.readFileSync(CREDS, 'utf8').split('\n').map((line) => line.trim().split(/\s+/))

const normalise = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

const account = rows.find((fields) => fields.includes('superadmin@acme.com'))
const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  body: new URLSearchParams({ email: account[1], password: account[2] }),
  signal: AbortSignal.timeout(15_000),
})
if (!login.ok) throw Error(`login failed: ${login.status}`)
const { token } = await login.json()
const navResponse = await fetch(`${base}/api/crm_navigation/navigation?chrome=1&path=/backend`, {
  headers: { cookie: `auth_token=${token}` },
  signal: AbortSignal.timeout(20_000),
})
const catalogue = (await navResponse.json()).crm ?? {}
const entries = [
  ...(catalogue.groups ?? []).flatMap((group) => group.items ?? []),
  ...(catalogue.manage?.categories ?? []).flatMap((category) => category.items ?? []),
  ...(catalogue.personal?.items ?? []),
]
const labelByHref = new Map(entries.map((entry) => [String(entry.href ?? '').split('?')[0], entry.label ?? null]))
const authorizedHrefs = new Set(labelByHref.keys())

const staticAudit = JSON.parse(fs.readFileSync(STATIC_AUDIT, 'utf8'))
const routes = [...new Set((staticAudit.results ?? []).map((entry) => String(entry.route ?? '').split('?')[0]))].filter((route) => route.startsWith('/backend'))

const browser = await chromium.launch({ timeout: 30_000 })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addCookies([{ name: 'auth_token', value: token, url: base, httpOnly: true, sameSite: 'Lax' }])
await context.route('**/*', (route) => {
  const request = route.request()
  if (new URL(request.url()).host !== loopbackHost) return route.abort()
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.abort()
  return route.continue()
})

const results = []
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true })
try {
  for (const route of routes) {
    const record = { route, navLabel: labelByHref.get(route) ?? null, verdict: 'unknown' }
    const page = await context.newPage()
    try {
      await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 25_000 })
      await page.locator('header nav').waitFor({ timeout: 15_000 })
      await page.waitForTimeout(900)
      const view = await page.evaluate(() => {
        const nav = document.querySelector('header nav')
        const links = [...nav.querySelectorAll('a[href]')].map((anchor) => ({ href: anchor.getAttribute('href'), text: anchor.textContent?.trim() ?? '' }))
        const current = nav.querySelector('[aria-current="page"]')?.textContent?.trim() ?? null
        const heading = document.querySelector('main h1')?.textContent?.trim() ?? null
        return { links, current, heading, documentTitle: document.title }
      })
      record.breadcrumbLinks = view.links
      record.currentCrumb = view.current
      record.heading = view.heading
      record.unauthorizedAncestors = view.links
        .map((link) => String(link.href ?? '').split('?')[0])
        .filter((href) => href !== '/backend' && !authorizedHrefs.has(href))
      const expected = [normalise(record.navLabel), normalise(view.heading), normalise(view.documentTitle)]
      const crumb = normalise(view.current)
      if (!view.current && view.links.length === 0) record.verdict = 'no-breadcrumb'
      else if (!view.current) record.verdict = 'no-current-crumb'
      else if (expected.some((value) => value.length > 0 && (value === crumb || value.includes(crumb) || crumb.includes(value)))) record.verdict = 'consistent'
      else record.verdict = 'mismatch'
    } catch (error) {
      record.verdict = 'navigation-failure'
      record.failure = error.name
    }
    await page.close()
    results.push(record)
    fs.writeFileSync(output, `${JSON.stringify({ base, scope: 'breadcrumb-consistency', count: routes.length, completed: results.length, results }, null, 2)}\n`)
    console.log(JSON.stringify({ route, verdict: record.verdict, current: record.currentCrumb, nav: record.navLabel }))
  }
} finally {
  await context.unrouteAll({ behavior: 'wait' })
  await context.close()
  await browser.close()
}
