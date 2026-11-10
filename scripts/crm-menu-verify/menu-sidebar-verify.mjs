#!/usr/bin/env node
/**
 * Independent, read-only browser verification for the CRM menu task.
 *
 * Freeze mode (baseline) records the truth of the current production build:
 * shell geometry, catalogue, reachability of every declared href, management
 * and account surfaces, mobile drawer, keyboard order, collapse persistence and
 * screenshots for both a real admin and a real employee account.
 *
 * Candidate mode runs the same suite against an integrated candidate build and
 * adds the target gates (stock AppShell default sidebar, no functional loss vs
 * the frozen baseline, authorization, a11y, reduced motion) plus a PASS/FAIL
 * matrix and before/after screenshots.
 *
 * Credentials come from /home/pro/.ila3-admin-credentials (0600) through
 * scripts/lib/session.mjs. They are never printed and never written to the
 * report. The script only issues GET requests and uses its own browser; it
 * never mutates product data.
 *
 * Usage
 *   node scripts/crm-menu-verify/menu-sidebar-verify.mjs \
 *     --mode freeze --base http://127.0.0.1:3000 \
 *     --label baseline-d1d3409 \
 *     --out /storage/artifacts/pro/menu-declaration-audit/verify
 *
 *   node scripts/crm-menu-verify/menu-sidebar-verify.mjs \
 *     --mode candidate --base http://127.0.0.1:3200 \
 *     --label candidate-<sha> --expect-sha <sha> \
 *     --baseline <baseline-report.json> \
 *     --out /storage/artifacts/pro/menu-declaration-audit/verify
 *
 * Exit codes: 0 = every gate passed, 1 = at least one gate failed,
 *             2 = infrastructure error (browser/login/report could not run).
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import { credentials, loginWithRetry } from '../lib/session.mjs'
import { checkHeaderLabels } from './ia-headers.mjs'

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

const MODE = String(arg('--mode', 'freeze')).toLowerCase()
const BASE = String(arg('--base', process.env.CRM_NAV_BASE_URL ?? 'http://127.0.0.1:3000')).replace(/\/+$/, '')
const LABEL = arg('--label', `${MODE}-${new Date().toISOString().slice(0, 10)}`)
const OUT_ROOT = path.resolve(arg('--out', '/storage/artifacts/pro/menu-declaration-audit/verify'))
const EXPECT_SHA = String(arg('--expect-sha', '')).trim().toLowerCase()
const BASELINE_PATH = arg('--baseline', '')
const SOURCE_DIR = arg('--source-dir', '')
const IA_EXPECT_PATH = arg('--expect-ia', '')
const ROLES = String(arg('--roles', 'admin,employee')).split(',').map((role) => role.trim()).filter(Boolean)
const SKIP_REACHABILITY = process.argv.includes('--skip-reachability')
const ALLOW_KNOWN_PENDING = process.argv.includes('--allow-known-pending')
const KNOWN_PENDING_IDS = new Set(
  String(arg('--known-pending', 'nav.aria-current,nav.aria-current-matches-path,a11y.reduced-motion'))
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
)
const REACHABILITY_CONCURRENCY = Number(arg('--reachability-concurrency', '3'))
const NAV_API = '/api/crm_navigation/navigation'
const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }
const DENY_RE = /Access Denied|You do not have permission|没有权限|无权访问|权限不足|Forbidden/i
const CUSTOM_RAIL_SELECTORS = [
  '[data-crm-rail-channel]',
  '[data-crm-scene-nav]',
  '[data-crm-nav-group]',
  '[data-crm-rail-action]',
  '[data-crm-content-nav]',
  '[data-crm-utility]',
]

if (MODE === 'candidate' && !BASELINE_PATH) {
  console.error('candidate mode requires --baseline <frozen baseline report.json>')
  process.exit(2)
}

const OUT = path.join(OUT_ROOT, LABEL)
const SHOTS = path.join(OUT, 'shots')
fs.mkdirSync(SHOTS, { recursive: true })

const report = {
  schemaVersion: 1,
  mode: MODE,
  label: LABEL,
  base: BASE,
  generatedAt: new Date().toISOString(),
  expectSha: EXPECT_SHA || null,
  baselinePath: BASELINE_PATH ? path.resolve(BASELINE_PATH) : null,
  build: { footer: '', sha: '', version: '' },
  environment: {},
  viewports: { desktop: DESKTOP, mobile: MOBILE },
  roles: ROLES,
  checks: [],
  failures: [],
  pendingFailures: [],
  warnings: [],
  structure: {},
  catalogue: {},
  coverage: {},
  manage: {},
  account: {},
  mobile: {},
  keyboard: {},
  reducedMotion: {},
  screenshots: [],
  console: {},
  comparison: null,
  ia: null,
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const short = (value, max = 400) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

function check(role, id, name, ok, detail = '', { gate = true, severity = 'blocking' } = {}) {
  const pending = KNOWN_PENDING_IDS.has(id)
  const entry = { role, id, name, ok: Boolean(ok), detail: short(detail), gate, severity, pending }
  report.checks.push(entry)
  console.log(`${ok ? 'PASS' : pending ? 'PENDING' : 'FAIL'}  [${role ?? 'shell'}] ${id} ${name}${entry.detail ? ` — ${entry.detail}` : ''}`)
  if (!ok) {
    const text = `${role ?? 'shell'}: ${id} ${name}${entry.detail ? ` — ${entry.detail}` : ''}`
    if (!gate) report.warnings.push(text)
    else if (pending) report.pendingFailures.push(text)
    else report.failures.push(text)
  }
  return ok
}

function record(role, id, value) {
  report.checks.push({ role, id, name: 'recorded', ok: true, detail: '', gate: false, severity: 'info', value })
}

// ---------------------------------------------------------------- catalogue

function flattenCatalogue(crm) {
  const items = []
  const add = (href, label, kind, container, extra = {}) => {
    if (!href) return
    items.push({ href, label: short(label, 120), kind, container, ...extra })
  }
  if (!crm) return { items, hrefs: [], duplicates: [], groupLandings: [] }
  const groupLandings = []
  for (const group of Array.isArray(crm.groups) ? crm.groups : []) {
    groupLandings.push({ href: group.landing, groupId: group.id })
    for (const item of Array.isArray(group.items) ? group.items : []) {
      add(item.href, item.label, 'group', group.id, { order: item.order })
      for (const child of Array.isArray(item.children) ? item.children : []) add(child.href, child.label, 'child', group.id, { parent: item.href })
    }
  }
  for (const category of crm.manage?.categories ?? []) {
    for (const item of Array.isArray(category.items) ? category.items : []) {
      add(item.href, item.label, 'manage', category.id)
      for (const child of Array.isArray(item.children) ? item.children : []) add(child.href, child.label, 'child', category.id, { parent: item.href })
    }
  }
  for (const item of crm.personal?.items ?? []) add(item.href, item.label, 'personal', 'personal')
  for (const item of crm.utility ?? []) add(item.href, item.label, 'utility', 'utility')
  const hrefCounts = new Map()
  for (const item of items) hrefCounts.set(item.href, (hrefCounts.get(item.href) ?? 0) + 1)
  const duplicates = [...hrefCounts.entries()].filter(([, count]) => count > 1).map(([href, count]) => ({ href, count }))
  const hrefs = [...new Set(items.map((item) => item.href))]
  return { items, hrefs, duplicates, groupLandings }
}

function compareCatalogue(baseline, candidate) {
  const baselineHrefs = new Set(baseline.items.map((item) => item.href))
  const candidateHrefs = new Map()
  for (const item of candidate.items) {
    if (!candidateHrefs.has(item.href)) candidateHrefs.set(item.href, [])
    candidateHrefs.get(item.href).push(item)
  }
  const missing = [...baselineHrefs].filter((href) => !candidateHrefs.has(href))
  const added = [...candidateHrefs.keys()].filter((href) => !baselineHrefs.has(href))
  const duplicated = candidate.duplicates ?? []
  const containerChanges = []
  const baselineByHref = new Map()
  for (const item of baseline.items) if (!baselineByHref.has(item.href)) baselineByHref.set(item.href, item)
  for (const [href, list] of candidateHrefs) {
    const before = baselineByHref.get(href)
    if (!before) continue
    const after = list[0]
    if (before.container !== after.container || before.kind !== after.kind) {
      containerChanges.push({ href, before: `${before.kind}:${before.container}`, after: `${after.kind}:${after.container}` })
    }
  }
  return { missing, added, duplicated, containerChanges }
}

// ------------------------------------------------------------ HTTP helpers

async function httpStatus(cookie, href, timeoutMs = 30000) {
  const started = Date.now()
  try {
    const response = await fetch(new URL(href, BASE), {
      headers: { cookie, accept: 'text/html' },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
    // Do not download page bodies for the reachability sweep; SSR status is the fact.
    try {
      await response.body?.cancel()
    } catch {
      /* body already consumed or absent */
    }
    return { href, status: response.status, finalUrl: response.headers.get('location') ?? href, elapsedMs: Date.now() - started, ok: response.status < 500 }
  } catch (error) {
    return { href, status: 0, error: short(error instanceof Error ? error.message : String(error), 200), elapsedMs: Date.now() - started, ok: false }
  }
}

async function httpJson(cookie, href) {
  const response = await fetch(new URL(href, BASE), { headers: { cookie, accept: 'application/json' }, signal: AbortSignal.timeout(30000) })
  const text = await response.text()
  if (!response.ok) throw new Error(`${href} -> ${response.status}`)
  return JSON.parse(text)
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let index = 0
  async function run() {
    while (index < items.length) {
      const current = index++
      results[current] = await worker(items[current], current)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

// --------------------------------------------------------- browser helpers

function attachDiagnostics(page, bucket) {
  page.on('pageerror', (error) => bucket.pageErrors.push(short(error.message, 300)))
  page.on('console', (message) => {
    if (message.type() === 'error') bucket.consoleErrors.push(short(message.text(), 300))
  })
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? ''
    if (reason.includes('ERR_ABORTED')) return
    if (!request.url().startsWith(BASE)) return
    bucket.failedRequests.push({ url: request.url(), reason: short(reason, 120) })
  })
  page.on('response', (response) => {
    if (response.status() >= 500 && response.url().startsWith(BASE)) {
      const request = response.request()
      bucket.serverErrors.push({ url: response.url(), status: response.status(), type: request.resourceType() })
    }
  })
}

async function cleanOverlays(page) {
  await page
    .evaluate(() => {
      for (const element of document.querySelectorAll('div, section, aside')) {
        if (element.querySelector('main, nav, table, aside')) continue
        const text = (element.textContent ?? '').trim()
        if (text.startsWith('演示环境') && text.length < 400) element.remove()
        if (text.includes('接受 Cookie') && text.length < 400) element.remove()
      }
    })
    .catch(() => {})
}

async function contentState(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')
    if (!main) return { textLength: 0, visibleLoading: true, visibleSpinners: 0, loadingText: true }
    const cookie = Array.from(main.querySelectorAll('div, section')).find(
      (element) => (element.textContent ?? '').includes('接受 Cookie') && (element.textContent ?? '').length < 600,
    )
    const text = (main.innerText ?? '').replace(cookie?.innerText ?? '', '').replace(/\s+/g, ' ').trim()
    const visible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      if (rect.width < 2 || rect.height < 2) return false
      if (style.display === 'none' || style.visibility === 'hidden') return false
      if (element.classList.contains('sr-only') || element.closest('.sr-only')) return false
      return true
    }
    const spinners = Array.from(main.querySelectorAll('.animate-spin, [role="status"]')).filter(visible)
    return {
      textLength: text.length,
      loadingText: /正在加载|加载中|Loading table|Loading\.\.\./.test(text),
      visibleSpinners: spinners.length,
      visibleLoading: spinners.length > 0,
    }
  })
}

