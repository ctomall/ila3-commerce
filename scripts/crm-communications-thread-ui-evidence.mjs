#!/usr/bin/env node
/**
 * Thread-level UI evidence for the communications workbench (design rev2 F2/F3/F4).
 *
 * Runs against an isolated instance seeded through the hub's own test-seed API
 * (a shared channel + one inbound conversation), logs in as the real employee,
 * and captures: the inbox list, the thread with customer messages, an internal
 * note written through the panel, and a reply sent through the composer.
 *
 * This is the populated-state acceptance the production tenant cannot give while
 * it has zero connected channels. Nothing here talks to production.
 *
 * Usage:
 *   node scripts/crm-communications-thread-ui-evidence.mjs \
 *     --base http://127.0.0.1:3100 --label seeded \
 *     --out docs/crm-platform/verify/communications-thread-ui-<stamp>
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { chromium } from 'playwright'

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}
const BASE = String(arg('--base', 'http://127.0.0.1:3100')).replace(/\/+$/, '')
const LABEL = String(arg('--label', 'seeded'))
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = path.resolve(arg('--out', path.join('docs/crm-platform/verify', `communications-thread-ui-${STAMP}`)))
const CREDS_PATH = '/home/pro/.ila3-admin-credentials'
const ROLE = String(arg('--role', 'employee'))
const MODE = String(arg('--mode', 'capture'))
const NOTE_TEXT = '客户要求周五前送达；已答应今天给出物流单号。'
const REPLY_TEXT = '已收到，我这边查一下物流，今天下班前把单号发给你。'

fs.mkdirSync(OUT, { recursive: true })
const failures = []
const report = { generatedAt: new Date().toISOString(), base: BASE, label: LABEL, role: ROLE, steps: {}, screenshots: [], checks: [], failures }
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

function credentials(role) {
  const map = new Map()
  for (const line of fs.readFileSync(CREDS_PATH, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    const [name, email, password] = line.trim().split(/\s+/)
    if (name && email && password) map.set(name, { email, password })
  }
  const cred = map.get(role)
  if (!cred) throw new Error(`no credential for role ${role}`)
  return cred
}

function check(name, ok, detail = '') {
  report.checks.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

async function shot(page, name, fullPage = false) {
  const file = path.join(OUT, `${LABEL}-${name}.png`)
  await page.screenshot({ path: file, fullPage, animations: 'disabled' })
  report.screenshots.push({ name, path: file, sha256: sha256(file), bytes: fs.statSync(file).size })
  return file
}

async function textOf(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')
    return (main?.innerText ?? '').replace(/\s+/g, ' ').trim()
  })
}

async function waitText(page, text, timeout = 20000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const seen = await page.evaluate((t) => (document.body.innerText || '').includes(t), text).catch(() => false)
    if (seen) return true
    await page.waitForTimeout(250)
  }
  return false
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext({
  locale: 'zh-CN',
  viewport: { width: 1440, height: 1000 },
  baseURL: BASE,
  extraHTTPHeaders: { 'Accept-Language': 'zh-CN,zh;q=0.9' },
})
const page = await context.newPage()

try {
  const login = await context.request.post('/api/auth/login', { form: credentials(ROLE) })
  report.steps.login = { status: login.status() }
  check('employee login succeeds', login.ok(), `status ${login.status()}`)

  const threadsRes = await context.request.get('/api/communications/me/threads')
  const threads = await threadsRes.json().catch(() => ({}))
  const thread = threads.items?.[0] ?? null
  report.steps.threads = { status: threadsRes.status(), total: threads.total ?? null, first: thread }
  check('seeded conversation is listable', Boolean(thread?.id), `total=${threads.total} id=${thread?.id}`)

  await page.goto(`${BASE}/backend/communications/inbox`)
  const listReady = await page.waitForFunction(
    (id) => Array.from(document.querySelectorAll('a[href*="/backend/communications/inbox/"]')).some((a) => a.getAttribute('href').includes(id)),
    thread?.id ?? '',
    { timeout: 30000 },
  ).then(() => true).catch(() => false)
  report.steps.inboxText = (await textOf(page)).slice(0, 500)
  check('inbox lists the conversation', listReady)
  await shot(page, 'inbox-list')

  await page.goto(`${BASE}/backend/communications/inbox/${thread.id}`)
  if (MODE === 'echo') {
    const echoed = await waitText(page, REPLY_TEXT, 20000)
    await page.evaluate(() => {
      const scrollables = Array.from(document.querySelectorAll('main div'))
        .filter((el) => el.scrollHeight > el.clientHeight + 40 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowY))
        .sort((a, b) => b.scrollHeight - a.scrollHeight)
      scrollables[0]?.scrollTo({ top: scrollables[0].scrollHeight })
    })
    await page.waitForTimeout(500)
    report.steps.echo = { rendered: echoed }
    check('provider echo renders as an outbound bubble', echoed)
    await shot(page, 'thread-with-echo', true)
    throw new Error('__echo_done__')
  }
  const bodySeen = await waitText(page, 'A-1042', 20000)
  await page.waitForTimeout(600)
  report.steps.threadText = (await textOf(page)).slice(0, 900)
  check('thread shows the customer message body', bodySeen)
  await shot(page, 'thread', true)

  // internal note through the panel (panel is server-gated by the reply grant)
  const noteArea = page.locator('textarea[aria-label="内部备注内容"]')
  await noteArea.fill(NOTE_TEXT)
  const noteButton = page.locator('section[aria-label="内部备注"] form button[type="submit"]')
  const noteClicked = await noteButton.click({ timeout: 10000 }).then(() => true).catch(() => false)
  const noteSaved = noteClicked && await waitText(page, '已答应今天给出物流单号', 20000)
  await page.waitForTimeout(400)
  report.steps.note = { filled: true, clicked: noteClicked, saved: noteSaved }
  check('internal note is saved and rendered', noteSaved)
  await shot(page, 'internal-note', true)

  // reply through the composer: Playwright fill/click drives the real React form,
  // and the send response is captured so a silent no-op cannot pass as success.
  const replyArea = page.locator('textarea[aria-label="回复内容"]')
  await replyArea.fill(REPLY_TEXT)
  const sendResponse = page.waitForResponse(
    (r) => r.url().includes('/api/communications/me/send') && r.request().method() === 'POST',
    { timeout: 25000 },
  ).catch(() => null)
  const replyClicked = await page.locator('form:has(textarea[aria-label="回复内容"]) button[type="submit"]')
    .click({ timeout: 10000 }).then(() => true).catch(() => false)
  const response = await sendResponse
  const sendStatus = response ? response.status() : null
  const sendBody = response ? (await response.text().catch(() => '')).slice(0, 400) : ''
  // The stub provider does not echo the sent message back, so an outbound bubble
  // only appears after the provider echo is recorded — the `--mode echo` pass
  // proves that leg. Here the send itself must be accepted.
  await page.waitForTimeout(1200)
  report.steps.reply = { clicked: replyClicked, sendStatus, sendBody }
  report.steps.replyText = (await textOf(page)).slice(0, 1600)
  check('reply send reaches the API', sendStatus !== null && sendStatus < 400, `status=${sendStatus}`)
  await shot(page, 'reply-sent', true)

  const channels = await context.request.get('/api/communications/me/channels')
  const channelBody = await channels.json().catch(() => ({}))
  report.steps.channels = { status: channels.status(), items: (channelBody.items ?? []).length }
  check('seeded channels are visible to the employee', channels.status() === 200 && (channelBody.items ?? []).length >= 1,
    `status=${channels.status()} items=${(channelBody.items ?? []).length}`)
} catch (error) {
  if (String(error?.message ?? '') !== '__echo_done__') {
    failures.push(`run: ${String(error?.message ?? error).slice(0, 300)}`)
  }
} finally {
  await browser.close()
  report.failures = failures
  report.ok = failures.length === 0
  fs.writeFileSync(path.join(OUT, 'evidence.json'), JSON.stringify(report, null, 2))
  console.log(`\nEvidence: ${path.join(OUT, 'evidence.json')}`)
  console.log(`Screenshots: ${report.screenshots.length}`)
}
process.exit(report.ok ? 0 : 1)
