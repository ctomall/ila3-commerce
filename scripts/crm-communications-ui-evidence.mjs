#!/usr/bin/env node
/**
 * UI evidence for the communications workbench (P0 slices S85–S99) on a running
 * release: it logs in as the real superadmin and employee accounts and captures
 * the four authored surfaces plus the server-side feature gate of each API they
 * call. Screenshots and a JSON report land in the output directory.
 *
 * This is evidence capture, not a screenshot tour: every page must have rendered
 * its own content (heading or explicit empty state) before a shot is taken, and
 * the page's own diagnostics (page errors, console errors, 5xx) are recorded.
 *
 * Credentials come from ~/.ila3-admin-credentials (0600) and are never printed,
 * never written to the report.
 *
 * Usage:
 *   node scripts/crm-communications-ui-evidence.mjs \
 *     --base http://127.0.0.1:3000 \
 *     --out  docs/crm-platform/verify/communications-ui-<stamp> \
 *     --label prod
 *
 * Exit code 1 when a page fails to render or a recorded assertion fails.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { chromium } from 'playwright'

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}
const BASE = String(arg('--base', process.env.CRM_UI_BASE_URL ?? 'http://127.0.0.1:3000')).replace(/\/+$/, '')
const LABEL = String(arg('--label', 'prod'))
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = path.resolve(arg('--out', path.join('docs/crm-platform/verify', `communications-ui-${STAMP}`)))
const ROLES = String(arg('--roles', 'superadmin,employee')).split(',').map((r) => r.trim()).filter(Boolean)
const EXPECT_CONNECT_CTA = String(arg('--expect-connect-cta', 'any'))
const CREDS_PATH = '/home/pro/.ila3-admin-credentials'
const RELEASE_JSON = '/home/pro/releases/mercato/current/release.json'

fs.mkdirSync(OUT, { recursive: true })

const PAGES = [
  { name: 'channels', path: '/backend/communications/channels' },
  { name: 'channels-connect', path: '/backend/communications/channels/connect' },
  { name: 'inbox', path: '/backend/communications/inbox' },
  { name: 'exceptions', path: '/backend/communications/exceptions' },
]

const APIS = [
  { name: 'channels', path: '/api/communications/me/channels' },
  { name: 'threads', path: '/api/communications/me/threads' },
  { name: 'reconciliation', path: '/api/communications/me/reconciliation' },
  { name: 'dead-letters', path: '/api/communications/me/dead-letters' },
]

function credentials() {
  const map = new Map()
  if (!fs.existsSync(CREDS_PATH)) throw new Error(`missing credential file: ${CREDS_PATH}`)
  for (const line of fs.readFileSync(CREDS_PATH, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    const [role, email, password] = line.trim().split(/\s+/)
    if (role && email && password) map.set(role, { email, password })
  }
  return map
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  label: LABEL,
  release: (() => {
    try { return JSON.parse(fs.readFileSync(RELEASE_JSON, 'utf8')) } catch { return null }
  })(),
  roles: {},
  failures,
}

function fail(role, message) {
  failures.push(`${role}: ${message}`)
  console.log(`FAIL  [${role}] ${message}`)
}

async function login(context, credential) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await context.request.post('/api/auth/login', { form: credential })
    if (res.ok()) return { ok: true, status: res.status(), attempts: attempt }
    if (res.status() === 429 && attempt < 3) { await sleep(25000); continue }
    return { ok: false, status: res.status(), attempts: attempt }
  }
  return { ok: false, status: 0, attempts: 3 }
}

function attachDiagnostics(page) {
  const d = { pageErrors: [], consoleErrors: [], serverErrors: [], failedRequests: [] }
  page.on('pageerror', (e) => d.pageErrors.push(String(e.message).slice(0, 300)))
  page.on('console', (m) => { if (m.type() === 'error') d.consoleErrors.push(m.text().slice(0, 300)) })
  page.on('response', (r) => {
    if (r.status() >= 500 && r.url().startsWith(BASE)) d.serverErrors.push({ url: r.url(), status: r.status() })
  })
  page.on('requestfailed', (r) => {
    const reason = r.failure()?.errorText ?? ''
    if (reason.includes('ERR_ABORTED') || !r.url().startsWith(BASE)) return
    d.failedRequests.push({ url: r.url(), reason })
  })
  return d
}

async function surface(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')
    const text = (main?.innerText ?? '').replace(/\s+/g, ' ').trim()
    const controls = Array.from(document.querySelectorAll('main button, main a[href], main [role="button"]'))
      .map((el) => (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    return {
      url: location.href,
      pathname: location.pathname,
      title: document.title,
      heading: (document.querySelector('main h1, main h2')?.textContent ?? '').trim(),
      mainText: text.slice(0, 600),
      mainTextLength: text.length,
      rows: document.querySelectorAll('tbody tr').length,
      controls: [...new Set(controls)].slice(0, 40),
      connectCta: controls.includes('连接渠道'),
      denied: /无权限|没有权限|无访问权限|Access Denied|403|forbidden|Forbidden/.test(text),
      loading: /正在加载|Loading/.test(text),
    }
  })
}

async function gotoReady(page, url, timeout = 45000) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
    await page.waitForFunction(() => {
      const main = document.querySelector('main')
      const text = (main?.innerText ?? '').trim()
      if (text.length < 20) return false
      return !/正在加载表格|正在加载|加载中|Loading table|Loading/.test(text)
    }, undefined, { timeout })
    await page.waitForTimeout(300)
    return { ok: true, ...(await surface(page)) }
  } catch (error) {
    const state = await surface(page).catch(() => ({ url, pathname: '', mainTextLength: 0, mainText: '' }))
    return { ok: false, error: String(error.message || error).split('\n')[0].slice(0, 200), ...state }
  }
}

async function shot(page, role, name) {
  const file = path.join(OUT, `${LABEL}-${role}-${name}.png`)
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled' })
  return { path: file, sha256: sha256(file), bytes: fs.statSync(file).size }
}

const creds = credentials()
const browser = await chromium.launch({ args: ['--no-sandbox'] })

try {
  for (const role of ROLES) {
    const credential = creds.get(role)
    const roleReport = { role, login: null, apis: {}, pages: {}, screenshots: [], diagnostics: null, checks: [] }
    report.roles[role] = roleReport
    if (!credential) { fail(role, 'no credential entry'); continue }

    const context = await browser.newContext({
      locale: 'zh-CN',
      viewport: { width: 1440, height: 900 },
      baseURL: BASE,
      extraHTTPHeaders: { 'Accept-Language': 'zh-CN,zh;q=0.9' },
    })
    const page = await context.newPage()
    const diagnostics = attachDiagnostics(page)
    roleReport.diagnostics = diagnostics

    const loginResult = await login(context, credential)
    roleReport.login = loginResult
    if (!loginResult.ok) { fail(role, `login failed (status ${loginResult.status})`); await context.close(); continue }
    console.log(`PASS  [${role}] login (status ${loginResult.status})`)

    // Server-side feature gate of every API the authored surfaces call.
    for (const api of APIS) {
      const res = await context.request.get(api.path)
      let body = ''
      try { body = (await res.text()).slice(0, 400) } catch { /* ignore */ }
      roleReport.apis[api.name] = { status: res.status(), body }
      console.log(`  [${role}] API ${api.name} -> ${res.status()}`)
    }

    for (const spec of PAGES) {
      const state = await gotoReady(page, `${BASE}${spec.path}`)
      const shotInfo = await shot(page, role, spec.name)
      roleReport.screenshots.push({ name: spec.name, ...shotInfo })
      roleReport.pages[spec.name] = { ...state, screenshot: shotInfo.path }
      console.log(`  [${role}] page ${spec.name} -> ${state.ok ? 'rendered' : 'NOT RENDERED'} (${state.mainTextLength} chars${state.heading ? `, h="${state.heading}"` : ''})`)
      if (!state.ok) fail(role, `page ${spec.name} did not render: ${state.error ?? 'unknown'}`)
      if (state.denied && !/connect|exceptions/.test(spec.name)) fail(role, `page ${spec.name} rendered a denial`)
    }

    // Assertion set is recorded as data, not hidden: it is evaluated below once
    // both roles' observations are in, so the two roles can be compared.
    await context.close()
  }
} finally {
  await browser.close()
}

