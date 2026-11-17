#!/usr/bin/env node
/**
 * Management-centre reachability audit (read-only).
 *
 * For superadmin and employee:
 *   - every personal-account entry in that caller's own catalogue is rendered
 *     on /backend/manage;
 *   - every management entry in that caller's own catalogue is findable through
 *     the centre's search by typing its label (data-manage-entry href appears).
 *
 * This checks the centre users actually use, not the sidebar: management centre
 * and personal account must stay reachable from the same place.
 *
 * Usage: BASE_URL=http://127.0.0.1:3000 CRM_TEST_CREDENTIAL_FILE=... \
 *        node scripts/enterprise-manage-center-audit.mjs <out.json>
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const base = process.env.BASE_URL
const output = process.argv[2]
if (!base || /^http:\/\/127\.0\.0\.1:\d+$/.test(base) === false || !output) throw Error('Explicit loopback BASE_URL and output required')
const CREDS = process.env.CRM_TEST_CREDENTIAL_FILE
if (!CREDS) throw Error('Explicit test credential file required')
const ROLES = ['superadmin', 'employee']
const loopbackHost = new URL(base).host
const rows = fs.readFileSync(CREDS, 'utf8').split('\n').map((line) => line.trim().split(/\s+/))
const browser = await chromium.launch({ timeout: 30_000 })
const results = []
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true })

async function catalogueFor(cookie) {
  const response = await fetch(`${base}/api/crm_navigation/navigation?chrome=1&path=/backend`, {
    headers: { cookie },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`catalogue failed: ${response.status}`)
  const payload = await response.json()
  const crm = payload.crm ?? {}
  return {
    manage: (crm.manage?.categories ?? []).flatMap((category) => category.items ?? []),
    personal: crm.personal?.items ?? [],
  }
}

try {
  for (const role of ROLES) {
    const record = { role, personal: 0, personalVisible: 0, manage: 0, found: 0, misses: [] }
    const account = rows.find((fields) => fields[0] === role)
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      body: new URLSearchParams({ email: account[1], password: account[2] }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!login.ok) throw new Error(`${role} login failed: ${login.status}`)
    const { token } = await login.json()
    const cookie = `auth_token=${token}`
    const catalogue = await catalogueFor(cookie)
    record.personal = catalogue.personal.length
    record.manage = catalogue.manage.length

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.addCookies([{ name: 'auth_token', value: token, url: base, httpOnly: true, sameSite: 'Lax' }])
    await context.route('**/*', (route) => {
      const request = route.request()
      if (new URL(request.url()).host !== loopbackHost) return route.abort()
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.abort()
      return route.continue()
    })
    const page = await context.newPage()
    await page.goto(`${base}/backend/manage`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.locator('[data-manage-search]').waitFor({ timeout: 20_000 })
    await page.waitForTimeout(800)

    for (const item of catalogue.personal) {
      if ((await page.locator(`a[href="${item.href}"]`).count()) > 0) record.personalVisible += 1
      else record.misses.push({ kind: 'personal', href: item.href, label: item.label })
    }
    for (const item of catalogue.manage) {
      const search = page.locator('[data-manage-search]')
      await search.fill(item.label ?? item.href)
      await page.waitForTimeout(250)
      if ((await page.locator(`[data-manage-entry="${item.href}"]`).count()) > 0) record.found += 1
      else record.misses.push({ kind: 'manage', href: item.href, label: item.label })
    }
    await context.close()
    results.push(record)
    fs.writeFileSync(output, `${JSON.stringify({ base, scope: 'manage-center-reachability', count: ROLES.length, completed: results.length, results }, null, 2)}\n`)
    console.log(JSON.stringify({ role, personal: record.personal, personalVisible: record.personalVisible, manage: record.manage, found: record.found, misses: record.misses.length }))
  }
} finally {
  await browser.close()
}
