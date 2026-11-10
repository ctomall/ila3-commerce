#!/usr/bin/env node
/**
 * Real-browser counterexample for the declared-container header check.
 *
 * This is the negative control for `ia-headers.mjs`: it proves the predicate is
 * not vacuously true. It logs in with the protected credential helper, opens the
 * live backend, collects the rendered group-header labels, and requires:
 *
 *   1. the unmodified sidebar PASSES the header check;
 *   2. renaming ONE rendered header label makes that container's check FAIL and
 *      the aggregate FAIL;
 *   3. removing ONE rendered header node makes that container's check FAIL and
 *      the aggregate FAIL;
 *   4. restoring the DOM makes the check PASS again.
 *
 * DOM-only: no server write, no account change, no navigation after load. The
 * browser is always closed in finally. Exit 0 only when all four observations
 * match; 1 when the predicate fails to discriminate; 2 on infrastructure error.
 *
 * Usage:
 *   node scripts/crm-menu-verify/ia-header-negative.mjs \
 *     --base http://127.0.0.1:3000 --role admin --out /tmp/ia-header-negative.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { credentials } from '../lib/session.mjs'
import { checkHeaderLabels, normalizeHeaderLabel } from './ia-headers.mjs'

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}
const BASE = String(arg('--base', process.env.CRM_NAV_BASE_URL ?? 'http://127.0.0.1:3000')).replace(/\/+$/, '')
const ROLE = String(arg('--role', 'admin'))
const OUT = arg('--out', null)

const result = {
  tool: 'ia-header-negative',
  base: BASE,
  role: ROLE,
  generatedAt: new Date().toISOString(),
  baseline: null,
  mutations: [],
  restored: null,
  ok: false,
  exitCode: 2,
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function collectHeaderLabels(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('aside nav [data-sidebar-group="true"]')).map((element) => {
      const button = element.querySelector('button')
      const bodyText = (element.innerText ?? '').replace(/\s+/g, ' ').trim()
      const buttonText = (button?.innerText ?? '').replace(/\s+/g, ' ').trim()
      return buttonText || bodyText.split('\n')[0] || ''
    }),
  )
}

async function runCheck(page, expected, manageLabels) {
  const observed = await collectHeaderLabels(page)
  return checkHeaderLabels({ observedLabels: observed, expected, allowedExtraLabels: manageLabels })
}

let browser
let exitCode = 2
try {
  const creds = credentials()
  const credential = creds.get(ROLE)
  if (!credential) throw new Error(`role ${ROLE} missing from credential file`)

  browser = await chromium.launch({ args: ['--no-sandbox'] })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    baseURL: BASE,
    locale: 'zh-CN',
  })
  try {
    const login = await context.request.post('/api/auth/login', { form: credential })
    if (!login.ok()) throw new Error(`login failed: ${login.status()}`)
    const page = await context.newPage()
    page.setDefaultTimeout(45000)
    await page.goto(`${BASE}/backend/workbench`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForFunction(
      () =>
        Boolean(document.querySelector('[data-testid="backend-chrome-ready"][data-ready="true"]')) &&
        document.querySelectorAll('aside nav [data-sidebar-group="true"]').length > 0,
      undefined,
      { timeout: 45000 },
    )
    await sleep(500)

    const navResponse = await context.request.get('/api/crm_navigation/navigation')
    if (!navResponse.ok()) throw new Error(`catalogue failed: ${navResponse.status()}`)
    const payload = await navResponse.json()
    const crm = payload?.crm
    if (!crm?.groups?.length) throw new Error('catalogue has no groups')
    const expected = crm.groups.map((group) => ({ id: group.id, label: group.label }))
    const manageLabels = (crm.utility ?? []).filter((entry) => entry?.id === 'manage' && entry.label).map((entry) => entry.label)

    const baseline = await runCheck(page, expected, manageLabels)
    result.baseline = { ok: baseline.ok, detail: baseline.aggregate.detail, observed: baseline.observed }
    if (!baseline.ok) {
      result.error = 'baseline header check did not pass before mutation'
      throw new Error(result.error)
    }

    // ---- mutation 1: rename one rendered header label ------------------
    const renameTarget = expected[0]
    const renamed = await page.evaluate(({ expectedId, heading }) => {
      const groups = Array.from(document.querySelectorAll('aside nav [data-sidebar-group="true"]'))
      const group = groups.find((element) => {
        const button = element.querySelector('button')
        const label = (button?.innerText ?? '').replace(/\s+/g, ' ').trim()
        return label === heading
      })
      if (!group) return { found: false }
      const button = group.querySelector('button')
      if (!button) return { found: false }
      window.__iaHeaderMutation = { button, originalText: button.textContent, group, expectedId }
      button.textContent = `${heading}-MUTATED`
      return { found: true, from: heading, to: button.textContent }
    }, { expectedId: renameTarget.id, heading: renameTarget.label })
    if (!renamed.found) throw new Error(`rename target header ${renameTarget.label} not found in DOM`)
    await sleep(150)
    const afterRename = await runCheck(page, expected, manageLabels)
    const renameCheck = afterRename.checks.find((entry) => entry.id === `ia.shell.${renameTarget.id}.header`)
    const renameObservation = {
      name: 'rename-one-header',
      from: renamed.from,
      to: renamed.to,
      expectedCheckId: `ia.shell.${renameTarget.id}.header`,
      aggregateOk: afterRename.ok,
      checkOk: renameCheck?.ok ?? null,
      checkDetail: renameCheck?.detail ?? null,
      aggregateDetail: afterRename.aggregate.detail,
    }
    result.mutations.push(renameObservation)
    await page.evaluate(() => {
      const mutation = window.__iaHeaderMutation
      if (mutation?.button) mutation.button.textContent = mutation.originalText
    })

    // ---- mutation 2: remove one rendered header node -------------------
    const removeTarget = expected[1] ?? expected[0]
    const removed = await page.evaluate(({ heading }) => {
      const groups = Array.from(document.querySelectorAll('aside nav [data-sidebar-group="true"]'))
      const group = groups.find((element) => {
        const button = element.querySelector('button')
        const label = (button?.innerText ?? '').replace(/\s+/g, ' ').trim()
        return label === heading
      })
      if (!group) return { found: false }
      const placeholder = document.createComment('ia-header-negative-removed')
      group.replaceWith(placeholder)
      window.__iaHeaderRemoved = { group, placeholder }
      return { found: true, label: heading }
    }, { heading: removeTarget.label })
    if (!removed.found) throw new Error(`remove target header ${removeTarget.label} not found in DOM`)
    await sleep(150)
    const afterRemove = await runCheck(page, expected, manageLabels)
    const removeCheck = afterRemove.checks.find((entry) => entry.id === `ia.shell.${removeTarget.id}.header`)
    const removeObservation = {
      name: 'remove-one-header',
      removedLabel: removed.label,
      expectedCheckId: `ia.shell.${removeTarget.id}.header`,
      aggregateOk: afterRemove.ok,
      checkOk: removeCheck?.ok ?? null,
      checkDetail: removeCheck?.detail ?? null,
      aggregateDetail: afterRemove.aggregate.detail,
    }
    result.mutations.push(removeObservation)
    await page.evaluate(() => {
      const removedHeader = window.__iaHeaderRemoved
      if (removedHeader?.placeholder && removedHeader?.group) removedHeader.placeholder.replaceWith(removedHeader.group)
    })

    // ---- restored DOM must pass again ---------------------------------
    await sleep(200)
    const restored = await runCheck(page, expected, manageLabels)
    result.restored = { ok: restored.ok, detail: restored.aggregate.detail, observed: restored.observed }

    const renameDetected = afterRename.ok === false && renameCheck?.ok === false
    const removeDetected = afterRemove.ok === false && removeCheck?.ok === false
    result.checks = { baseline: baseline.ok, renameDetected, removeDetected, restored: restored.ok }
    result.ok = baseline.ok && renameDetected && removeDetected && restored.ok
    exitCode = result.ok ? 0 : 1
  } finally {
    await context.close().catch(() => {})
  }
} catch (error) {
  result.error = error instanceof Error ? error.message.slice(0, 500) : String(error)
  exitCode = 2
} finally {
  if (browser) await browser.close().catch(() => {})
}

result.exitCode = exitCode
if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1))
}
console.log(JSON.stringify(result, null, 1))
process.exit(exitCode)