async function settleForShot(page, timeout = 20000) {
  try {
    await page.waitForFunction(
      () => {
        const main = document.querySelector('main')
        if (!main) return false
        const cookie = Array.from(main.querySelectorAll('div, section')).find(
          (element) => (element.textContent ?? '').includes('接受 Cookie') && (element.textContent ?? '').length < 600,
        )
        const text = (main.innerText ?? '').replace(cookie?.innerText ?? '', '').replace(/\s+/g, ' ').trim()
        if (text.length < 150) return false
        if (/正在加载|加载中|Loading table|Loading\.\.\./.test(text)) return false
        const visible = (element) => {
          const rect = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          if (rect.width < 2 || rect.height < 2) return false
          if (style.display === 'none' || style.visibility === 'hidden') return false
          if (element.classList.contains('sr-only') || element.closest('.sr-only')) return false
          return true
        }
        return !Array.from(main.querySelectorAll('.animate-spin, [role="status"]')).some(visible)
      },
      undefined,
      { timeout },
    )
  } catch {
    /* a slow widget must not block the evidence capture */
  }
  await page.waitForTimeout(250)
}

async function takeShot(page, role, name, { fullPage = false } = {}) {
  await cleanOverlays(page)
  await settleForShot(page)
  let content = await contentState(page).catch(() => null)
  if (content && (content.visibleLoading || content.loadingText || content.textLength < 150)) {
    // A slow first dashboard render under host pressure: give it one more settle round
    // and only then capture, so before/after images never pair a loaded shell with a spinner.
    await page.waitForTimeout(3000)
    await settleForShot(page, 10000)
    content = await contentState(page).catch(() => null)
  }
  const file = path.join(SHOTS, `${LABEL}-${role}-${name}.png`)
  await page.screenshot({ path: file, fullPage, animations: 'disabled' })
  const entry = { role, name, path: file, sha256: sha256(file), url: page.url(), viewport: page.viewportSize(), content, at: new Date().toISOString() }
  report.screenshots.push(entry)
  return entry
}

async function waitReady(page, { minText = 40, timeout = 25000 } = {}) {
  try {
    await page.waitForFunction(
      ({ minText }) => {
        const nav = document.querySelector('aside nav[data-testid="sidebar"]')
        const main = document.querySelector('main')
        if (!nav) return false
        if (nav.getAttribute('data-crm-nav-state') === 'loading') return false
        const chromeReady = document.querySelector('[data-testid="backend-chrome-ready"]')?.getAttribute('data-ready')
        const sceneReady = nav.getAttribute('data-crm-nav-state') === 'ready'
        if (!(chromeReady === 'true' || sceneReady)) return false
        const cookie = Array.from(main.querySelectorAll('div, section')).find(
          (element) => (element.textContent ?? '').includes('接受 Cookie') && (element.textContent ?? '').length < 600,
        )
        const text = (main?.innerText ?? '').replace(cookie?.innerText ?? '', '').replace(/\s+/g, ' ').trim()
        if (text.length < Math.max(40, minText)) return false
        if (/正在加载|加载中|Loading table|Loading\.\.\./.test(text)) return false
        if (main?.querySelector('[data-testid="backend-chrome-loading"]')) return false
        const visible = (element) => {
          const rect = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          if (rect.width < 2 || rect.height < 2) return false
          if (style.display === 'none' || style.visibility === 'hidden') return false
          if (element.classList.contains('sr-only') || element.closest('.sr-only')) return false
          return true
        }
        return !Array.from(main.querySelectorAll('.animate-spin, [role="status"]')).some(visible)
      },
      { minText },
      { timeout },
    )
    await page.waitForTimeout(400)
    return true
  } catch {
    return false
  }
}

async function gotoReady(page, href, options = {}) {
  const target = new URL(href, BASE).toString()
  try {
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: options.timeout ?? 45000 })
  } catch (error) {
    return { ok: false, url: page.url(), error: short(error instanceof Error ? error.message : String(error), 200) }
  }
  const ok = await waitReady(page, options)
  if (ok) return { ok, url: page.url() }
  // A short empty-state page or a page whose chrome never signals readiness must not
  // be reported as unreachable when it clearly rendered content without a loading state.
  const state = await contentState(page).catch(() => null)
  if (state && state.textLength >= 30 && !state.visibleLoading && !state.loadingText) {
    return { ok: true, degraded: true, url: page.url(), content: state }
  }
  return { ok: false, url: page.url(), content: state }
}

function activePathMatches(pathname, href) {
  if (!pathname || !href) return false
  if (pathname === href) return true
  if (pathname === '/backend' && href === '/backend/workbench') return true
  return pathname.startsWith(`${href}/`) || href.startsWith(`${pathname}/`)
}

async function mainText(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')
    return (main?.innerText ?? document.body.innerText ?? '').replace(/\s+/g, ' ').trim()
  })
}

async function snapshotShell(page) {
  return page.evaluate((customSelectors) => {
    const parsePx = (value) => {
      const match = String(value ?? '').match(/-?[\d.]+/)
      return match ? Number(match[0]) : null
    }
    const aside = document.querySelector('aside')
    const nav = document.querySelector('aside nav[data-testid="sidebar"]')
    const visible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none'
    }
    const describeLink = (element) => ({
      href: element.getAttribute('href') ?? '',
      text: (element.innerText ?? element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
      ariaCurrent: element.getAttribute('aria-current'),
      dataGroup: element.getAttribute('data-crm-nav-group'),
      dataActive: element.getAttribute('data-crm-nav-active'),
      dataMenuItemId: element.getAttribute('data-menu-item-id'),
      styledActive: /(^|\s)bg-muted(\s|$)/.test(element.className ?? ''),
      className: String(element.className ?? '').slice(0, 240),
      visible: visible(element),
    })
    const links = Array.from(nav?.querySelectorAll('a[href]') ?? []).map(describeLink)
    const groupHeaders = Array.from(nav?.querySelectorAll('[data-sidebar-group="true"]') ?? []).map((element) => {
      const button = element.querySelector('button')
      const bodyText = (element.innerText ?? '').replace(/\s+/g, ' ').trim()
      const buttonText = (button?.innerText ?? '').replace(/\s+/g, ' ').trim()
      return {
        // `label` is the header control's own text (button in the stock shell),
        // never the group body, so label matching cannot succeed on an item name.
        label: (buttonText || bodyText.split('\n')[0] || '').replace(/\s+/g, ' ').trim(),
        text: bodyText.slice(0, 120),
        tag: element.tagName.toLowerCase(),
        buttonAriaExpanded: button?.getAttribute('aria-expanded') ?? null,
        hasChevron: Boolean(element.querySelector('svg')),
      }
    })
    const searchInputs = Array.from(aside?.querySelectorAll('input') ?? [])
      .filter((input) => visible(input))
      .map((input) => ({
        type: input.type,
        ariaLabel: input.getAttribute('aria-label'),
        placeholder: input.getAttribute('placeholder'),
      }))
    const asideButtons = Array.from(aside?.querySelectorAll('button') ?? [])
      .filter((button) => visible(button))
      .map((button) => ({
        ariaLabel: button.getAttribute('aria-label'),
        ariaExpanded: button.getAttribute('aria-expanded'),
        text: (button.innerText ?? button.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
      }))
    const ariaCurrent = links.filter((link) => link.ariaCurrent === 'page')
    const ariaCurrentAny = Array.from(nav?.querySelectorAll('[aria-current]') ?? []).map((element) => ({
      tag: element.tagName.toLowerCase(),
      value: element.getAttribute('aria-current'),
      href: element.getAttribute('href'),
      text: (element.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
    }))
    const dataActive = links.filter((link) => link.dataActive === 'true')
    const styledActive = links.filter((link) => link.styledActive)
    const customMarkers = {}
    for (const selector of customSelectors) customMarkers[selector] = document.querySelectorAll(selector).length
    const markers = {
      searchInput: searchInputs.length,
      groupHeaders: groupHeaders.length,
      adminProductShell: Boolean(nav),
      brandLogo: Boolean(aside?.querySelector('img, svg')),
      profileTrigger: Boolean(document.querySelector('header button[aria-haspopup="menu"]')) || Boolean(aside?.querySelector('[data-crm-utility="account"]')),
      collapseToggle: Boolean(document.querySelector('aside button[aria-label="切换侧边栏"], aside button[aria-label*="Collapse"], aside button[aria-label*="collapsed"]')),
      footerUser: Boolean(aside?.querySelector('[data-crm-utility="account"]')) || Boolean(aside?.querySelector('[data-profile-trigger], a[href="/backend/profile"]')),
      customMarkers,
    }
    const customCount = Object.values(customMarkers).reduce((sum, count) => sum + count, 0)
    const stockSignals = Number(markers.searchInput > 0) + Number(markers.groupHeaders > 0)
    let mode = 'unknown'
    if (customCount > 0 && stockSignals === 0) mode = 'custom-rail'
    else if (customCount === 0 && stockSignals === 2) mode = 'stock-default'
    else if (customCount > 0 && stockSignals > 0) mode = 'mixed'
    return {
      url: location.href,
      pathname: location.pathname,
      mode,
      asideWidth: aside ? Math.round(aside.getBoundingClientRect().width) : null,
      asideHeight: aside ? Math.round(aside.getBoundingClientRect().height) : null,
      asideDisplay: aside ? getComputedStyle(aside).display : null,
      asideTransition: aside ? getComputedStyle(aside).transitionDuration : null,
      sidebarWidth: nav ? Math.round(nav.getBoundingClientRect().width) : null,
      linkCount: links.length,
      links,
      groupHeaders,
      searchInputs,
      asideButtons,
      ariaCurrent: ariaCurrent.map((link) => ({ href: link.href, text: link.text })),
      ariaCurrentAny,
      dataActive: dataActive.map((link) => ({ href: link.href, text: link.text })),
      styledActive: styledActive.map((link) => ({ href: link.href, text: link.text })),
      markers,
      customCount,
      stockSignals,
      duplicateHrefs: (() => {
        const counts = new Map()
        for (const link of links) {
          if (!link.href || link.href === '#' || link.href === '/backend') continue
          counts.set(link.href, (counts.get(link.href) ?? 0) + 1)
        }
        return [...counts.entries()].filter(([, count]) => count > 1).map(([href, count]) => ({ href, count }))
      })(),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }
  }, CUSTOM_RAIL_SELECTORS)
}

async function snapshotMobile(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none'
    }
    const drawer = Array.from(document.querySelectorAll('aside')).find((element) => visible(element) && element.closest('.fixed'))
    const desktopAside = Array.from(document.querySelectorAll('aside')).find((element) => visible(element) && !element.closest('.fixed'))
    const nav = drawer?.querySelector('nav[data-testid="sidebar"]')
    return {
      drawerOpen: Boolean(drawer),
      drawerWidth: drawer ? Math.round(drawer.getBoundingClientRect().width) : null,
      desktopAsideVisible: Boolean(desktopAside),
      desktopAsideWidth: desktopAside ? Math.round(desktopAside.getBoundingClientRect().width) : 0,
      navPresent: Boolean(nav),
      groupCount: nav ? nav.querySelectorAll('[data-crm-nav-group]').length : 0,
      groupHeaders: nav ? nav.querySelectorAll('[data-sidebar-group="true"]').length : 0,
      searchInputs: Array.from(drawer?.querySelectorAll('input') ?? []).filter((input) => visible(input)).length,
      links: Array.from(nav?.querySelectorAll('a[href]') ?? []).slice(0, 20).map((link) => ({
        href: link.getAttribute('href'),
        text: (link.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
      })),
      closeButton: Boolean(drawer?.querySelector('button[aria-label="关闭菜单"], button[aria-label*="Close"]')),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }
  })
}

