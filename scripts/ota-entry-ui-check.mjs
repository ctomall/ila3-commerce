#!/usr/bin/env node
/**
 * Verify the OTA entry POINT in the UI (not only the JSON API): the System
 * Update page must render the running release for a superadmin.
 *
 * Read-only, one page, no writes.
 *
 * Usage: BASE_URL=http://127.0.0.1:3000 CREDS=... node scripts/ota-entry-ui-check.mjs [out.json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const base = process.env.BASE_URL
const out = process.argv[2]
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base) || !out) throw Error('Explicit loopback BASE_URL and output required')
const CREDS = process.env.CRM_TEST_CREDENTIAL_FILE ?? '/home/pro/.ila3-admin-credentials'
const rows = fs.readFileSync(CREDS, 'utf8').split('\n').map((line) => line.trim().split(/\s+/))
const account = rows.find((fields) => fields.includes('superadmin@acme.com'))
const login = await fetch(`${base}/api/auth/login`, { method: 'POST', body: new URLSearchParams({ email: account[1], password: account[2] }) })
if (!login.ok) throw Error(`login failed: ${login.status}`)
const { token } = await login.json()
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addCookies([{ name: 'auth_token', value: token, url: base, httpOnly: true, sameSite: 'Lax' }])
await context.route('**/*', (route) => {
  const request = route.request()
  const host = new URL(request.url()).host
  if (host !== new URL(base).host) return route.abort()
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.abort()
  return route.continue()
})
const page = await context.newPage()
await page.goto(`${base}/backend/config/system-update`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
await page.waitForTimeout(3_000)
const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
const evidence = {
  checkedAt: new Date().toISOString(),
  url: page.url(),
  runningVersionVisible: /0\.2\.\d+/.test(text),
  runningCommitVisible: /[0-9a-f]{7,}/i.test(text),
  hasUpdateHeading: /系统更新|System Update/i.test(text),
  hasRunRecord: /部署|deploy/i.test(text),
  text: text.slice(0, 600),
}
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
fs.writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`)
console.log(JSON.stringify(evidence))
await browser.close()