// Cross-role assertions: the same page must differ exactly where the ACL differs.
const superPages = report.roles.superadmin?.pages ?? {}
const employeePages = report.roles.employee?.pages ?? {}
const superApis = report.roles.superadmin?.apis ?? {}
const employeeApis = report.roles.employee?.apis ?? {}

const assertions = []
const assert = (name, ok, detail) => {
  assertions.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

assert('inbox renders for both roles', superPages.inbox?.ok && employeePages.inbox?.ok,
  `superadmin=${superPages.inbox?.ok} employee=${employeePages.inbox?.ok}`)
assert('channels list renders for both roles', superPages.channels?.ok && employeePages.channels?.ok,
  `superadmin=${superPages.channels?.ok} employee=${employeePages.channels?.ok}`)
assert('employee is denied the tenant connect wizard',
  Boolean(employeePages['channels-connect']?.denied) || employeePages['channels-connect']?.ok === false,
  `denied=${employeePages['channels-connect']?.denied} rendered=${employeePages['channels-connect']?.ok}`)
assert('employee is denied the exceptions console (manage)',
  Boolean(employeePages.exceptions?.denied) || employeePages.exceptions?.ok === false,
  `denied=${employeePages.exceptions?.denied} rendered=${employeePages.exceptions?.ok}`)
assert('threads API is readable for both roles (view)',
  superApis.threads?.status === 200 && employeeApis.threads?.status === 200,
  `superadmin=${superApis.threads?.status} employee=${employeeApis.threads?.status}`)
assert('dead-letters API is manage-only',
  superApis['dead-letters']?.status === 200 && employeeApis['dead-letters']?.status === 403,
  `superadmin=${superApis['dead-letters']?.status} employee=${employeeApis['dead-letters']?.status}`)

// Connect-entry assertion (the S106 defect): the wizard is gated by
// communication_channels.connect_tenant_channel, so a caller without it must
// not be offered the link. `shown` documents the pre-fix deployment.
if (EXPECT_CONNECT_CTA !== 'any') {
  const adm = superPages.channels?.connectCta
  const empChannels = employeePages.channels?.connectCta
  const empInbox = employeePages.inbox?.connectCta
  if (EXPECT_CONNECT_CTA === 'hidden') {
    assert('superadmin still sees the connect entry', adm === true, `channels.connectCta=${adm}`)
    assert('employee sees no connect entry on the channel list', empChannels === false, `channels.connectCta=${empChannels}`)
    assert('employee sees no connect entry in the inbox', empInbox === false, `inbox.connectCta=${empInbox}`)
  } else {
    assert('deployed build still offers the connect entry to both roles', adm === true && empChannels === true && empInbox === true,
      `superadmin.channels=${adm} employee.channels=${empChannels} employee.inbox=${empInbox}`)
  }
}

report.assertions = assertions
report.failures = failures
report.ok = failures.length === 0
fs.writeFileSync(path.join(OUT, 'evidence.json'), JSON.stringify(report, null, 2))
fs.writeFileSync(path.join(OUT, 'SUMMARY.md'), renderSummary(report))

console.log(`\nEvidence: ${path.join(OUT, 'evidence.json')}`)
console.log(`Screenshots: ${report.roles ? Object.values(report.roles).reduce((n, r) => n + (r.screenshots?.length ?? 0), 0) : 0}`)
process.exit(report.ok ? 0 : 1)

function renderSummary(data) {
  const lines = [`# Communications UI evidence (${data.label})`, '', `- base: ${data.base}`, `- release: ${data.release?.sha ?? 'unknown'}`, `- at: ${data.generatedAt}`, '']
  lines.push('| role | page | rendered | heading | main text | screenshot |', '| --- | --- | --- | --- | --- | --- |')
  for (const [role, r] of Object.entries(data.roles)) {
    for (const spec of PAGES) {
      const p = r.pages[spec.name]
      lines.push(`| ${role} | ${spec.name} | ${p?.ok ? 'yes' : 'no'} | ${(p?.heading ?? '').replace(/\|/g, '/')} | ${(p?.mainText ?? '').slice(0, 80).replace(/\|/g, '/')} | ${path.basename(p?.screenshot ?? '')} |`)
    }
  }
  lines.push('', '## Assertions', '')
  for (const a of data.assertions ?? []) lines.push(`- ${a.ok ? 'PASS' : 'FAIL'} ${a.name}${a.detail ? ` — ${a.detail}` : ''}`)
  return lines.join('\n') + '\n'
}
