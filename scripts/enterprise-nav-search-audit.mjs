#!/usr/bin/env node
/**
 * Navigation-search authorization audit (read-only).
 *
 * Opens the shell navigation search as superadmin and employee and checks:
 *   - every entry in the caller's own catalogue is findable by typing its label;
 *   - nothing outside that catalogue is returned — in particular no
 *     superadmin-only destination leaks into the employee's results;
 *   - a nonsense query shows the "no authorized entry" empty message.
 *
 * Only GETs run; the search is a client-side filter over the authorized payload.
 *
 * Usage: BASE_URL=http://127.0.0.1:3000 CRM_TEST_CREDENTIAL_FILE=... \
 *        node scripts/enterprise-nav-search-audit.mjs <out.json>
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const base = process.env.BASE_URL
const output = process.argv[2]
if (!base || /^http:\/\/127\.0\.0\.1:\d+$/.test(base) === false || !output) throw Error('Explicit loopback BASE_URL and output required')
const CREDS = process.env.CRM_TEST_CREDENTIAL_FILE
if (!CREDS) throw Error('Explicit test credential file required')
const loopbackHost = new URL(base).host
const rows = fs.readFileSync(CREDS, 'utf8').split('\n').map((line) => line.trim().split(/\s+/))

async function login(role) {
  const account = rows.find((fields) => fields[0] === role)
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    body: new URLSearchParams({ email: account[1], password: account[2] }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`${role} login failed: ${response.status}`)
  return response.json()
}

async function catalogue(token) {
  const response = await fetch(`${base}/api/crm_navigation/navigation?chrome=1&path=/backend`, {
    headers: { cookie: `auth_token=${token}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`catalogue failed: ${response.status}`)
  const crm = (await response.json()).crm ?? {}
  const entries = [
    ...(crm.groups ?? []).flatMap((group) => group.items ?? []),
    ...(crm.manage?.categories ?? []).flatMap((category) => category.items ?? []),
    ...(crm.personal?.items ?? []),
  ]
  return entries.map((entry) => ({ href: String(entry.href ?? '').split('?')[0], label: entry.label ?? entry.href }))
}

const browser = await chromium.launch({ timeout: 30_000 })
const results = []
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true })
try {
  const superadmin = await login('superadmin')
  const employee = await login('employee')
  const adminEntries = await catalogue(superadmin.token)
  const employeeEntries = await catalogue(employee.token)
  const employeeHrefs = new Set(employeeEntries.map((entry) => entry.href))
  const adminOnly = adminEntries.filter((entry) => !employeeHrefs.has(entry.href))

  for (const [role, auth, own] of [['superadmin', superadmin, adminEntries], ['employee', employee, employeeEntries]]) {
    const record = { role, own: own.length, found: 0, missing: [], leaks: [], emptyState: false }
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.addCookies([{ name: 'auth_token', value: auth.token, url: base, httpOnly: true, sameSite: 'Lax' }])
    await context.route('**/*', (route) => {
      const request = route.request()
      if (new URL(request.url()).host !== loopbackHost) return route.abort()
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.abort()
      return route.continue()
    })
    const page = await context.newPage()
    await page.goto(`${base}/backend`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.getByRole('button', { name: '查找功能入口' }).click({ timeout: 20_000 })
    const input = page.getByRole('textbox', { name: '查找功能入口' })
    await input.waitFor({ timeout: 15_000 })
    const allowed = new Set(own.map((entry) => entry.href))

    for (const entry of own) {
      await input.fill(entry.label)
      await page.waitForTimeout(220)
      if ((await page.locator(`[data-nav-search-entry="${entry.href}"]`).count()) > 0) record.found += 1
      else record.missing.push({ href: entry.href, label: entry.label })
    }

    // Leak test: admin-only labels must never surface for the employee.
    const probes = role === 'employee' ? adminOnly.slice(0, 40) : adminOnly.slice(0, 10)
    for (const entry of probes) {
      await input.fill(entry.label)
      await page.waitForTimeout(220)
      const returned = await page.locator('[data-nav-search-entry]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-nav-search-entry')))
      for (const href of returned) {
        if (!allowed.has(href)) record.leaks.push({ probe: entry.label, href })
      }
    }

    await input.fill('zzz-no-such-entry-98765')
    await page.waitForTimeout(400)
    const text = (await page.locator('main').innerText().catch(() => '')) + (await page.locator('body').innerText().catch(() => ''))
    record.emptyState = /没有匹配的已授权入口/.test(text)
    await context.close()
    results.push(record)
    fs.writeFileSync(output, `${JSON.stringify({ base, scope: 'navigation-search-authorization', probes: adminOnly.length, steps: results.length, results }, null, 2)}\n`)
    console.log(JSON.stringify({ role, own: record.own, found: record.found, missing: record.missing.length, leaks: record.leaks.length, emptyState: record.emptyState }))
  }
} finally {
  await browser.close()
}