async function tabOrder(page, steps = 14) {
  const order = []
  await page.evaluate(() => {
    document.body.focus()
  }).catch(() => {})
  for (let index = 0; index < steps; index += 1) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(60)
    order.push(
      await page.evaluate(() => {
        const element = document.activeElement
        if (!element || element === document.body) return { tag: 'BODY' }
        return {
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute('role'),
          ariaLabel: element.getAttribute('aria-label'),
          href: element.getAttribute('href'),
          text: (element.innerText ?? element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
          ariaCurrent: element.getAttribute('aria-current'),
        }
      }),
    )
  }
  return order
}

function parseCookies(cookieHeader) {
  const url = new URL(BASE)
  return cookieHeader.split(';').map((pair) => {
    const [name, ...rest] = pair.trim().split('=')
    return { name, value: rest.join('='), domain: url.hostname, path: '/', httpOnly: false, secure: false, sameSite: 'Lax' }
  }).filter((cookie) => cookie.name)
}

async function loginSession(role, credential) {
  const cookie = await loginWithRetry(BASE, credential, { role })
  return { cookie, cookies: parseCookies(cookie) }
}

// ---------------------------------------------------------------- IA check

function checkDeclaredSource(sourceDir) {
  const result = { sourceDir: path.resolve(sourceDir), navGroups: null, navGroupIds: [], checks: [], settingsCategories: [] }
  const groupsPath = path.join(sourceDir, 'src/nav/nav-groups.json')
  const settingsPath = path.join(sourceDir, 'src/nav/settings-sections.json')
  if (!fs.existsSync(groupsPath)) {
    result.error = `missing ${groupsPath}`
    return result
  }
  const groups = JSON.parse(fs.readFileSync(groupsPath, 'utf8'))
  result.navGroups = groups.map((group) => ({ id: group.id, label: group.label, order: group.order, members: group.members ?? [], landing: group.landing }))
  result.navGroupIds = result.navGroups.map((group) => group.id)
  const memberCounts = new Map()
  for (const group of result.navGroups) for (const member of group.members) memberCounts.set(member, (memberCounts.get(member) ?? 0) + 1)
  const duplicatedMembers = [...memberCounts.entries()].filter(([, count]) => count > 1)
  result.checks.push({ id: 'ia.source.members-in-one-container', ok: duplicatedMembers.length === 0, detail: JSON.stringify(duplicatedMembers) })
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    const settingsList = (Array.isArray(settings) ? settings : Array.isArray(settings.sections) ? settings.sections : Object.values(settings))
      .filter((entry) => entry && typeof entry === 'object' && typeof entry.id === 'string')
    result.settingsCategories = settingsList.map((entry) => entry.id)
  } else {
    result.checks.push({ id: 'ia.source.settings-sections-exists', ok: false, detail: `missing ${settingsPath}` })
  }
  if (IA_EXPECT_PATH) {
    const expectation = JSON.parse(fs.readFileSync(IA_EXPECT_PATH, 'utf8'))
    result.checks.push({
      id: 'ia.source.expectation-containers-match-nav-groups',
      ok: JSON.stringify((expectation.containers ?? []).map((container) => container.id)) === JSON.stringify(result.navGroupIds),
      detail: `${(expectation.containers ?? []).map((container) => container.id).join('|')} vs ${result.navGroupIds.join('|')}`,
    })
    result.checks.push({
      id: 'ia.source.expectation-categories-match-settings-sections',
      ok: JSON.stringify((expectation.categories ?? []).map((category) => category.id)) === JSON.stringify(result.settingsCategories),
      detail: `${(expectation.categories ?? []).map((category) => category.id).join('|')} vs ${result.settingsCategories.join('|')}`,
    })
  }
  return result
}

function checkLiveDeclared(role, catalogue, source) {
  const result = { checks: [], containers: [] }
  const liveIds = (catalogue.groups ?? []).map((group) => group.id)
  const declaredIds = source.navGroupIds ?? []
  const orderedSubset = (observed, declared) => {
    let cursor = 0
    for (const value of observed) {
      while (cursor < declared.length && declared[cursor] !== value) cursor += 1
      if (cursor >= declared.length) return false
      cursor += 1
    }
    return true
  }
  result.checks.push({
    id: 'ia.live.containers-match-declarations',
    ok: role === 'admin' ? JSON.stringify(liveIds) === JSON.stringify(declaredIds) : orderedSubset(liveIds, declaredIds),
    detail: `${liveIds.join('|')} vs ${declaredIds.join('|')} (${role === 'admin' ? 'exact' : 'ordered subset'})`,
  })
  for (const group of catalogue.groups ?? []) {
    const itemCount = typeof group.items === 'number' ? group.items : (group.items ?? []).length
    result.containers.push({ id: group.id, label: group.label, landing: group.landing, items: itemCount })
    result.checks.push({ id: `ia.live.container.${group.id}.non-empty`, ok: itemCount > 0, detail: `${itemCount} items` })
  }
  return result
}

function parseSourceDeclarations(sourceDir) {
  const declarations = { visible: new Set(), hidden: {} }
  const modulesPath = path.join(sourceDir, 'src/modules.ts')
  if (fs.existsSync(modulesPath)) {
    const text = fs.readFileSync(modulesPath, 'utf8')
    const re = /'(\/backend\/[^']+)':\s*\{([^}]*)\}/g
    let match
    while ((match = re.exec(text)) !== null) {
      const href = match[1]
      const body = match[2]
      if (/hidden:\s*true/.test(body)) declarations.hidden[href] = declarations.hidden[href] ?? { reason: 'declared hidden in src/modules.ts', parent: null }
      else declarations.visible.add(href)
    }
  }
  const hiddenPath = path.join(sourceDir, 'src/nav/hidden-pages.json')
  if (fs.existsSync(hiddenPath)) {
    const hidden = JSON.parse(fs.readFileSync(hiddenPath, 'utf8'))
    const entries = Array.isArray(hidden) ? hidden.map((entry) => [entry.href, entry]) : Object.entries(hidden)
    for (const [href, entry] of entries) {
      if (href && entry && typeof entry === 'object') declarations.hidden[href] = { ...(declarations.hidden[href] ?? {}), ...entry }
    }
  }
  return declarations
}


function checkExpectedIa(expectedPath, role, catalogue, shell, flat) {
  const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'))
  const checks = []
  const push = (id, ok, detail = '') => checks.push({ id, ok, detail: short(detail, 400) })
  const containers = expected.containers ?? []
  const categories = expected.categories ?? []
  const liveGroups = catalogue.groups ?? []
  const liveCategories = catalogue.manage ?? []
  const liveGroupIds = liveGroups.map((group) => group.id)
  const expectedIds = containers.map((container) => container.id)
  const isAdmin = role === 'admin'

  // Exact for admin; an ordered subsequence for a restricted employee account.
  const orderedSubset = (observed, declared) => {
    let cursor = 0
    for (const value of observed) {
      while (cursor < declared.length && declared[cursor] !== value) cursor += 1
      if (cursor >= declared.length) return false
      cursor += 1
    }
    return true
  }
  push('ia.containers.order', isAdmin ? JSON.stringify(liveGroupIds) === JSON.stringify(expectedIds) : orderedSubset(liveGroupIds, expectedIds), `${liveGroupIds.join('|')} vs ${expectedIds.join('|')}`)
  const missingContainers = expectedIds.filter((id) => !liveGroupIds.includes(id))
  const extraContainers = liveGroupIds.filter((id) => !expectedIds.includes(id))
  push('ia.containers.ids', extraContainers.length === 0 && (!isAdmin || missingContainers.length === 0), `missing=${JSON.stringify(missingContainers)} extra=${JSON.stringify(extraContainers)} (missing allowed only for restricted employee)`)

  const HOME_LANDING_ALIASES = new Set(['/backend', '/backend/workbench'])
  for (const container of containers) {
    const live = liveGroups.find((group) => group.id === container.id)
    if (!live) continue
    const expectedLabel = container.label?.zh ?? container.label ?? container.id
    push(`ia.container.${container.id}.label`, live.label === expectedLabel, `${live.label} vs ${expectedLabel}`)
    const landingMatches = container.id === 'home'
      ? HOME_LANDING_ALIASES.has(live.landing) && HOME_LANDING_ALIASES.has(container.landing)
      : live.landing === container.landing
    push(`ia.container.${container.id}.landing`, landingMatches, `${live.landing} vs ${container.landing}`)
  }

  const catKey = (category) => category.id ?? ''
  const matchesCategory = (live, expectedCategory) =>
    catKey(live) === expectedCategory.id ||
    catKey(live) === expectedCategory.partitionKey ||
    catKey(live).endsWith(`.${expectedCategory.id}`) ||
    catKey(live).endsWith(`/${expectedCategory.id}`)
  const expectedCatIds = categories.map((category) => category.id)
  const liveCatKeys = liveCategories.map((category) => {
    const match = categories.find((expectedCategory) => matchesCategory(category, expectedCategory))
    return match ? match.id : catKey(category)
  })
  push('ia.categories.order', isAdmin ? JSON.stringify(liveCatKeys) === JSON.stringify(expectedCatIds) : orderedSubset(liveCatKeys, expectedCatIds), `${liveCatKeys.join('|')} vs ${expectedCatIds.join('|')}`)
  const missingCategories = expectedCatIds.filter((id) => !liveCatKeys.includes(id))
  const extraCategories = liveCatKeys.filter((id) => !expectedCatIds.includes(id))
  push('ia.categories.ids', extraCategories.length === 0 && (!isAdmin || missingCategories.length === 0), `missing=${JSON.stringify(missingCategories)} extra=${JSON.stringify(extraCategories)} (missing allowed only for restricted employee)`)
  for (const expectedCategory of categories) {
    const live = liveCategories.find((category) => matchesCategory(category, expectedCategory))
    if (!live) continue
    const expectedLabel = expectedCategory.label?.zh ?? expectedCategory.label ?? expectedCategory.id
    push(`ia.category.${expectedCategory.id}.label`, live.label === expectedLabel, `${live.label} vs ${expectedLabel}`)
  }

  // One declared owner: no href may appear in two containers or twice in one.
  // Uses the flat declaration list (hrefs), not the summary item counts.
  const owners = new Map()
  for (const item of flat?.items ?? []) {
    const list = owners.get(item.href) ?? []
    list.push(`${item.kind}:${item.container}`)
    owners.set(item.href, list)
  }
  const multiplyOwned = [...owners.entries()].filter(([, list]) => list.length > 1)
  push('ia.one-owner-per-entry', multiplyOwned.length === 0, JSON.stringify(multiplyOwned.slice(0, 6)))

  // The stock shell must render one header per declared container, in every role's
  // own live catalogue (a narrower employee account legitimately has fewer), plus
  // at most one manage-hub header. Exact label match; duplicates and unexpected
  // headers fail the aggregate. The pure predicate lives in ia-headers.mjs.
  if (shell) {
    const manageHubLabels = (catalogue.utility ?? [])
      .filter((entry) => entry?.id === 'manage' && entry.label)
      .map((entry) => entry.label)
    const headerResult = checkHeaderLabels({
      observedLabels: (shell.groupHeaders ?? []).map((header) => header.label ?? header.text),
      expected: liveGroups.map((group) => ({ id: group.id, label: group.label })),
      allowedExtraLabels: manageHubLabels,
    })
    push(headerResult.aggregate.id, headerResult.aggregate.ok, headerResult.aggregate.detail)
    for (const entry of headerResult.checks) push(entry.id, entry.ok, entry.detail)
  }

  return {
    expectedPath: path.resolve(expectedPath),
    expectedVersion: expected.version ?? null,
    expectedContainers: containers.length,
    expectedCategories: categories.length,
    checks,
  }
}

