#!/usr/bin/env node
/**
 * Click-through for the suppression list page: the page is only "operable" if a
 * human can record and release an address without the API.
 *
 * Runs against the deployed release with the rotated superadmin credential (mode
 * 600, never printed), saves before/after screenshots, and asserts the list is back
 * to its previous state (the test address is released, so no fixture is left).
 *
 * Usage: node scripts/crm-suppressions-ui-check.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { credentials } from './lib/session.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(__dirname, '..')
const EGO = '/home/pro/.dsh-src/profiles/web/node_modules/dsh-ego-browser/runtime/ego-linux/bin/ego-browser.mjs'
const BASE = process.env.UI_CHECK_BASE_URL ?? 'http://127.0.0.1:3000'
const shotDir = path.join(repo, 'docs/crm-platform/leadgen/evidence')
fs.mkdirSync(shotDir, { recursive: true })

const creds = credentials()
const role = creds.has('superadmin') ? 'superadmin' : creds.has('employee') ? 'employee' : [...creds.keys()][0]
const cred = creds.get(role)
const testEmail = `ui-suppression-${Date.now()}@example.invalid`
const shotBefore = path.join(shotDir, 'suppressions-before.png')
const shotAfter = path.join(shotDir, 'suppressions-after.png')

const snippet = `
const waitFor = async (sel, ms = 20000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await page.evaluate((s) => !!document.querySelector(s), sel)) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}
const waitForText = async (text, ms = 20000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const seen = await page.evaluate((t) => (document.body.innerText || '').includes(t), text)
    if (seen) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
await page.goto(${JSON.stringify(`${BASE}/backend/leadgen/suppressions`)})
await new Promise((r) => setTimeout(r, 3500))
let loggedIn = true
if (await page.evaluate(() => !!document.querySelector('#email'))) {
  const creds = ${JSON.stringify(cred)}
  await page.evaluate((c) => {
    const set = (sel, val) => {
      const el = document.querySelector(sel)
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    set('#email', c.email)
    set('#password', c.password)
  }, creds)
  await page.locator('button[type="submit"]').click()
  loggedIn = await waitFor('[data-testid="sidebar"]', 25000)
}
await page.goto(${JSON.stringify(`${BASE}/backend/leadgen/suppressions`)})
const heading = await waitForText('抑制名单')
const tableReady = await waitFor('table tbody tr')
await page.screenshot({ path: ${JSON.stringify(shotBefore)}, fullPage: true })

// record an address through the form
await page.evaluate((email) => {
  const input = document.querySelector('input[type="email"]')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, email)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}, ${JSON.stringify(testEmail)})
await page.locator('button[type="submit"]').click()
const recorded = await waitForText(${JSON.stringify(testEmail)})
await page.screenshot({ path: ${JSON.stringify(shotAfter)}, fullPage: true })

// release it again (the row whose text contains the address)
const released = await page.evaluate((email) => {
  const rows = Array.from(document.querySelectorAll('table tbody tr'))
  const row = rows.find((r) => (r.innerText || '').includes(email))
  if (!row) return false
  const button = Array.from(row.querySelectorAll('button')).find((b) => (b.innerText || '').includes('解除'))
  if (!button) return false
  button.click()
  return true
}, ${JSON.stringify(testEmail)})
const releaseNoticed = await waitForText(${JSON.stringify(`已解除：${testEmail}`)})
// The release notice itself names the address, so assert the ROW is gone.
const gone = await page.evaluate((email) => !Array.from(document.querySelectorAll('table tbody tr')).some((row) => (row.innerText || '').includes(email)), ${JSON.stringify(testEmail)})

console.log('@@DSH_RESULT@@' + JSON.stringify({
  loggedIn, heading, tableReady, recorded, released, releaseNoticed, gone,
  ok: loggedIn && heading && tableReady && recorded && released && releaseNoticed && gone,
  testEmail: ${JSON.stringify(testEmail)},
}))
`

let parsed = null
try {
  const out = execFileSync('node', [EGO, 'nodejs'], { input: snippet, encoding: 'utf8', timeout: 300000 })
  const line = out.split('\n').find((l) => l.includes('@@DSH_RESULT@@')) ?? ''
  parsed = JSON.parse(line.slice(line.indexOf('@@DSH_RESULT@@') + '@@DSH_RESULT@@'.length))
} catch (error) {
  parsed = { ok: false, error: String(error?.message ?? error).slice(0, 200) }
}

const evidence = {
  probedAt: new Date().toISOString(),
  release: (() => {
    try {
      return JSON.parse(fs.readFileSync('/home/pro/releases/mercato/current/release.json', 'utf8')).sha
    } catch {
      return null
    }
  })(),
  base: BASE,
  role,
  path: '/backend/leadgen/suppressions',
  screenshots: { before: path.relative(repo, shotBefore), after: path.relative(repo, shotAfter) },
  result: parsed,
}
const outDir = path.join(repo, 'docs/crm-platform/leadgen/evidence')
const outFile = path.join(outDir, `suppressions-ui-${evidence.probedAt.replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(outFile, `${JSON.stringify(evidence, null, 1)}\n`)

console.log(`[suppressions-ui] ${parsed?.ok ? 'PASS' : 'FAIL'} — ${JSON.stringify(parsed)}`)
console.log(`[suppressions-ui] evidence=${path.relative(repo, outFile)}`)
process.exit(parsed?.ok ? 0 : 1)