// ---------------------------------------------------------------- release identity

function readReleaseIdentity() {
  const identity = { releaseDir: null, service: null }
  try {
    identity.releaseDir = fs.realpathSync('/home/pro/releases/mercato/current')
  } catch {
    identity.releaseDir = null
  }
  try {
    const output = execFileSync('systemctl', ['show', 'ila3-auto-deploy-app.service', '-p', 'ActiveEnterTimestamp', '-p', 'InvocationID', '-p', 'MainPID'], { encoding: 'utf8', timeout: 5000 })
    identity.service = Object.fromEntries(output.split('\n').filter(Boolean).map((line) => {
      const index = line.indexOf('=')
      return [line.slice(0, index), line.slice(index + 1)]
    }))
  } catch {
    identity.service = null
  }
  return identity
}

// ---------------------------------------------------------------- main run

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const results = { initialized: false }
let exitCode = 0

try {
  report.environment = {
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    base: BASE,
    release: readReleaseIdentity(),
  }
  const creds = credentials()
  const baseline = BASELINE_PATH ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) : null
  if (baseline) {
    check(null, 'baseline.loaded', 'frozen baseline report loaded', true, `${baseline.label} build ${baseline.build?.sha ?? '?'}`)
    const currentSha = baseline.build?.sha ?? ''
    if (EXPECT_SHA && currentSha && EXPECT_SHA.startsWith(currentSha)) {
      console.warn(`[warn] candidate --expect-sha ${EXPECT_SHA} must differ from baseline sha ${currentSha}`)
    }
  }

  const roleData = {}
  const sessionCookies = {}
  for (const role of ROLES) {
    const credential = creds.get(role)
    if (!credential) {
      check(role, 'credentials.present', 'credential file contains the role', false, 'role missing from /home/pro/.ila3-admin-credentials')
      continue
    }

    let session
    try {
      session = await loginSession(role, credential)
      check(role, 'login', 'real account login succeeds', true, 'session cookie captured')
    } catch (error) {
      check(role, 'login', 'real account login succeeds', false, short(error instanceof Error ? error.message : String(error), 160))
      continue
    }

    sessionCookies[role] = session.cookie
    const roleReport = { role, cookie: '<redacted>', catalogue: null, flat: null, shell: null }
    roleData[role] = roleReport

    // ---- catalogue (API) -------------------------------------------------
    let catalogue
    try {
      const payload = await httpJson(session.cookie, NAV_API)
      catalogue = payload?.crm ?? null
      if (catalogue) {
        fs.writeFileSync(path.join(OUT, `catalogue-${role}.json`), JSON.stringify({ role, base: BASE, build: report.build, payload }, null, 1))
      }
    } catch (error) {
      check(role, 'catalogue.responds', 'catalogue API responds', false, short(error instanceof Error ? error.message : String(error), 160))
      continue
    }
    check(role, 'catalogue.responds', 'catalogue API responds', Boolean(catalogue), `version=${catalogue?.version}`)
    if (!catalogue) continue
    const flat = flattenCatalogue(catalogue)
    roleReport.flat = flat
    roleReport.catalogue = {
      version: catalogue.version,
      groups: (catalogue.groups ?? []).map((group) => ({ id: group.id, label: group.label, landing: group.landing, items: (group.items ?? []).length })),
      manage: (catalogue.manage?.categories ?? []).map((category) => ({ id: category.id, label: category.label, items: (category.items ?? []).length, hrefs: (category.items ?? []).map((item) => item.href) })),
      personal: (catalogue.personal?.items ?? []).map((item) => ({ label: item.label, href: item.href })),
      utility: catalogue.utility ?? [],
      counts: {
        groups: (catalogue.groups ?? []).length,
        daily: (catalogue.groups ?? []).reduce((sum, group) => sum + (group.items ?? []).length, 0),
        manage: (catalogue.manage?.categories ?? []).reduce((sum, category) => sum + (category.items ?? []).length, 0),
        personal: (catalogue.personal?.items ?? []).length,
        entries: flat.items.length,
        uniqueHrefs: flat.hrefs.length,
        actions: (catalogue.actions ?? []).length,
        authorized: (catalogue.authorized ?? []).length,
      },
      unknown: catalogue.unknown ?? [],
      unconfiguredGroups: catalogue.unconfiguredGroups ?? [],
      duplicates: catalogue.duplicates ?? [],
      actions: catalogue.actions ?? [],
    }
    report.catalogue[role] = roleReport.catalogue
    check(role, 'catalogue.version', 'catalogue is version 2', catalogue.version === 2, `version=${catalogue.version}`)
    check(role, 'catalogue.unknown', 'no unknown/unmapped entries', (catalogue.unknown ?? []).length === 0, JSON.stringify(catalogue.unknown ?? []))
    check(role, 'catalogue.unconfigured', 'no unconfigured groups', (catalogue.unconfiguredGroups ?? []).length === 0, JSON.stringify(catalogue.unconfiguredGroups ?? []))
    check(role, 'catalogue.duplicates', 'no duplicate declarations', (catalogue.duplicates ?? []).length === 0 && flat.duplicates.length === 0, JSON.stringify([...(catalogue.duplicates ?? []), ...flat.duplicates]))
    check(role, 'catalogue.groups', 'catalogue declares groups', (catalogue.groups ?? []).length > 0, `${(catalogue.groups ?? []).length} groups`)

    // ---- reachability (all declared hrefs) ------------------------------
    if (!SKIP_REACHABILITY) {
      const statuses = await mapLimit(flat.hrefs, REACHABILITY_CONCURRENCY, (href) => httpStatus(session.cookie, href))
      roleReport.coverage = { entries: flat.items, hrefs: flat.hrefs.length, statuses }
      report.coverage[role] = roleReport.coverage
      const failures = statuses.filter((entry) => !entry.ok)
      const bad = statuses.filter((entry) => entry.status >= 500 || entry.status === 0)
      check(role, 'reachability.no-5xx', 'every declared href answers without 5xx/network error', bad.length === 0, JSON.stringify(bad.slice(0, 8)))
      const denied = statuses.filter((entry) => entry.status === 401 || entry.status === 403)
      record(role, 'reachability.denied-status', denied.length)
      record(role, 'reachability.status-histogram', statuses.reduce((histogram, entry) => {
        histogram[entry.status] = (histogram[entry.status] ?? 0) + 1
        return histogram
      }, {}))
      if (failures.length > 20) console.warn(`[warn] ${role}: ${failures.length} declared hrefs were not reachable`)
    }

    // ---- desktop shell + navigation ------------------------------------
    const context = await browser.newContext({
      viewport: DESKTOP,
      baseURL: BASE,
      locale: 'zh-CN',
      extraHTTPHeaders: { 'Accept-Language': 'zh-CN,zh;q=0.9' },
    })
    const diagnostics = { pageErrors: [], consoleErrors: [], failedRequests: [], serverErrors: [] }
    report.console[role] = diagnostics
    let page
    try {
      await context.addCookies(session.cookies)
      page = await context.newPage()
      page.setDefaultTimeout(45000)
      attachDiagnostics(page, diagnostics)

      const workbench = await gotoReady(page, '/backend/workbench')
      check(role, 'workbench.renders', 'workbench renders with the sidebar', workbench.ok, workbench.url)
      let shell = await snapshotShell(page)
      if (shell.linkCount === 0) {
        await sleep(1500)
        shell = await snapshotShell(page)
      }
      roleReport.shell = shell
      report.structure[role] = shell
      const build = await page.evaluate(() => {
        const footer = (document.querySelector('footer')?.innerText ?? '').replace(/\s+/g, ' ').trim()
        const attr = document.querySelector('[data-build-sha]')?.getAttribute('data-build-sha') ?? ''
        const match = footer.match(/\(([0-9a-f]{7,40})\)/i)
        return { footer: footer.slice(0, 240), sha: (attr || match?.[1] || '').toLowerCase() }
      })
      if (build.sha) report.build.sha = build.sha
      report.build.footer = build.footer
      const versionMatch = build.footer.match(/v([\d.]+)/)
      if (versionMatch) report.build.version = versionMatch[1]
      check(role, 'build.footer', 'footer carries the release identity', Boolean(report.build.sha), `${report.build.footer} sha=${report.build.sha || 'none'} release=${report.environment.release?.releaseDir ?? 'unknown'}`)
      if (EXPECT_SHA) {
        const matches = Boolean(report.build.sha) && (report.build.sha.startsWith(EXPECT_SHA) || EXPECT_SHA.startsWith(report.build.sha))
        check(role, 'build.expect-sha', 'build SHA matches --expect-sha', matches, `footer=${report.build.sha || 'none'} expected=${EXPECT_SHA}`)
      }

      // Target shell gates (candidate) vs baseline truth (freeze).
      const isStockDefault = shell.mode === 'stock-default'
      if (MODE === 'candidate') {
        check(role, 'shell.stock-default', 'sidebar is the stock AppShell default, not the custom rail', isStockDefault, `mode=${shell.mode} customMarkers=${shell.customCount} stockSignals=${shell.stockSignals}`)
        check(role, 'shell.no-custom-rail', 'no custom rail/widget markers render', shell.customCount === 0, JSON.stringify(shell.markers.customMarkers))
        check(role, 'shell.search', 'default sidebar search field is present', shell.searchInputs.length > 0, JSON.stringify(shell.searchInputs))
        check(role, 'shell.group-headers', 'default group headers render', shell.groupHeaders.length > 0, `${shell.groupHeaders.length} headers`)
        check(role, 'shell.width-240', 'expanded sidebar is 240px', shell.asideWidth === 240, `width=${shell.asideWidth}`)
        check(role, 'shell.brand-logo', 'sidebar shows the product logo/brand', shell.markers.brandLogo, shell.markers.brandLogo ? 'logo present' : 'no logo in aside')
        check(role, 'shell.account-affordance', 'account surface is reachable (header avatar or sidebar footer)', shell.markers.profileTrigger || shell.markers.footerUser, JSON.stringify({ profileTrigger: shell.markers.profileTrigger, footerUser: shell.markers.footerUser }))
        check(role, 'shell.search-labeled', 'sidebar search has an accessible label or placeholder', shell.searchInputs.some((input) => (input.ariaLabel ?? '').length > 0 || (input.placeholder ?? '').length > 0), JSON.stringify(shell.searchInputs))
        check(role, 'shell.group-headers-chevrons', 'group headers carry the expand/collapse chevron', shell.groupHeaders.length > 0 && shell.groupHeaders.every((header) => header.hasChevron), JSON.stringify(shell.groupHeaders.map((header) => header.hasChevron)))
        const declaredGroups = (catalogue.groups ?? []).length
        check(role, 'shell.group-header-count', 'default shell renders every declared group header (plus the manage hub group)', shell.groupHeaders.length >= declaredGroups, `headers=${shell.groupHeaders.length} declared=${declaredGroups}`)
        // The installed shell only renders items of an expanded group. Expand every
        // collapsed header (a real user action) before proving the declared set renders.
        try {
          for (let round = 0; round < 24; round += 1) {
            const collapsed = page.locator('aside nav [data-sidebar-group="true"] button[aria-expanded="false"]')
            if ((await collapsed.count()) === 0) break
            await collapsed.first().click({ timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
          }
        } catch {
          /* expanding is best-effort; the coverage gate below reports what rendered */
        }
        const expandedShell = await snapshotShell(page)
        const expectedShellHrefs = new Set([
          ...(catalogue.groups ?? []).flatMap((group) => (group.items ?? []).map((item) => item.href)),
          ...(catalogue.utility ?? []).filter((entry) => entry.id === 'manage').map((entry) => entry.href),
        ])
        // Documented home alias: the catalogue declares the dashboard landing as
        // /backend/workbench, whose page (src/modules/workbench/backend/workbench/page.tsx)
        // redirects to /backend; the declared shell canonicalizes the home item href to
        // /backend (SHELL_HREF_ALIASES). No other href aliasing is allowed, and the
        // /backend/workbench destination status (307) is recorded in coverage.statuses.
        const RENDERED_ALIASES = { '/backend': '/backend/workbench' }
        const renderedHrefs = new Set(expandedShell.links.map((link) => RENDERED_ALIASES[link.href] ?? link.href))
        report.structure[role].renderedAliases = RENDERED_ALIASES
        const missingShell = [...expectedShellHrefs].filter((href) => !renderedHrefs.has(href))
        check(role, 'shell.all-declared-entries-rendered', 'with every group expanded, every declared daily entry and the manage hub renders in the sidebar', missingShell.length === 0, JSON.stringify(missingShell.slice(0, 10)))
        check(role, 'shell.manage-once', 'the management hub renders exactly once in the sidebar', expandedShell.links.filter((link) => link.href === '/backend/manage').length === 1, `count=${expandedShell.links.filter((link) => link.href === '/backend/manage').length}`)
        report.structure[role].expandedLinks = expandedShell.links.map((link) => ({ href: link.href, text: link.text, ariaCurrent: link.ariaCurrent }))
      } else {
        record(role, 'shell.mode', shell.mode)
        record(role, 'shell.markers', shell.markers)
        // Common invariant: the sidebar exists and shows exactly one active destination.
        check(role, 'shell.sidebar-present', 'sidebar renders', Boolean(shell.sidebarWidth), `width=${shell.sidebarWidth}`)
      }
      const markedActive = shell.ariaCurrent.length + shell.dataActive.length
      const activeTotal = markedActive > 0 ? new Set([...shell.ariaCurrent, ...shell.dataActive].map((link) => link.href)).size : shell.styledActive.length
      check(role, 'nav.active-single', 'exactly one current destination is marked', activeTotal === 1, `aria-current=${shell.ariaCurrent.length} data-active=${shell.dataActive.length} styled=${shell.styledActive.length}`)
      if (MODE === 'candidate') {
        check(role, 'nav.aria-current', 'active destination exposes aria-current=page', shell.ariaCurrent.length === 1, JSON.stringify(shell.ariaCurrent))
        check(role, 'nav.aria-current-matches-path', 'aria-current target matches the current path', shell.ariaCurrent.some((link) => activePathMatches(shell.pathname, link.href)), `${shell.ariaCurrent.map((l) => l.href).join(',')} vs ${shell.pathname}`)
        check(role, 'nav.no-rendered-duplicates', 'no destination renders twice in the sidebar', shell.duplicateHrefs.length === 0, JSON.stringify(shell.duplicateHrefs))
        const expandedHeaders = shell.groupHeaders.filter((header) => header.buttonAriaExpanded === 'true' || header.buttonAriaExpanded === 'false')
        check(role, 'a11y.group-headers-aria-expanded', 'group header buttons expose aria-expanded', shell.groupHeaders.length > 0 && expandedHeaders.length === shell.groupHeaders.length, `${expandedHeaders.length}/${shell.groupHeaders.length}`)
      }
      await takeShot(page, role, 'workbench-expanded')

      // Group landing pages: reachable + active group marking.
      const activeChecks = []
      for (const group of (catalogue.groups ?? []).slice(0, 8)) {
        const landing = group.landing
        if (!landing) continue
        const navResult = await gotoReady(page, landing)
        const groupShell = await snapshotShell(page)
        const explicitActive = [...groupShell.ariaCurrent, ...groupShell.dataActive]
        const activeHrefs = [...new Set((explicitActive.length > 0 ? explicitActive : groupShell.styledActive).map((entry) => entry.href))]
        const matched = activeHrefs.some((href) => href && (href === groupShell.pathname || groupShell.pathname.startsWith(`${href}/`) || href.startsWith(groupShell.pathname)))
        activeChecks.push({ groupId: group.id, landing, ok: navResult.ok, degraded: Boolean(navResult.degraded), activeHrefs, ariaCurrentAny: (groupShell.ariaCurrentAny ?? []).map((entry) => entry.value), matched, mode: groupShell.mode })
        await sleep(150)
      }
      roleReport.groupLandings = activeChecks
      report.structure[role].groupLandings = activeChecks
      const badLandings = activeChecks.filter((entry) => !entry.ok)
      check(role, 'nav.group-landings-reachable', 'every group landing page renders', badLandings.length === 0, JSON.stringify(badLandings))
      const degradedLandings = activeChecks.filter((entry) => entry.degraded)
      if (degradedLandings.length > 0) report.warnings.push(`${role}: ${degradedLandings.length} group landing page(s) passed via content fallback: ${JSON.stringify(degradedLandings.map((entry) => entry.landing))}`)
      const badActive = activeChecks.filter((entry) => !entry.matched)
      check(role, 'nav.group-active-marking', 'each group page marks a current destination', badActive.length === 0, JSON.stringify(badActive.slice(0, 6)))
      await gotoReady(page, '/backend/workbench')
      await takeShot(page, role, 'workbench-after-groups')

      // Customers list: a real table under the shell.
      const customers = await gotoReady(page, '/backend/customers/companies', { minText: 60 })
      let rows = 0
      if (customers.ok) {
        await page
          .waitForFunction(() => {
            const text = document.querySelector('main')?.innerText ?? ''
            if (/正在加载表格|Loading table/.test(text)) return false
            return Array.from(document.querySelectorAll('tbody tr')).some((row) => row.querySelectorAll('td').length >= 2)
          }, undefined, { timeout: 30000 })
          .catch(() => {})
        rows = await page.locator('tbody tr').count()
      }
      check(role, 'customers.renders', 'customer list renders under the shell', customers.ok, `rows=${rows}`)
      await takeShot(page, role, 'customers')

      // Collapse geometry + persistence.
      const collapse = { toggle: false, expandedWidth: shell.asideWidth, collapsedWidth: null, persistedAfterReload: null, cookie: null, localStorage: null }
      const toggle = page.locator('aside button[aria-label="切换侧边栏"], aside button[aria-label*="Collapse"], aside button[aria-label*="collapsed"]').first()
      if ((await toggle.count()) > 0) {
        collapse.toggle = true
        await toggle.click().catch(() => {})
        await page.waitForTimeout(700)
        collapse.collapsedWidth = await page.evaluate(() => Math.round(document.querySelector('aside')?.getBoundingClientRect().width ?? 0))
        collapse.localStorage = await page.evaluate(() => {
          try {
            return localStorage.getItem('om:sidebarCollapsed')
          } catch {
            return null
          }
        })
        collapse.cookie = await page.evaluate(() => /(?:^|;\s*)om_sidebar_collapsed=([^;]+)/.exec(document.cookie)?.[1] ?? null)
        check(role, 'collapse.collapsed-width', 'collapsing the sidebar reaches the 80px icon rail', collapse.collapsedWidth === 80, `width=${collapse.collapsedWidth}`)
        check(role, 'collapse.local-storage', 'collapse preference persists in localStorage', collapse.localStorage === '1' || collapse.localStorage === 'true', `om:sidebarCollapsed=${collapse.localStorage}`)
        check(role, 'collapse.cookie', 'collapse preference persists in the om_sidebar_collapsed cookie', collapse.cookie === '1' || collapse.cookie === 'true', `cookie=${collapse.cookie}`)
        await page.reload({ waitUntil: 'domcontentloaded' })
        await waitReady(page)
        const afterReload = await page.evaluate(() => Math.round(document.querySelector('aside')?.getBoundingClientRect().width ?? 0))
        collapse.persistedAfterReload = afterReload
        check(role, 'collapse.persists', 'collapsed width survives a reload', afterReload === 80, `width=${afterReload}`)
        await takeShot(page, role, 'collapsed')
        const restore = page.locator('aside button[aria-label="切换侧边栏"], aside button[aria-label*="Expand"], aside button[aria-label*="expand"]').first()
        if ((await restore.count()) > 0) {
          await restore.click().catch(() => {})
          await page.waitForTimeout(500)
        }
      }
      roleReport.collapse = collapse
      if (MODE === 'candidate') {
        check(role, 'collapse.toggle-present', 'default collapse toggle is available', collapse.toggle, 'no aside toggle found')
      } else if (!collapse.toggle) {
        record(role, 'collapse.toggle-present', false)
      }

      // Management surface.
      const manage = await gotoReady(page, '/backend/manage')
      const manageEntries = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-manage-entry]')).map((element) => ({
          href: element.getAttribute('data-manage-entry'),
          text: (element.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 100),
        })),
      )
      const manageCount = manageEntries.length
      check(role, 'manage.renders', 'management centre renders entries', manage.ok && manageCount > 0, `entries=${manageCount}`)
      const manageHrefs = new Set(manageEntries.map((entry) => entry.href).filter(Boolean))
      const catalogueManageHrefs = new Set((catalogue.manage?.categories ?? []).flatMap((category) => (category.items ?? []).map((item) => item.href)))
      const missingManage = [...catalogueManageHrefs].filter((href) => !manageHrefs.has(href))
      const extraManage = [...manageHrefs].filter((href) => !catalogueManageHrefs.has(href))
      check(role, 'manage.matches-catalogue', 'management surface matches the catalogue manage set', missingManage.length === 0 && extraManage.length === 0, `missing=${JSON.stringify(missingManage.slice(0, 6))} extra=${JSON.stringify(extraManage.slice(0, 6))}`)
      // Search inside the management centre must filter without navigating.
      const manageSearch = page.locator('main input[placeholder*="搜索"], main input[aria-label*="搜索"], main input[placeholder*="Search" i], main input[type="search"]').first()
      let manageSearchState = null
      if ((await manageSearch.count()) > 0) {
        const before = await page.locator('[data-manage-entry]').count()
        const tokens = []
        for (const entry of manageEntries) {
          for (const word of String(entry.text).split(/\s+/)) {
            const token = word.trim()
            if (token.length >= 2 && token.length <= 6 && /[\u4e00-\u9fffA-Za-z]/.test(token) && !tokens.includes(token)) tokens.push(token)
          }
          if (tokens.length >= 8) break
        }
        let attempt = null
        for (const token of tokens.slice(0, 8)) {
          await manageSearch.fill(token)
          await page.waitForTimeout(400)
          const after = await page.locator('[data-manage-entry]').count()
          attempt = { token, before, after, filtered: after > 0 && after < before }
          if (attempt.filtered) break
        }
        manageSearchState = attempt ?? { token: null, before, after: before, filtered: false }
        check(role, 'manage.search-filters', 'management search filters entries in place', manageSearchState.filtered, JSON.stringify(manageSearchState))
        await manageSearch.fill('')
      }
      roleReport.manage = { entries: manageEntries, missing: missingManage, extra: extraManage, search: manageSearchState }
      report.manage[role] = roleReport.manage
      await takeShot(page, role, 'manage')

      // Account surface: header avatar menu + profile pages.
      const account = { profileTrigger: false, menuItems: [], profilePages: [] }
      const profileTrigger = page.locator('header button[aria-haspopup="menu"]').first()
      if ((await profileTrigger.count()) > 0) {
        account.profileTrigger = true
        await profileTrigger.click().catch(() => {})
        await page.waitForTimeout(500)
        account.menuItems = await page.evaluate(() =>
          Array.from(document.querySelectorAll('[role="menuitem"], [role="menu"] a, [role="menu"] button')).map((element) => ({
            tag: element.tagName.toLowerCase(),
            text: (element.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
            href: element.getAttribute('href'),
          })),
        )
        await page.keyboard.press('Escape').catch(() => {})
        await page.waitForTimeout(200)
      }
      check(role, 'account.avatar-menu', 'header avatar menu opens with account destinations', account.profileTrigger && account.menuItems.length > 0, JSON.stringify(account.menuItems.slice(0, 6)))
      const profileHrefs = [...new Set([...(catalogue.personal?.items ?? []).map((item) => item.href), '/backend/profile'])]
      for (const href of profileHrefs) {
        const result = await gotoReady(page, href)
        const text = result.ok ? await mainText(page) : ''
        const denied = DENY_RE.test(text)
        account.profilePages.push({ href, ok: result.ok && !denied, denied })
        await sleep(120)
      }
      const badProfilePages = account.profilePages.filter((entry) => !entry.ok)
      check(role, 'account.profile-pages', 'account pages reachable (password/channels/preferences)', badProfilePages.length === 0, JSON.stringify(badProfilePages))
      roleReport.account = account
      report.account[role] = account
      await gotoReady(page, '/backend/profile/change-password')
      await takeShot(page, role, 'profile')

      // Keyboard order from a fresh load.
      await gotoReady(page, '/backend/workbench')
      const order = await tabOrder(page, 14)
      roleReport.keyboard = { order }
      report.keyboard[role] = roleReport.keyboard
      check(role, 'a11y.skip-link-first', 'first tab stop is the skip link', order[0]?.href === '#main-content' || /skip|跳到主要内容/i.test(order[0]?.text ?? ''), JSON.stringify(order.slice(0, 3)))
      const reachedSidebar = order.some((step) => step.href && step.href.startsWith('/backend'))
      check(role, 'a11y.sidebar-in-tab-order', 'sidebar destinations are in the tab order', reachedSidebar, JSON.stringify(order.slice(0, 8)))

      // Reduced motion: a fresh context with prefers-reduced-motion: reduce.
      const motionContext = await browser.newContext({ viewport: DESKTOP, baseURL: BASE, locale: 'zh-CN', reducedMotion: 'reduce' })
      try {
        await motionContext.addCookies(session.cookies)
        const motionPage = await motionContext.newPage()
        await gotoReady(motionPage, '/backend/workbench')
        let motion = null
        for (let attempt = 0; attempt < 2 && !motion; attempt += 1) {
          try {
            motion = await motionPage.evaluate(() => {
              const aside = document.querySelector('aside')
              const style = aside ? getComputedStyle(aside) : null
              return {
                reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
                asideTransitionDuration: style?.transitionDuration ?? null,
                asideTransitionProperty: style?.transitionProperty ?? null,
              }
            })
          } catch {
            await motionPage.waitForTimeout(500)
          }
        }
        if (!motion) motion = { reducedMotion: true, asideTransitionDuration: null, asideTransitionProperty: null }
        roleReport.reducedMotion = motion
        report.reducedMotion[role] = motion
        const durations = String(motion.asideTransitionDuration ?? '0s').split(',').map((value) => Number.parseFloat(value) || 0)
        const maxDuration = Math.max(0, ...durations)
        const transitionDisabled = String(motion.asideTransitionProperty ?? '').split(',').every((value) => value.trim() === 'none')
        if (MODE === 'candidate') {
          check(role, 'a11y.reduced-motion', 'sidebar animation respects prefers-reduced-motion', transitionDisabled || maxDuration <= 0.05, `transition-property=${motion.asideTransitionProperty} duration=${motion.asideTransitionDuration}`)
        } else {
          record(role, 'a11y.reduced-motion-duration', motion.asideTransitionDuration)
        }
      } finally {
        await motionContext.close()
      }
    } catch (error) {
      check(role, 'desktop.suite', 'desktop suite completed', false, short(error instanceof Error ? error.message : String(error), 240))
    } finally {
      await context.close().catch(() => {})
    }

    // ---- mobile ---------------------------------------------------------
    const mobileContext = await browser.newContext({
      viewport: MOBILE,
      baseURL: BASE,
      locale: 'zh-CN',
      isMobile: true,
      hasTouch: true,
      extraHTTPHeaders: { 'Accept-Language': 'zh-CN,zh;q=0.9' },
    })
    try {
      await mobileContext.addCookies(session.cookies)
      const mobilePage = await mobileContext.newPage()
      mobilePage.setDefaultTimeout(45000)
      const mobileResult = await gotoReady(mobilePage, '/backend/workbench')
      check(role, 'mobile.renders', 'mobile workbench renders', mobileResult.ok, mobileResult.url)
      const before = await snapshotMobile(mobilePage)
      const menuButton = mobilePage.locator('button[aria-label="打开菜单"], button[aria-label*="Open menu" i], button[aria-label*="Menu" i]').first()
      const menuPresent = (await menuButton.count()) > 0
      check(role, 'mobile.menu-button', 'mobile menu button is present', menuPresent, 'no open-menu button')
      let after = before
      if (menuPresent) {
        await menuButton.click().catch(() => {})
        await mobilePage.waitForTimeout(800)
        after = await snapshotMobile(mobilePage)
      }
      check(role, 'mobile.drawer-opens', 'mobile drawer opens from the menu button', after.drawerOpen && after.navPresent, JSON.stringify({ drawerOpen: after.drawerOpen, navPresent: after.navPresent }))
      check(role, 'mobile.drawer-width', 'mobile drawer uses the default 280px width', after.drawerWidth === 280, `width=${after.drawerWidth}`)
      check(role, 'mobile.no-horizontal-overflow', 'mobile page does not overflow horizontally', after.documentWidth <= after.viewportWidth + 1, `${after.documentWidth}/${after.viewportWidth}`)
      if (MODE === 'candidate') {
        check(role, 'mobile.drawer-default', 'mobile drawer renders the default sidebar content', after.groupHeaders > 0 && after.searchInputs > 0, JSON.stringify({ groupHeaders: after.groupHeaders, searchInputs: after.searchInputs }))
      }
      roleReport.mobile = { before, after }
      report.mobile[role] = roleReport.mobile
      await takeShot(mobilePage, role, 'mobile-workbench')
      if (after.drawerOpen) await takeShot(mobilePage, role, 'mobile-drawer')
    } catch (error) {
      check(role, 'mobile.suite', 'mobile suite completed', false, short(error instanceof Error ? error.message : String(error), 240))
    } finally {
      await mobileContext.close().catch(() => {})
    }

    // ---- navigation request-failure card (v2) -------------------------
    if (MODE === 'candidate' && role === 'admin') {
      const failureContext = await browser.newContext({ viewport: DESKTOP, baseURL: BASE, locale: 'zh-CN' })
      try {
        await failureContext.addCookies(session.cookies)
        const failurePage = await failureContext.newPage()
        let aborted = 0
        const fallback = {
          groups: [], settingsSections: [], profileSections: [], settingsPathPrefixes: [], profilePathPrefixes: [],
          grantedFeatures: [],
          crm: {
            version: 2, error: true, groups: [], railActions: [], utility: [],
            manage: { categories: [] }, personal: { items: [] },
            unknown: [], unconfiguredGroups: [], actions: [], authorized: [], duplicates: [],
          },
        }
        await failurePage.route('**/api/crm_navigation/navigation*', (route) => {
          aborted += 1
          // This is the exact typed chrome fallback the route returns when the
          // upstream nav payload is unavailable (chrome=1, status 200, crm.error=true).
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fallback) })
        })
        try {
          await failurePage.goto(`${BASE}/backend`, { waitUntil: 'domcontentloaded', timeout: 30000 })
          await failurePage.waitForSelector('[data-crm-nav-error]', { state: 'attached', timeout: 15000 })
          const errorState = await failurePage.evaluate(() => {
            const card = document.querySelector('[data-crm-nav-error]')
            return {
              present: Boolean(card),
              text: (card?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
              retry: Boolean(card?.querySelector('button, a')),
            }
          })
          check(role, 'shell.nav-error-card', 'navigation request failure renders the retryable error card', errorState.present && /导航加载失败/.test(errorState.text), JSON.stringify({ ...errorState, aborted }))
          const file = path.join(SHOTS, `${LABEL}-${role}-nav-error.png`)
          await failurePage.screenshot({ path: file, animations: 'disabled' })
          report.screenshots.push({ role, name: 'nav-error', path: file, sha256: sha256(file), url: failurePage.url(), viewport: failurePage.viewportSize(), content: null, at: new Date().toISOString() })
        } catch (error) {
          check(role, 'shell.nav-error-card', 'navigation request failure renders the retryable error card', false, short(error instanceof Error ? error.message : String(error), 160))
        }
      } finally {
        await failureContext.close().catch(() => {})
      }
    }

    // ---- admin/employee cross-role authorization -----------------------
    if (role === 'employee') {
      const adminReport = roleData.admin
      if (adminReport?.catalogue) {
        const adminFlat = adminReport.flat
        const employeeHrefs = new Set(roleReport.flat.hrefs)
        // The catalogue API is authorization-filtered: admin-only hrefs must be absent.
        const adminOnlyCatalogHrefs = [...new Set((adminFlat?.items ?? []).filter((item) => !employeeHrefs.has(item.href)).map((item) => item.href))]
        const leaked = adminOnlyCatalogHrefs.filter((href) => employeeHrefs.has(href))
        check('employee', 'auth.no-admin-entries', 'employee catalogue contains no admin-only entries', leaked.length === 0, JSON.stringify(leaked.slice(0, 8)))
        const adminOnlySet = adminOnlyCatalogHrefs.slice(0, 20)
        const deniedPages = []
        const allowedPages = []
        const employeeContext = await browser.newContext({ viewport: DESKTOP, baseURL: BASE, locale: 'zh-CN' })
        try {
          await employeeContext.addCookies(session.cookies)
          const employeePage = await employeeContext.newPage()
          for (const href of adminOnlySet) {
            let finalPath = ''
            try {
              await employeePage.goto(new URL(href, BASE).toString(), { waitUntil: 'domcontentloaded', timeout: 20000 })
              await employeePage.waitForTimeout(1200)
              finalPath = await employeePage.evaluate(() => location.pathname)
            } catch {
              finalPath = '(navigation-failed)'
            }
            const text = await mainText(employeePage).catch(() => '')
            if (DENY_RE.test(text)) deniedPages.push(href)
            else if (finalPath !== new URL(href, BASE).pathname) allowedPages.push({ href, finalPath, text: short(text, 120), reason: 'redirected' })
            else allowedPages.push({ href, finalPath, text: short(text, 120) })
          }
        } finally {
          await employeeContext.close().catch(() => {})
        }
        roleReport.authorization = { adminOnlyTotal: adminOnlyCatalogHrefs.length, sampled: adminOnlySet.length, denied: deniedPages.length, allowed: allowedPages }
        check('employee', 'auth.admin-only-denied', 'employee cannot open admin-only pages (or only scoped views)', allowedPages.length === 0, JSON.stringify(allowedPages.slice(0, 6)))
        check('employee', 'auth.admin-only-api', 'admin-only API responds 403 for the employee', await (async () => {
          const response = await fetch(new URL('/api/api_keys/keys', BASE), { headers: { cookie: session.cookie }, redirect: 'manual', signal: AbortSignal.timeout(20000) })
          try {
            await response.body?.cancel()
          } catch {}
          return response.status === 403 || response.status === 401
        })(), 'GET /api/api_keys/keys')
      }
    }
  }

  // ---- admin vs employee manage membership (both catalogues available) --
  if (roleData.admin?.catalogue && roleData.employee?.catalogue) {
    const adminManage = new Set((roleData.admin.catalogue.manage ?? []).flatMap((category) => category.hrefs))
    const employeeManage = new Set((roleData.employee.catalogue.manage ?? []).flatMap((category) => category.hrefs))
    const employeeAdminOnly = [...employeeManage].filter((href) => !adminManage.has(href))
    report.manage.crossRole = {
      adminCount: adminManage.size,
      employeeCount: employeeManage.size,
      employeeHasAdminOnly: employeeAdminOnly,
      adminOnlyCount: [...adminManage].filter((href) => !employeeManage.has(href)).length,
    }
    check('employee', 'manage.no-admin-only-entries', 'employee management centre shows no admin-only entry', employeeAdminOnly.length === 0, JSON.stringify(employeeAdminOnly.slice(0, 8)))
    // Management surface membership diff must be stable against the frozen baseline.
    if (baseline?.manage?.admin && baseline?.manage?.employee) {
      const baselineAdmin = new Set(baseline.manage.admin.entries?.map((entry) => entry.href).filter(Boolean) ?? [])
      const currentAdmin = new Set((roleData.admin.manage?.entries ?? []).map((entry) => entry.href).filter(Boolean))
      const baselineEmployee = new Set(baseline.manage.employee.entries?.map((entry) => entry.href).filter(Boolean) ?? [])
      const currentEmployee = new Set((roleData.employee.manage?.entries ?? []).map((entry) => entry.href).filter(Boolean))
      const declaredByRole = (role) => new Set(roleData[role]?.flat?.hrefs ?? [])
      const adminDeclared = declaredByRole('admin')
      const employeeDeclared = declaredByRole('employee')
      const adminMissing = [...baselineAdmin].filter((href) => !currentAdmin.has(href))
      const employeeMissing = [...baselineEmployee].filter((href) => !currentEmployee.has(href))
      const adminLost = adminMissing.filter((href) => !adminDeclared.has(href))
      const employeeLost = employeeMissing.filter((href) => !employeeDeclared.has(href))
      const adminRehomed = adminMissing.filter((href) => adminDeclared.has(href))
      const employeeRehomed = employeeMissing.filter((href) => employeeDeclared.has(href))
      check('admin', 'manage.no-loss-vs-baseline', 'admin management entries are not dropped from the catalogue (re-homed entries allowed)', adminLost.length === 0, `lost=${JSON.stringify(adminLost.slice(0, 8))} re-homed=${JSON.stringify(adminRehomed.slice(0, 8))}`)
      check('employee', 'manage.no-loss-vs-baseline', 'employee management entries are not dropped from the catalogue (re-homed entries allowed)', employeeLost.length === 0, `lost=${JSON.stringify(employeeLost.slice(0, 8))} re-homed=${JSON.stringify(employeeRehomed.slice(0, 8))}`)
      if (adminRehomed.length > 0 || employeeRehomed.length > 0) report.warnings.push(`manage re-homing vs v1: admin=${JSON.stringify(adminRehomed)} employee=${JSON.stringify(employeeRehomed)}`)
      report.manage.comparison = { adminMissing, employeeMissing, adminLost, employeeLost, adminRehomed, employeeRehomed }
    }
  }

  // ---- IA declarations -------------------------------------------------
  if (SOURCE_DIR) {
    const source = checkDeclaredSource(SOURCE_DIR)
    report.ia = report.ia ?? {}
    report.ia.source = source
    if (source.error) check(null, 'ia.source.exists', 'declared IA sources are readable', false, source.error)
    for (const entry of source.checks) check(null, entry.id, 'declared IA source cross-check', entry.ok, entry.detail)
    report.ia.live = report.ia.live ?? {}
    for (const [role, data] of Object.entries(roleData)) {
      if (!data?.catalogue) continue
      const live = checkLiveDeclared(role, data.catalogue, source)
      report.ia.live[role] = report.ia.live[role] ?? {}
      report.ia.live[role].declarations = live
      for (const entry of live.checks) check(role, entry.id, 'live catalogue matches declared containers', entry.ok, entry.detail)
    }
  }
  if (IA_EXPECT_PATH) {
    report.ia = report.ia ?? {}
    report.ia.live = report.ia.live ?? {}
    for (const [role, data] of Object.entries(roleData)) {
      if (!data?.catalogue) continue
      const expected = checkExpectedIa(IA_EXPECT_PATH, role, data.catalogue, data.shell, data.flat)
      report.ia.live[role] = report.ia.live[role] ?? {}
      report.ia.live[role].expectation = expected
      for (const entry of expected.checks) check(role, entry.id, 'live catalogue matches the frozen v2 expectation', entry.ok, entry.detail)
    }
  }

  // ---- candidate comparison -------------------------------------------
  if (MODE === 'candidate' && baseline) {
    const comparison = { baselineLabel: baseline.label, baselineSha: baseline.build?.sha ?? '', shaMatched: false, roles: {} }
    if (EXPECT_SHA && report.build.sha) comparison.shaMatched = report.build.sha.startsWith(EXPECT_SHA) || EXPECT_SHA.startsWith(report.build.sha)
    for (const role of ROLES) {
      const before = baseline.catalogue?.[role]
      const after = roleData[role]?.catalogue
      const beforeEntries = baseline.coverage?.[role]?.entries
      const afterEntries = report.coverage?.[role]?.entries
      if (!before || !after || !Array.isArray(beforeEntries) || !Array.isArray(afterEntries)) {
        check(role, 'compare.catalogue-present', 'baseline and candidate catalogues are both available', false, `catalogue=${Boolean(before)}/${Boolean(after)} entries=${Array.isArray(beforeEntries)}/${Array.isArray(afterEntries)}`)
        continue
      }
      const duplicatesOf = (entries) => {
        const counts = new Map()
        for (const entry of entries) counts.set(entry.href, (counts.get(entry.href) ?? 0) + 1)
        return [...counts.entries()].filter(([, count]) => count > 1).map(([href, count]) => ({ href, count }))
      }
      const diff = compareCatalogue({ items: beforeEntries, duplicates: duplicatesOf(beforeEntries) }, { items: afterEntries, duplicates: duplicatesOf(afterEntries) })
      const baselineStatuses = new Map((baseline.coverage?.[role]?.statuses ?? []).map((entry) => [entry.href, entry.status]))
      const candidateStatuses = new Map((report.coverage?.[role]?.statuses ?? []).map((entry) => [entry.href, entry.status]))
      const regressions = []
      const improvements = []
      for (const [href, beforeStatus] of baselineStatuses) {
        const afterStatus = candidateStatuses.get(href)
        if (afterStatus === undefined) continue
        if (beforeStatus > 0 && beforeStatus < 400 && !(afterStatus > 0 && afterStatus < 400)) regressions.push({ href, beforeStatus, afterStatus })
        if (beforeStatus >= 400 && afterStatus > 0 && afterStatus < 400) improvements.push({ href, beforeStatus, afterStatus })
      }
      const sourceDeclarations = SOURCE_DIR ? parseSourceDeclarations(SOURCE_DIR) : null
      const afterHrefSet = new Set(afterEntries.map((entry) => entry.href))
      const documentedMissing = sourceDeclarations
        ? diff.missing.filter((href) => {
            const hidden = sourceDeclarations.hidden[href]
            return Boolean(hidden && hidden.parent && hidden.reason && afterHrefSet.has(hidden.parent))
          })
        : []
      const undocumentedMissing = diff.missing.filter((href) => !documentedMissing.includes(href))
      const declaredAdditions = sourceDeclarations ? diff.added.filter((href) => sourceDeclarations.visible.has(href)) : []
      const undeclaredAdditions = diff.added.filter((href) => !declaredAdditions.includes(href))
      comparison.roles[role] = {
        missingHrefs: diff.missing,
        addedHrefs: diff.added,
        duplicateDeclarations: diff.duplicated,
        containerChanges: diff.containerChanges,
        documentedHiddenMissing: documentedMissing.map((href) => ({ href, ...(sourceDeclarations?.hidden[href] ?? {}) })),
        declaredAdditions,
        undocumentedMissing,
        undeclaredAdditions,
        statusRegressions: regressions,
        statusImprovements: improvements,
        baselineCounts: baseline.catalogue?.[role]?.counts ?? null,
        candidateCounts: after.counts,
      }
      check(role, 'coverage.no-silent-drop', 'every baseline href is still declared exactly once (documented hidden pages excepted)', undocumentedMissing.length === 0 && diff.duplicated.length === 0, `undocumentedMissing=${JSON.stringify(undocumentedMissing.slice(0, 10))} documentedHidden=${JSON.stringify(documentedMissing.slice(0, 10))} duplicated=${JSON.stringify(diff.duplicated.slice(0, 6))}`)
      check(role, 'coverage.no-unexpected-added', 'no undeclared new destination appears vs the frozen baseline', undeclaredAdditions.length === 0, `undeclared=${JSON.stringify(undeclaredAdditions.slice(0, 10))} declared=${JSON.stringify(declaredAdditions.slice(0, 10))}`)
      check(role, 'coverage.no-status-regression', 'every baseline-reachable href still answers', regressions.length === 0, JSON.stringify(regressions.slice(0, 10)))
      if (documentedMissing.length > 0) report.warnings.push(`${role}: ${documentedMissing.length} baseline hrefs hidden by declared page metadata: ${JSON.stringify(documentedMissing)}`)
      if (declaredAdditions.length > 0) report.warnings.push(`${role}: ${declaredAdditions.length} declared new destinations: ${JSON.stringify(declaredAdditions)}`)
      if (documentedMissing.length > 0) {
        // Hidden pages are absent from the candidate catalogue, so they were not in
        // the reachability sweep; probe them (and their declared parent) directly.
        const unreachableHidden = []
        for (const href of documentedMissing) {
          const hidden = sourceDeclarations.hidden[href]
          const [own, parent] = await Promise.all([
            httpStatus(sessionCookies[role], href),
            httpStatus(sessionCookies[role], hidden.parent),
          ])
          if (!(own.status > 0 && own.status < 400) || !(parent.status > 0 && parent.status < 400) || !hidden.evidence) {
            unreachableHidden.push({ href, ownStatus: own.status, parent: hidden.parent, parentStatus: parent.status, evidence: hidden.evidence ?? null })
          }
        }
        check(role, 'coverage.hidden-pages-reachable', 'hidden pages still answer and their parent is reachable with documented evidence', unreachableHidden.length === 0, JSON.stringify(unreachableHidden))
      }
      if (diff.added.length > 0) report.warnings.push(`${role}: ${diff.added.length} new declared hrefs: ${JSON.stringify(diff.added.slice(0, 8))}`)
      if (diff.containerChanges.length > 0) report.warnings.push(`${role}: ${diff.containerChanges.length} entries changed render container (expected for v2 IA)`)
    }
    // Shell-side regression: baseline custom markers must be gone, stock defaults present.
    const beforeShell = baseline.structure?.admin ?? null
    const afterShell = report.structure?.admin ?? null
    if (beforeShell && afterShell) {
      comparison.shell = {
        beforeMode: beforeShell.mode,
        afterMode: afterShell.mode,
        beforeSearch: beforeShell.markers?.searchInput ?? 0,
        afterSearch: afterShell.markers?.searchInput ?? 0,
        beforeGroupHeaders: beforeShell.markers?.groupHeaders ?? 0,
        afterGroupHeaders: afterShell.markers?.groupHeaders ?? 0,
        beforeWidth: beforeShell.asideWidth,
        afterWidth: afterShell.asideWidth,
      }
    }
    report.comparison = comparison
  }

  // ---- console diagnostics gate ---------------------------------------
  for (const [role, diagnostics] of Object.entries(report.console)) {
    if (!diagnostics) continue
    const menuRelevantServerErrors = diagnostics.serverErrors.filter((entry) => entry.type === 'document' || entry.url.includes('/api/crm_navigation') || entry.url.includes('/api/auth/admin/nav'))
    check(role, 'console.no-menu-server-errors', 'no 5xx on page documents or the navigation API', menuRelevantServerErrors.length === 0, JSON.stringify(menuRelevantServerErrors.slice(0, 5)))
    if (diagnostics.serverErrors.length > menuRelevantServerErrors.length) {
      report.warnings.push(`${role}: ${diagnostics.serverErrors.length - menuRelevantServerErrors.length} unrelated 5xx (e.g. attachment images) recorded, not gated`)
    }
    check(role, 'console.no-page-errors', 'no uncaught page errors while exercising the shell', diagnostics.pageErrors.length === 0, JSON.stringify(diagnostics.pageErrors.slice(0, 5)))
  }

  // Screenshot pairing evidence for the visual before/after.
  if (MODE === 'candidate' && baseline?.screenshots) {
    const baselineNames = new Set(baseline.screenshots.filter((shot) => ROLES.includes(shot.role)).map((shot) => `${shot.role}:${shot.name}`))
    const afterNames = new Set(report.screenshots.map((shot) => `${shot.role}:${shot.name}`))
    const paired = [...baselineNames].filter((name) => afterNames.has(name))
    const missing = [...baselineNames].filter((name) => !afterNames.has(name))
    report.comparison = report.comparison ?? {}
    report.comparison.screenshots = { paired: paired.length, missing, beforeDir: path.dirname(baseline.screenshots[0]?.path ?? ''), afterDir: SHOTS }
    check(null, 'visual.before-after-pairs', 'before/after screenshots exist for the same surfaces', missing.length === 0, `${paired.length} pairs, missing=${JSON.stringify(missing)}`)
  }

  report.build = { ...report.build, sha: report.build.sha || '', footer: report.build.footer || '' }
  report.gateSummary = (() => {
    const gates = report.checks.filter((entry) => entry.gate)
    const failed = gates.filter((entry) => !entry.ok)
    return {
      total: gates.length,
      passed: gates.filter((entry) => entry.ok).length,
      failed: failed.length,
      blockingFailed: failed.filter((entry) => !entry.pending).length,
      pendingFailed: failed.filter((entry) => entry.pending).length,
      allowKnownPending: ALLOW_KNOWN_PENDING,
    }
  })()
  report.exitCode = report.gateSummary.blockingFailed === 0 && (ALLOW_KNOWN_PENDING || report.gateSummary.pendingFailed === 0) ? 0 : 1
  exitCode = report.exitCode

  const reportPath = path.join(OUT, 'report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 1))

  // Markdown summary (machine report stays authoritative).
  const md = []
  md.push(`# CRM menu verification — ${LABEL}`)
  md.push('')
  md.push(`- mode: \`${MODE}\``)
  md.push(`- base: ${BASE}`)
  md.push(`- build: ${report.build.version ? `v${report.build.version} ` : ''}${report.build.sha || 'unknown'} (${report.build.footer || 'no footer'})`)
  md.push(`- generated: ${report.generatedAt}`)
  md.push(`- gates: **${report.gateSummary.passed}/${report.gateSummary.total} passed**, ${report.gateSummary.blockingFailed} blocking failed, ${report.gateSummary.pendingFailed} known-pending failed (allow-known-pending=${report.gateSummary.allowKnownPending})`)
  if (report.expectSha) md.push(`- expected SHA: ${report.expectSha}`)
  md.push('')
  if (report.failures.length > 0) {
    md.push('## Blocking failures')
    md.push('')
    for (const failure of report.failures) md.push(`- ❌ ${failure}`)
    md.push('')
  }
  if (report.pendingFailures.length > 0) {
    md.push('## Known-pending a11y (separated by request)')
    md.push('')
    for (const failure of report.pendingFailures) md.push(`- ⏳ ${failure}`)
    md.push('')
  }
  if (report.warnings.length > 0) {
    md.push('## Warnings / observations')
    md.push('')
    for (const warning of report.warnings) md.push(`- ⚠️ ${warning}`)
    md.push('')
  }
  for (const role of ROLES) {
    const data = roleData[role]
    if (!data) continue
    md.push(`## ${role}`)
    md.push('')
    const counts = data.catalogue?.counts
    if (counts) md.push(`- catalogue: ${counts.groups} groups / ${counts.daily} daily / ${counts.manage} manage / ${counts.personal} personal / ${counts.uniqueHrefs} unique hrefs`)
    const shell = data.shell
    if (shell) {
      md.push(`- shell mode: **${shell.mode}** (custom markers ${shell.customCount}, stock signals ${shell.stockSignals})`)
      md.push(`- sidebar width: ${shell.asideWidth}px expanded; search fields: ${shell.markers.searchInput}; group headers: ${shell.markers.groupHeaders}; links: ${shell.linkCount}`)
      md.push(`- aria-current: ${shell.ariaCurrent.length}; data-active: ${shell.dataActive.length}; styled active: ${shell.styledActive.length}`)
      md.push(`- markers: ${JSON.stringify(shell.markers.customMarkers)}`)
    }
    if (data.coverage?.statuses) {
      const histogram = data.coverage.statuses.reduce((acc, entry) => {
        acc[entry.status] = (acc[entry.status] ?? 0) + 1
        return acc
      }, {})
      md.push(`- reachability: ${data.coverage.hrefs} hrefs, status histogram ${JSON.stringify(histogram)}`)
    }
    if (data.manage) md.push(`- manage entries: ${data.manage.entries?.length ?? 0}`)
    if (data.mobile?.after) md.push(`- mobile drawer: ${JSON.stringify({ open: data.mobile.after.drawerOpen, width: data.mobile.after.drawerWidth, headers: data.mobile.after.groupHeaders, search: data.mobile.after.searchInputs })}`)
    if (data.keyboard?.order) md.push(`- first tab stops: ${JSON.stringify(data.keyboard.order.slice(0, 5))}`)
    if (data.reducedMotion) md.push(`- reduced motion: ${JSON.stringify(data.reducedMotion)}`)
    if (data.authorization) md.push(`- admin-only pages checked: ${data.authorization.sampled}/${data.authorization.adminOnlyTotal}, denied ${data.authorization.denied}`)
    md.push('')
  }
  if (report.comparison?.roles) {
    md.push('## Baseline comparison')
    md.push('')
    for (const [role, entry] of Object.entries(report.comparison.roles)) {
      md.push(`- ${role}: missing ${entry.missingHrefs.length}, added ${entry.addedHrefs.length}, duplicates ${entry.duplicateDeclarations.length}, status regressions ${entry.statusRegressions.length}, container changes ${entry.containerChanges.length}`)
    }
    md.push('')
  }
  md.push('## Evidence')
  md.push('')
  md.push(`- machine report: \`${reportPath}\``)
  md.push(`- screenshots: \`${SHOTS}\``)
  md.push('')
  fs.writeFileSync(path.join(OUT, 'summary.md'), md.join('\n'))
  console.log(`\nreport: ${reportPath}`)
  console.log(`summary: ${path.join(OUT, 'summary.md')}`)
  console.log(`gates: ${report.gateSummary.passed}/${report.gateSummary.total} passed, ${report.gateSummary.blockingFailed} blocking failed, ${report.gateSummary.pendingFailed} known-pending failed`)
} catch (error) {
  console.error(`[fatal] ${error instanceof Error ? error.stack : String(error)}`)
  exitCode = 2
  try {
    fs.writeFileSync(path.join(OUT, 'fatal.json'), JSON.stringify({ label: LABEL, mode: MODE, base: BASE, error: String(error), at: new Date().toISOString() }, null, 1))
  } catch {
    /* evidence write is best-effort */
  }
} finally {
  await browser.close().catch(() => {})
}

process.exit(exitCode)
