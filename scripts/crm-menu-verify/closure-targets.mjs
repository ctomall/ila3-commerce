#!/usr/bin/env node
/**
 * T3 targeted, read-only interaction evidence for the acceptance closure.
 *
 * This complements `menu-sidebar-verify.mjs` (the full suite) with the specific
 * checks T3 owns:
 *
 *   - desktop sidebar geometry 240px -> 80px -> reload -> 240px, with the
 *     persisted `om:sidebarCollapsed` localStorage value and the
 *     `om_sidebar_collapsed` cookie value recorded verbatim;
 *   - sidebar search filtering and group restoration after clearing;
 *   - a navigation group expanding and collapsing (aria-expanded);
 *   - `aria-current="page"` uniqueness on a detail page and after browser Back;
 *   - the account menu: Change Password page, Theme toggle, Language submenu
 *     (Theme/Language are in-menu controls, not routes; the locale is never
 *     POSTed so no account preference is written);
 *   - the retryable navigation error card, triggered by a Playwright route
 *     interception of the navigation API (no production config change), and
 *     recovery after the interception is removed;
 *   - `account.profile-settled`: every personal href must stop showing a
 *     loading indicator and render rows, an explicit empty state, a form, or a
 *     retryable error — the gate that makes an infinite spinner impossible to
 *     pass the acceptance suite;
 *   - `entry.click-through`: expand the messages group, click the omnichannel
 *     inbox, click the management hub (must render its 10 categories), and
 *     reach the profile surface from the account menu — for admin and employee;
 *   - mobile 390x844: drawer open, overlay click close, Escape close, drawer
 *     inner scroll, and a table that is measured (scrollWidth > clientWidth)
 *     and actually scrolled, not inferred from a screenshot.
 *
 * Only GET navigations and client-side UI state are touched. Login uses the
 * protected credential helper. The locale switch is intentionally NOT clicked
 * because it POSTs to /api/auth/locale (an account write). The browser is
 * always closed in finally.
 *
 * Usage
 *   node scripts/crm-menu-verify/closure-targets.mjs \
 *     --base http://127.0.0.1:3000 --label t3-production-fc504d2 \
 *     --out /storage/artifacts/pro/menu-declaration-audit/acceptance-closure
 *
 * Exit codes: 0 every check passed, 1 at least one check failed,
 *             2 infrastructure error (browser/login/report).
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { chromium } from 'playwright'
import { credentials, loginWithRetry } from '../lib/session.mjs'
import { waitSettled } from './profile-settled.mjs'

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

const BASE = String(arg('--base', process.env.CRM_NAV_BASE_URL ?? 'http://127.0.0.1:3000')).replace(/\/+$/, '')
const LABEL = arg('--label', `t3-${new Date().toISOString().slice(0, 10)}`)
const OUT_ROOT = path.resolve(arg('--out', '/storage/artifacts/pro/menu-declaration-audit/acceptance-closure'))
const ROLES = String(arg('--roles', 'admin,employee')).split(',').map((role) => role.trim()).filter(Boolean)
const PROFILE_SETTLE_TIMEOUT = Number(arg('--profile-settle-timeout', '9000'))
const SKIP_MOBILE = process.argv.includes('--skip-mobile')
const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }
const NAV_API = '/api/crm_navigation/navigation'
const DENY_RE = /Access Denied|You do not have permission|没有权限|无权访问|权限不足|Forbidden/i
const INBOX_PATH = '/backend/communications/inbox'
const MANAGE_PATH = '/backend/manage'
const PROFILE_PATH = '/backend/profile'
const CHANGE_PASSWORD_PATH = '/backend/profile/change-password'
const CHANNELS_PATH = '/backend/profile/communication-channels'

const OUT = path.join(OUT_ROOT, LABEL)
const SHOTS = path.join(OUT, 'shots')
fs.mkdirSync(SHOTS, { recursive: true })

const report = {
  schemaVersion: 1,
  tool: 'closure-targets',
  label: LABEL,
  base: BASE,
  generatedAt: new Date().toISOString(),
  viewports: { desktop: DESKTOP, mobile: MOBILE },
  roles: {},
  checks: [],
  failures: [],
  screenshots: [],
  environment: {},
  exitCode: null,
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const short = (value, max = 500) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

function check(role, id, name, ok, detail = '') {
  const entry = { role, id, name, ok: Boolean(ok), detail: short(detail), at: new Date().toISOString() }
  report.checks.push(entry)
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${role ?? 'shell'}] ${id} ${name}${entry.detail ? ` — ${entry.detail}` : ''}`)
  if (!ok) report.failures.push(`${role ?? 'shell'}: ${id} ${name} — ${entry.detail}`)
  return ok
}

async function shot(page, role, name) {
  const file = path.join(SHOTS, `${LABEL}-${role}-${name}.png`)
  await page.screenshot({ path: file, animations: 'disabled' })
  const entry = { role, name, path: file, sha256: sha256(file), url: page.url(), viewport: page.viewportSize(), at: new Date().toISOString() }
  report.screenshots.push(entry)
  return entry
}

async function waitReady(page, { timeout = 30000 } = {}) {
  try {
    await page.waitForFunction(
      () => {
        const nav = document.querySelector('aside nav[data-testid="sidebar"]')
        if (!nav) return false
        if (nav.getAttribute('data-crm-nav-state') === 'loading') return false
        const main = document.querySelector('main')
        if (!main) return false
        const text = (main.innerText ?? '').replace(/\s+/g, ' ').trim()
        if (text.length < 20) return false
        if (/正在加载|加载中|Loading table|Loading\.\.\./.test(text)) return false
        return !Array.from(main.querySelectorAll('.animate-spin, [role="status"]')).some((element) => {
          const rect = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden'
        })
      },
      undefined,
      { timeout },
    )
    await page.waitForTimeout(300)
    return true
  } catch {
    return false
  }
}

async function gotoReady(page, href, options = {}) {
  try {
    await page.goto(new URL(href, BASE).toString(), { waitUntil: 'domcontentloaded', timeout: options.timeout ?? 45000 })
  } catch (error) {
    return { ok: false, url: page.url(), error: short(error instanceof Error ? error.message : String(error), 200) }
  }
  const ok = await waitReady(page, options)
  return { ok, url: page.url() }
}

async function personalHrefs(context) {
  const response = await context.request.get(NAV_API)
  if (!response.ok()) throw new Error(`navigation API ${response.status()}`)
  const payload = await response.json()
  const items = payload?.crm?.personal?.items ?? []
  // Every personal href is covered. Non-table settings surfaces (for example
  // /backend/sidebar-customization) are recognised by the shared settle
  // predicate as a stable custom surface instead of a false "unknown".
  const hrefs = [...new Set([...items.map((item) => item.href).filter(Boolean), PROFILE_PATH, CHANGE_PASSWORD_PATH, CHANNELS_PATH])]
  return { hrefs, personal: items }
}

async function snapshotShell(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden'
    }
    const aside = document.querySelector('aside')
    const nav = document.querySelector('aside nav[data-testid="sidebar"]')
    const links = Array.from(nav?.querySelectorAll('a[href]') ?? []).filter(visible)
    return {
      asideWidth: aside ? Math.round(aside.getBoundingClientRect().width) : null,
      linkCount: links.length,
      groups: Array.from(nav?.querySelectorAll('[data-sidebar-group="true"]') ?? []).map((group) => ({
        label: ((group.querySelector('button')?.innerText ?? group.innerText ?? '') || '').replace(/\s+/g, ' ').trim().slice(0, 60),
        ariaExpanded: group.querySelector('button')?.getAttribute('aria-expanded') ?? null,
      })),
      ariaCurrent: Array.from(nav?.querySelectorAll('a[aria-current]') ?? []).map((element) => ({
        href: element.getAttribute('href'),
        value: element.getAttribute('aria-current'),
        text: (element.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
      })),
      searchInputs: Array.from(aside?.querySelectorAll('input') ?? []).filter(visible).map((input) => ({
        type: input.type,
        placeholder: input.getAttribute('placeholder'),
        ariaLabel: input.getAttribute('aria-label'),
      })),
    }
  })
}

async function mobileSnapshot(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden'
    }
    const drawer = Array.from(document.querySelectorAll('aside')).find((element) => visible(element) && element.closest('.fixed'))
    const backdrop = Array.from(document.querySelectorAll('div')).find((element) => {
      const style = getComputedStyle(element)
      return style.position === 'absolute' && style.inset === '0px' && /bg-black/.test(element.className ?? '')
    })
    return {
      drawerOpen: Boolean(drawer),
      drawerWidth: drawer ? Math.round(drawer.getBoundingClientRect().width) : null,
      closeButton: Boolean(drawer?.querySelector('button[aria-label="关闭菜单"], button[aria-label*="Close"]')),
      backdrop: Boolean(backdrop),
      backdropClass: backdrop ? String(backdrop.className).slice(0, 120) : null,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }
  })
}

async function findDrawerScroller(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect()
      return rect.width > 1 && rect.height > 1
    }
    const drawer = Array.from(document.querySelectorAll('aside')).find((element) => visible(element) && element.closest('.fixed'))
    if (!drawer) return { found: false, reason: 'drawer not open' }
    let element = drawer.querySelector('nav[data-testid="sidebar"]')
    while (element && element !== drawer) {
      const style = getComputedStyle(element)
      if (element.scrollHeight > element.clientHeight + 1 && /auto|scroll/.test(style.overflowY)) {
        return { found: true, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, scrollTop: element.scrollTop, className: String(element.className).slice(0, 120) }
      }
      element = element.parentElement
    }
    // Fall back to the tallest scrollable child of the drawer.
    const candidates = Array.from(drawer.querySelectorAll('*')).filter((node) => {
      const style = getComputedStyle(node)
      return node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(style.overflowY)
    })
    if (candidates.length === 0) return { found: false, reason: 'no scrollable region inside the drawer' }
    const target = candidates[0]
    return { found: true, scrollHeight: target.scrollHeight, clientHeight: target.clientHeight, scrollTop: target.scrollTop, className: String(target.className).slice(0, 120) }
  })
}

async function scrollDrawer(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect()
      return rect.width > 1 && rect.height > 1
    }
    const drawer = Array.from(document.querySelectorAll('aside')).find((element) => visible(element) && element.closest('.fixed'))
    if (!drawer) return { found: false, reason: 'drawer not open' }
    const candidates = Array.from(drawer.querySelectorAll('*')).filter((node) => {
      const style = getComputedStyle(node)
      return node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(style.overflowY)
    })
    if (candidates.length === 0) return { found: false, reason: 'no scrollable region' }
    const target = candidates[0]
    const before = target.scrollTop
    target.scrollTop = target.scrollHeight
    return { found: true, scrollHeight: target.scrollHeight, clientHeight: target.clientHeight, before, after: target.scrollTop, className: String(target.className).slice(0, 120) }
  })
}

/** Finds the horizontal scroller that contains the first main table. */
async function tableScrollProbe(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden'
    }
    const table = Array.from(document.querySelectorAll('main table')).find(visible)
    if (!table) return { found: false, reason: 'no visible table' }
    let element = table
    let scroller = null
    while (element && element !== document.body) {
      const style = getComputedStyle(element)
      if (element.scrollWidth > element.clientWidth + 1 && /auto|scroll/.test(style.overflowX)) {
        scroller = element
        break
      }
      element = element.parentElement
    }
    const target = scroller ?? table.parentElement
    if (!target) return { found: false, reason: 'no table scroller' }
    const before = target.scrollLeft
    target.scrollLeft = target.scrollWidth
    return {
      found: true,
      tableWidth: Math.round(table.getBoundingClientRect().width),
      scrollWidth: target.scrollWidth,
      clientWidth: target.clientWidth,
      overflowX: getComputedStyle(target).overflowX,
      before,
      after: target.scrollLeft,
      scrollable: target.scrollWidth > target.clientWidth + 1,
      actualScroll: target.scrollLeft > before,
      headers: Array.from(table.querySelectorAll('thead th')).map((th) => (th.innerText ?? '').trim()).filter(Boolean),
      className: String(target.className).slice(0, 140),
    }
  })
}

async function toggleGroup(page, labelFragment) {
  return page.evaluate((fragment) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect()
      return rect.width > 1 && rect.height > 1
    }
    const groups = Array.from(document.querySelectorAll('aside nav [data-sidebar-group="true"]')).filter(visible)
    const group = groups.find((element) => ((element.querySelector('button')?.innerText ?? element.innerText ?? '') || '').includes(fragment))
    if (!group) return { found: false, groups: groups.map((element) => ((element.querySelector('button')?.innerText ?? '') || '').trim().slice(0, 40)) }
    const button = group.querySelector('button')
    if (!button) return { found: false, reason: 'group has no button' }
    const before = button.getAttribute('aria-expanded')
    return { found: true, before, text: (button.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) }
  }, labelFragment)
}

async function runDesktop(role, context, credentialsMap) {
  const roleReport = { collapse: null, search: null, groupToggle: null, highlight: null, account: null, navError: null, profileSettled: null, clickThrough: null }
  report.roles[role] = roleReport
  const page = await context.newPage()
  page.setDefaultTimeout(45000)

  try {
    const workbench = await gotoReady(page, '/backend/workbench')
    check(role, 'workbench.renders', 'workbench renders with the sidebar', workbench.ok, workbench.url)
    let shell = await snapshotShell(page)
    if (shell.linkCount === 0) {
      await sleep(1500)
      shell = await snapshotShell(page)
    }
    report.environment[role] = { buildFooter: await page.evaluate(() => (document.querySelector('footer')?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)) }

    // ---- collapse round trip ------------------------------------------
    const collapse = { expandedWidth: shell.asideWidth, collapsedWidth: null, persistedWidth: null, restoredWidth: null, before: null, after: null, afterReload: null, afterExpand: null }
    const readPersistence = async () =>
      page.evaluate(() => ({
        localStorage: localStorage.getItem('om:sidebarCollapsed'),
        cookie: (document.cookie.match(/(?:^|; )om_sidebar_collapsed=([^;]*)/) ?? [])[1] ?? null,
      }))
    collapse.before = await readPersistence()
    const toggle = page.locator('aside button[aria-label="切换侧边栏"]').first()
    // Client hydration renders the toggle after the SSR shell; a bare count() can race
    // it (observed once on admin while the same run passed for employee). Wait for it
    // with a bounded budget and retry once from a fresh document before failing.
    await toggle.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
    let togglePresent = (await toggle.count()) > 0
    if (!togglePresent) {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitReady(page)
      await toggle.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
      togglePresent = (await toggle.count()) > 0
      collapse.retriedAfterMissingToggle = true
    }
    collapse.togglePresent = togglePresent
    if (togglePresent) {
      await toggle.click()
      await page.waitForFunction(() => Math.round(document.querySelector('aside')?.getBoundingClientRect().width ?? 0) <= 82, undefined, { timeout: 5000 }).catch(() => {})
      collapse.collapsedWidth = await page.evaluate(() => Math.round(document.querySelector('aside')?.getBoundingClientRect().width ?? 0))
      collapse.after = await readPersistence()
      await shot(page, role, 'sidebar-collapsed')

      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitReady(page)
      collapse.persistedWidth = await page.evaluate(() => Math.round(document.querySelector('aside')?.getBoundingClientRect().width ?? 0))
      collapse.afterReload = await readPersistence()
      await shot(page, role, 'sidebar-collapsed-reload')

      const expand = page.locator('aside button[aria-label="切换侧边栏"]').first()
      if ((await expand.count()) > 0) {
        await expand.click().catch(() => {})
        await page.waitForFunction(() => Math.round(document.querySelector('aside')?.getBoundingClientRect().width ?? 0) >= 200, undefined, { timeout: 5000 }).catch(() => {})
        await page.waitForTimeout(400)
        collapse.restoredWidth = await page.evaluate(() => Math.round(document.querySelector('aside')?.getBoundingClientRect().width ?? 0))
        collapse.afterExpand = await readPersistence()
        await shot(page, role, 'sidebar-expanded-restored')
      }
    }
    roleReport.collapse = collapse
    check(role, 'collapse.toggle-present', 'sidebar collapse toggle is present', togglePresent, 'aside button[aria-label="切换侧边栏"]')
    check(role, 'collapse.expanded-240', 'expanded sidebar is ~240px', Math.abs(Number(collapse.expandedWidth) - 240) <= 3, `width=${collapse.expandedWidth}`)
    check(role, 'collapse.collapsed-80', 'collapsed sidebar is ~80px', Math.abs(Number(collapse.collapsedWidth) - 80) <= 3, `width=${collapse.collapsedWidth}`)
    check(role, 'collapse.persisted-localStorage', 'collapse writes om:sidebarCollapsed=1', collapse.after?.localStorage === '1', JSON.stringify({ before: collapse.before, after: collapse.after }))
    check(role, 'collapse.persisted-cookie', 'collapse writes om_sidebar_collapsed=1', collapse.after?.cookie === '1', JSON.stringify({ before: collapse.before?.cookie, after: collapse.after?.cookie }))
    check(role, 'collapse.persists-reload', 'collapsed width survives a reload (80px)', Math.abs(Number(collapse.persistedWidth) - 80) <= 3, `width=${collapse.persistedWidth} persistence=${JSON.stringify(collapse.afterReload)}`)
    check(role, 'collapse.expand-restores', 'expanding restores ~240px and clears the flag', Math.abs(Number(collapse.restoredWidth) - 240) <= 3 && collapse.afterExpand?.localStorage === '0' && collapse.afterExpand?.cookie === '0', `width=${collapse.restoredWidth} persistence=${JSON.stringify(collapse.afterExpand)}`)

    // ---- search filter + clear ---------------------------------------
    const search = { before: null, filtered: null, cleared: null }
    const searchInput = page.locator('aside input[type="search"], aside input[placeholder*="搜索"], aside input[aria-label*="搜索"]').first()
    if ((await searchInput.count()) > 0) {
      search.before = await page.evaluate(() => ({
        groups: document.querySelectorAll('aside nav [data-sidebar-group="true"]').length,
        visibleLinks: Array.from(document.querySelectorAll('aside nav a[href]')).filter((a) => {
          const r = a.getBoundingClientRect()
          return r.width > 1 && r.height > 1
        }).length,
      }))
      await searchInput.fill('全渠道')
      await page.waitForTimeout(900)
      search.filtered = await page.evaluate(() => ({
        groups: document.querySelectorAll('aside nav [data-sidebar-group="true"]').length,
        visibleLinks: Array.from(document.querySelectorAll('aside nav a[href]')).filter((a) => {
          const r = a.getBoundingClientRect()
          return r.width > 1 && r.height > 1
        }).map((a) => ({ href: a.getAttribute('href'), text: (a.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) })),
      }))
      await shot(page, role, 'nav-search-filtered')
      await searchInput.fill('')
      await page.waitForTimeout(900)
      search.cleared = await page.evaluate(() => ({ groups: document.querySelectorAll('aside nav [data-sidebar-group="true"]').length }))
      await shot(page, role, 'nav-search-cleared')
    }
    roleReport.search = search
    check(role, 'nav.search-present', 'sidebar search input is present', (await searchInput.count()) > 0, JSON.stringify(shell.searchInputs))
    check(role, 'nav.search-filters', 'search "全渠道" filters to the omnichannel inbox', Boolean(search.filtered) && search.filtered.visibleLinks.some((link) => link.href === INBOX_PATH), JSON.stringify(search.filtered))
    check(role, 'nav.search-clear-restores', 'clearing the search restores all groups', Boolean(search.cleared) && search.cleared.groups === search.before?.groups, JSON.stringify({ before: search.before?.groups, cleared: search.cleared?.groups }))

    // ---- group expand / collapse -------------------------------------
    const groupToggle = { open: null, close: null }
    const group = await toggleGroup(page, '消息')
    if (group.found) {
      await page.evaluate((fragment) => {
        const groups = Array.from(document.querySelectorAll('aside nav [data-sidebar-group="true"]'))
        const target = groups.find((element) => ((element.querySelector('button')?.innerText ?? element.innerText ?? '') || '').includes(fragment))
        target?.querySelector('button')?.click()
      }, '消息')
      await page.waitForTimeout(600)
      groupToggle.open = await page.evaluate(() => {
        const groups = Array.from(document.querySelectorAll('aside nav [data-sidebar-group="true"]'))
        const target = groups.find((element) => ((element.querySelector('button')?.innerText ?? '') || '').includes('消息'))
        return { ariaExpanded: target?.querySelector('button')?.getAttribute('aria-expanded') ?? null, visibleLinks: Array.from(document.querySelectorAll('aside nav a[href]')).filter((a) => {
          const r = a.getBoundingClientRect()
          return r.width > 1 && r.height > 1
        }).length }
      })
      await shot(page, role, 'nav-group-expanded')
      await page.evaluate((fragment) => {
        const groups = Array.from(document.querySelectorAll('aside nav [data-sidebar-group="true"]'))
        const target = groups.find((element) => ((element.querySelector('button')?.innerText ?? '') || '').includes(fragment))
        target?.querySelector('button')?.click()
      }, '消息')
      await page.waitForTimeout(600)
      groupToggle.close = await page.evaluate(() => {
        const groups = Array.from(document.querySelectorAll('aside nav [data-sidebar-group="true"]'))
        const target = groups.find((element) => ((element.querySelector('button')?.innerText ?? '') || '').includes('消息'))
        return { ariaExpanded: target?.querySelector('button')?.getAttribute('aria-expanded') ?? null }
      })
    }
    roleReport.groupToggle = groupToggle
    check(role, 'nav.group-toggle', 'a group expands and collapses via aria-expanded', group.found && groupToggle.open?.ariaExpanded === 'true' && groupToggle.close?.ariaExpanded === 'false', JSON.stringify({ before: group.before, open: groupToggle.open, close: groupToggle.close }))

    // ---- detail highlight + browser back -----------------------------
    const highlight = { detail: null, back: null }
    const detail = await gotoReady(page, INBOX_PATH)
    if (detail.ok) {
      highlight.detail = await page.evaluate(() => ({
        pathname: location.pathname,
        ariaCurrent: Array.from(document.querySelectorAll('aside nav a[aria-current]')).map((a) => ({ href: a.getAttribute('href'), value: a.getAttribute('aria-current'), text: (a.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) })),
      }))
      await shot(page, role, 'inbox-highlight')
    }
    // Back-stack check: workbench -> inbox -> Back.
    await gotoReady(page, '/backend/workbench')
    await gotoReady(page, INBOX_PATH)
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    await waitReady(page)
    highlight.back = await page.evaluate(() => ({
      pathname: location.pathname,
      ariaCurrent: Array.from(document.querySelectorAll('aside nav a[aria-current]')).map((a) => ({ href: a.getAttribute('href'), value: a.getAttribute('aria-current'), text: (a.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) })),
    }))
    await shot(page, role, 'back-highlight')
    roleReport.highlight = highlight
    const detailCurrent = highlight.detail?.ariaCurrent ?? []
    check(role, 'nav.aria-current-unique', 'detail page has exactly one aria-current="page"', detailCurrent.length === 1 && detailCurrent[0]?.href === INBOX_PATH, JSON.stringify(detailCurrent))
    const backCurrent = highlight.back?.ariaCurrent ?? []
    check(role, 'nav.aria-current-after-back', 'after browser Back the highlight follows the current route', backCurrent.length === 1 && ['/backend', '/backend/workbench'].includes(backCurrent[0]?.href), JSON.stringify({ pathname: highlight.back?.pathname, ariaCurrent: backCurrent }))

    // ---- account menu -------------------------------------------------
    const account = { items: [], changePassword: null, theme: null, language: null }
    await gotoReady(page, '/backend/workbench')
    const trigger = page.locator('header button[aria-haspopup="menu"]').first()
    if ((await trigger.count()) > 0) {
      await trigger.click()
      await page.waitForTimeout(600)
      account.items = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] a, [role="menu"] button')).map((element) => ({
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute('role'),
          text: (element.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
          href: element.getAttribute('href'),
          ariaExpanded: element.getAttribute('aria-expanded'),
        })),
      )
      await shot(page, role, 'account-menu-open')
      // Change Password opens the real page.
      const changePassword = page.locator('[role="menu"] a[href="/backend/profile/change-password"]').first()
      if ((await changePassword.count()) > 0) {
        await changePassword.click()
        await page.waitForURL('**/backend/profile/change-password', { timeout: 20000 }).catch(() => {})
        const settled = await waitSettled(page, { timeout: PROFILE_SETTLE_TIMEOUT })
        const text = await page.evaluate(() => (document.querySelector('main')?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 300))
        account.changePassword = { url: page.url(), settled: settled.settled, surface: settled.surface, waitedMs: settled.waitedMs, text }
        await shot(page, role, 'change-password-page')
      }
      // Theme is an in-menu toggle: flip it, observe the document class, restore.
      await gotoReady(page, '/backend/workbench')
      await trigger.click().catch(() => {})
      await page.waitForTimeout(500)
      const themeSwitch = page.locator('[data-testid="profile-dropdown"] [role="switch"], [role="menu"] [role="switch"]').first()
      const themeItemPresent = (await page.locator('[data-testid="profile-dropdown"] [role="menuitem"]').filter({ hasText: /Theme|主题/ }).count()) > 0
      if ((await themeSwitch.count()) > 0) {
        const before = await page.evaluate(() => ({ dark: document.documentElement.classList.contains('dark'), stored: localStorage.getItem('om-theme') }))
        await themeSwitch.click()
        await page.waitForTimeout(500)
        const after = await page.evaluate(() => ({ dark: document.documentElement.classList.contains('dark'), stored: localStorage.getItem('om-theme') }))
        await shot(page, role, 'account-theme-toggled')
        await themeSwitch.click().catch(() => {})
        await page.waitForTimeout(400)
        const restored = await page.evaluate(() => ({ dark: document.documentElement.classList.contains('dark'), stored: localStorage.getItem('om-theme') }))
        account.theme = { present: themeItemPresent, before, after, restored }
      } else {
        account.theme = { present: themeItemPresent, toggled: false }
      }
      // Language opens an in-menu submenu; never POST the locale (account write).
      await gotoReady(page, '/backend/workbench')
      await trigger.click().catch(() => {})
      await page.waitForTimeout(500)
      const languageButton = page.locator('[data-testid="profile-dropdown"] button').filter({ hasText: /Language|语言/ }).first()
      const languagePresent = (await languageButton.count()) > 0
      if (languagePresent) {
        await languageButton.click()
        await page.waitForTimeout(500)
        const submenu = await page.evaluate(() => ({
          ariaExpanded: Array.from(document.querySelectorAll('[role="menu"] button')).find((button) => /Language|语言/.test(button.innerText ?? ''))?.getAttribute('aria-expanded') ?? null,
          options: Array.from(document.querySelectorAll('[role="menu"] button, [role="menu"] a')).map((element) => (element.innerText ?? '').replace(/\s+/g, ' ').trim()).filter((text) => /English|中文|Polski|Español|Deutsch|한국어/i.test(text)).slice(0, 12),
          menuText: (document.querySelector('[role="menu"]')?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
        }))
        account.language = { present: true, ...submenu, localePostWritten: false }
        await shot(page, role, 'account-language-submenu')
      } else {
        account.language = { present: false }
      }
      await page.keyboard.press('Escape').catch(() => {})
    }
    roleReport.account = account
    const menuText = account.items.map((item) => item.text).join(' | ')
    check(role, 'account.menu-items', 'account menu exposes Change Password / Theme / Language', /Change Password|修改密码/.test(menuText) && /Theme|主题/.test(menuText) && /Language|语言/.test(menuText), menuText)
    const localizedMenu =
      /修改密码/.test(menuText) &&
      /主题/.test(menuText) &&
      /语言/.test(menuText) &&
      !/Change Password/.test(menuText) &&
      !/\bTheme\b/.test(menuText) &&
      !/\bLanguage\b/.test(menuText)
    check(role, 'account.menu-localized', 'zh session shows a localized account menu with no English fallback', localizedMenu, menuText)
    check(role, 'account.change-password-page', 'Change Password page loads (settled, not denied)', Boolean(account.changePassword) && account.changePassword.settled && !DENY_RE.test(account.changePassword.text), JSON.stringify(account.changePassword))
    check(role, 'account.theme-toggle', 'Theme switch toggles the document theme and restores', Boolean(account.theme?.before) && account.theme.before.dark !== account.theme.after?.dark && account.theme.restored?.dark === account.theme.before.dark, JSON.stringify(account.theme))
    check(role, 'account.language-submenu', 'Language opens a locale submenu without writing the locale', Boolean(account.language?.present) && account.language.ariaExpanded === 'true' && account.language.options.length > 0 && account.language.localePostWritten === false, JSON.stringify({ ariaExpanded: account.language?.ariaExpanded, options: account.language?.options }))

    // ---- navigation API failure card + recovery -----------------------
    const navError = { injected: 0, card: null, recovery: null }
    const failurePage = await context.newPage()
    const fallback = {
      groups: [], settingsSections: [], profileSections: [], settingsPathPrefixes: [], profilePathPrefixes: [], grantedFeatures: [],
      crm: {
        version: 2, error: true, groups: [], railActions: [], utility: [],
        manage: { categories: [] }, personal: { items: [] },
        unknown: [], unconfiguredGroups: [], actions: [], authorized: [], duplicates: [],
      },
    }
    try {
      await failurePage.route('**/api/crm_navigation/navigation*', (route) => {
        navError.injected += 1
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fallback) })
      })
      await failurePage.goto(`${BASE}/backend`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await failurePage.waitForSelector('[data-crm-nav-error]', { state: 'attached', timeout: 15000 })
      navError.card = await failurePage.evaluate(() => {
        const card = document.querySelector('[data-crm-nav-error]')
        return {
          present: Boolean(card),
          text: (card?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 300),
          retryControl: Boolean(card?.querySelector('button, a')),
          retryText: (card?.querySelector('button, a')?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
        }
      })
      await shot(failurePage, role, 'nav-error-card')
      await failurePage.unroute('**/api/crm_navigation/navigation*')
      navError.recovery = await (async () => {
        const retry = failurePage.locator('[data-crm-nav-error] button, [data-crm-nav-error] a').first()
        if ((await retry.count()) > 0) await retry.click().catch(() => {})
        await failurePage.waitForSelector('[data-crm-nav-error]', { state: 'detached', timeout: 20000 }).catch(() => {})
        await waitReady(failurePage)
        return failurePage.evaluate(() => ({
          errorCardPresent: Boolean(document.querySelector('[data-crm-nav-error]')),
          groups: document.querySelectorAll('aside nav [data-sidebar-group="true"]').length,
          links: Array.from(document.querySelectorAll('aside nav a[href]')).filter((a) => {
            const r = a.getBoundingClientRect()
            return r.width > 1 && r.height > 1
          }).length,
        }))
      })()
      await shot(failurePage, role, 'nav-error-recovered')
    } catch (error) {
      navError.error = short(error instanceof Error ? error.message : String(error), 200)
    } finally {
      await failurePage.close().catch(() => {})
    }
    roleReport.navError = navError
    check(role, 'nav.error-card', 'navigation API failure renders the retryable error card', Boolean(navError.card?.present) && /导航加载失败/.test(navError.card.text) && navError.card.retryControl, JSON.stringify({ ...navError.card, injected: navError.injected }))
    check(role, 'nav.error-recovery', 'removing the failure and retrying restores the sidebar', Boolean(navError.recovery) && navError.recovery.errorCardPresent === false && navError.recovery.groups > 0, JSON.stringify(navError.recovery))

    // ---- account.profile-settled --------------------------------------
    const { hrefs, personal } = await personalHrefs(context)
    const profileSettled = { hrefs, personal, results: [] }
    for (const href of hrefs) {
      const navigation = await gotoReady(page, href)
      const settled = await waitSettled(page, { timeout: PROFILE_SETTLE_TIMEOUT })
      profileSettled.results.push({
        href,
        navigationOk: navigation.ok,
        settled: settled.settled,
        waitedMs: settled.waitedMs,
        loadingIndicators: settled.loadingIndicators ?? null,
        loadingText: settled.loadingText ?? null,
        surface: settled.surface ?? null,
        text: settled.text ?? '',
      })
      if (href === CHANNELS_PATH) await shot(page, role, 'profile-communication-channels')
    }
    roleReport.profileSettled = profileSettled
    const unsettled = profileSettled.results.filter((entry) => !entry.settled)
    check(role, 'account.profile-settled', 'every personal page settles (rows / empty / form / retryable error)', unsettled.length === 0, JSON.stringify(unsettled.map((entry) => ({ href: entry.href, waitedMs: entry.waitedMs, loadingIndicators: entry.loadingIndicators, surface: entry.surface, text: short(entry.text, 160) }))))
    await shot(page, role, 'profile-settled-last')

    // ---- entry.click-through -----------------------------------------
    const clickThrough = { inbox: null, manage: null, profile: null }
    await gotoReady(page, '/backend/workbench')
    // Expand the messages group, then click the omnichannel inbox link.
    const msg = await toggleGroup(page, '消息')
    if (msg.found) {
      await page.evaluate(() => {
        const groups = Array.from(document.querySelectorAll('aside nav [data-sidebar-group="true"]'))
        const target = groups.find((element) => ((element.querySelector('button')?.innerText ?? '') || '').includes('消息'))
        if (target?.querySelector('button')?.getAttribute('aria-expanded') !== 'true') target?.querySelector('button')?.click()
      })
      await page.waitForTimeout(600)
    }
    const inboxLink = page.locator(`aside nav a[href="${INBOX_PATH}"]`).first()
    if ((await inboxLink.count()) > 0) {
      const clickedText = (await inboxLink.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
      const from = page.url()
      await inboxLink.click()
      await page.waitForURL('**/backend/communications/inbox', { timeout: 20000 }).catch(() => {})
      const settled = await waitSettled(page, { timeout: PROFILE_SETTLE_TIMEOUT })
      const text = await page.evaluate(() => (document.querySelector('main')?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 400))
      clickThrough.inbox = { from, clickedText, finalUrl: page.url(), settled: settled.settled, surface: settled.surface, denied: DENY_RE.test(text), text }
      await shot(page, role, 'clickthrough-inbox')
    } else {
      clickThrough.inbox = { found: false, reason: 'no inbox link in the sidebar' }
    }
    // Management hub click.
    await gotoReady(page, '/backend/workbench')
    // 管理中心 is a collapsible group header whose landing link is revealed on
    // expand; clicking the header alone only toggles the group.
    const manageHeader = page.locator('aside [data-sidebar-group="true"] button').filter({ hasText: '管理中心' }).first()
    if ((await manageHeader.count()) > 0) {
      const expanded = await manageHeader.getAttribute('aria-expanded').catch(() => null)
      if (expanded !== 'true') await manageHeader.click().catch(() => {})
      await page.waitForTimeout(500)
    }
    const manageEntry = page.locator('aside a[href="/backend/manage"]').first()
    if ((await manageEntry.count()) > 0) {
      const from = page.url()
      await manageEntry.click()
      await page.waitForURL('**/backend/manage', { timeout: 20000 }).catch(() => {})
      const settled = await waitSettled(page, { timeout: PROFILE_SETTLE_TIMEOUT })
      const manage = await page.evaluate(() => ({
        entries: document.querySelectorAll('[data-manage-entry]').length,
        categories: document.querySelectorAll('main section').length,
        headings: Array.from(document.querySelectorAll('main h1, main h2, main h3')).map((h) => (h.innerText ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 20),
      }))
      clickThrough.manage = { from, finalUrl: page.url(), settled: settled.settled, ...manage }
      await shot(page, role, 'clickthrough-manage')
    } else {
      clickThrough.manage = { found: false, reason: 'no management hub entry in the sidebar' }
    }
    // Profile surface from the account menu (the menu exposes Change Password).
    await gotoReady(page, '/backend/workbench')
    const trigger2 = page.locator('header button[aria-haspopup="menu"]').first()
    if ((await trigger2.count()) > 0) {
      await trigger2.click()
      await page.waitForTimeout(500)
      const cp = page.locator('[role="menu"] a[href="/backend/profile/change-password"]').first()
      clickThrough.profile = { menuHasChangePassword: (await cp.count()) > 0, menuHasDirectProfile: (await page.locator('[role="menu"] a[href="/backend/profile"]').count()) > 0 }
    }
    const profileDirect = await gotoReady(page, PROFILE_PATH)
    clickThrough.profile = { ...clickThrough.profile, profileUrl: profileDirect.url, profileOk: profileDirect.ok, finalPath: new URL(profileDirect.url).pathname }
    roleReport.clickThrough = clickThrough
    // The employee must not be able to open an admin-only inbox; if the page denies, fail.
    check(role, 'entry.clickthrough-inbox', 'menu click lands on /backend/communications/inbox and settles', Boolean(clickThrough.inbox) && clickThrough.inbox.finalUrl === `${BASE}${INBOX_PATH}` && clickThrough.inbox.settled && !clickThrough.inbox.denied, JSON.stringify(clickThrough.inbox))
    // The management hub is authorization-filtered: admin must see all 10
    // categories, a restricted employee sees the subset its roles allow (and
    // nothing admin-only). Both must navigate and settle.
    const manageCategoriesOk = role === 'admin' ? clickThrough.manage?.categories === 10 : Number(clickThrough.manage?.categories) > 0
    check(role, 'entry.clickthrough-manage', 'management hub click lands on /backend/manage with its authorized categories', clickThrough.manage?.finalUrl === `${BASE}${MANAGE_PATH}` && clickThrough.manage?.settled && manageCategoriesOk, JSON.stringify({ expected: role === 'admin' ? 10 : 'authorized-subset', ...clickThrough.manage }))
    check(role, 'entry.clickthrough-profile', 'account menu reaches the profile surface (/backend/profile -> change-password)', clickThrough.profile?.menuHasChangePassword === true && clickThrough.profile?.profileOk === true && clickThrough.profile?.finalPath === CHANGE_PASSWORD_PATH, JSON.stringify(clickThrough.profile))

    // ---- negative control: a stalled channels request MUST fail the settle gate ----
    // The live page currently settles; this control proves the predicate is not
    // vacuous by holding /api/communication_channels/me/channels open and
    // requiring the same gate to report a loading surface.
    if (role === 'admin') {
      const controlPage = await context.newPage()
      const negative = { injected: 0, settled: null, surface: null, waitedMs: null, loadingIndicators: null }
      let release = () => {}
      const held = new Promise((resolve) => { release = resolve })
      try {
        await controlPage.route('**/api/communication_channels/me/channels*', async (route) => {
          negative.injected += 1
          await held
          await route.abort().catch(() => {})
        })
        await controlPage.goto(`${BASE}${CHANNELS_PATH}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await sleep(1200)
        const result = await waitSettled(controlPage, { timeout: 4000 })
        negative.settled = result.settled
        negative.surface = result.surface
        negative.waitedMs = result.waitedMs
        negative.loadingIndicators = result.loadingIndicators
        negative.text = short(result.text ?? '', 200)
        await shot(controlPage, role, 'profile-settled-negative-control')
      } catch (error) {
        negative.error = short(error instanceof Error ? error.message : String(error), 200)
      } finally {
        release()
        await controlPage.close().catch(() => {})
      }
      roleReport.profileSettled.negativeControl = negative
      check(role, 'account.profile-settled-negative-control', 'a stalled channels request is not settled (gate is not vacuous)', negative.injected > 0 && negative.settled === false && Number(negative.loadingIndicators) > 0, JSON.stringify(negative))
    }

    return roleReport
  } finally {
    await page.close().catch(() => {})
  }
}

async function runMobile(role, context) {
  const page = await context.newPage()
  page.setDefaultTimeout(45000)
  const mobile = { drawer: null, overlayClose: null, escapeClose: null, innerScroll: null, tableScroll: null }
  report.roles[role].mobile = mobile
  try {
    const ready = await gotoReady(page, '/backend/workbench')
    const before = await mobileSnapshot(page)
    const menuButton = page.locator('button[aria-label="打开菜单"], button[aria-label*="Open menu" i]').first()
    const menuPresent = (await menuButton.count()) > 0
    if (menuPresent) {
      await menuButton.click()
      await page.waitForTimeout(900)
      mobile.drawer = await mobileSnapshot(page)
      await shot(page, role, 'mobile-drawer-open')

      // Overlay click closes.
      const drawerWidth = mobile.drawer.drawerWidth ?? 280
      await page.mouse.click(Math.min(MOBILE.width - 10, drawerWidth + 40), Math.round(MOBILE.height / 2))
      await page.waitForTimeout(900)
      mobile.overlayClose = await mobileSnapshot(page)
      await shot(page, role, 'mobile-overlay-closed')

      // Escape closes (reopen first).
      if (!mobile.overlayClose.drawerOpen) {
        await menuButton.click()
        await page.waitForTimeout(700)
      }
      await page.locator('button[aria-label="关闭菜单"]').first().focus().catch(() => {})
      await page.keyboard.press('Escape')
      await page.waitForTimeout(900)
      mobile.escapeClose = await mobileSnapshot(page)
      await shot(page, role, 'mobile-escape-key')

      // Drawer inner scroll (reopen first).
      if (!mobile.escapeClose.drawerOpen) {
        await menuButton.click()
        await page.waitForTimeout(700)
      }
      mobile.innerScroll = await scrollDrawer(page)
      await shot(page, role, 'mobile-drawer-scrolled')
      // Close via the explicit close button so the page behind is usable.
      const close = page.locator('button[aria-label="关闭菜单"]').first()
      if ((await close.count()) > 0) {
        await close.click().catch(() => {})
        await page.waitForTimeout(600)
      }
    }

    // Table horizontal scroll on the communication-channels page.
    await gotoReady(page, CHANNELS_PATH)
    await sleep(1500)
    mobile.tableScroll = await tableScrollProbe(page)
    await shot(page, role, 'mobile-table-horizontal-scroll')
    mobile.pageOverflow = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }))
  } catch (error) {
    mobile.error = short(error instanceof Error ? error.message : String(error), 240)
  } finally {
    await page.close().catch(() => {})
  }

  check(role, 'mobile.drawer-opens', 'mobile drawer opens from the menu button', Boolean(mobile.drawer?.drawerOpen) && mobile.drawer?.drawerWidth === 280, JSON.stringify(mobile.drawer))
  check(role, 'mobile.overlay-close', 'clicking the backdrop closes the drawer', mobile.overlayClose?.drawerOpen === false, JSON.stringify(mobile.overlayClose))
  check(role, 'mobile.escape-close', 'pressing Escape closes the drawer', mobile.escapeClose?.drawerOpen === false, JSON.stringify(mobile.escapeClose))
  check(role, 'mobile.drawer-inner-scroll', 'the drawer content scrolls inside the drawer', Boolean(mobile.innerScroll?.found) && mobile.innerScroll.scrollHeight > mobile.innerScroll.clientHeight && mobile.innerScroll.after > mobile.innerScroll.before, JSON.stringify(mobile.innerScroll))
  check(role, 'mobile.table-horizontal-scroll', 'a table is wider than its container and actually scrolls horizontally', Boolean(mobile.tableScroll?.found) && mobile.tableScroll.scrollWidth > mobile.tableScroll.clientWidth && mobile.tableScroll.actualScroll === true, JSON.stringify({ scrollWidth: mobile.tableScroll?.scrollWidth, clientWidth: mobile.tableScroll?.clientWidth, before: mobile.tableScroll?.before, after: mobile.tableScroll?.after, headers: mobile.tableScroll?.headers }))
  check(role, 'mobile.page-no-horizontal-overflow', 'the page itself does not overflow horizontally', Boolean(mobile.pageOverflow) && mobile.pageOverflow.documentWidth <= mobile.pageOverflow.viewportWidth + 1, JSON.stringify(mobile.pageOverflow))
}

let browser
try {
  const creds = credentials()
  browser = await chromium.launch({ args: ['--no-sandbox'] })
  for (const role of ROLES) {
    const credential = creds.get(role)
    if (!credential) {
      check(role, 'infra.credentials', `credentials for ${role}`, false, `role ${role} missing from credential file`)
      continue
    }
    const cookie = await loginWithRetry(BASE, credential, { role })
    const cookies = cookie.split(';').map((pair) => {
      const [name, ...rest] = pair.trim().split('=')
      return { name, value: rest.join('='), domain: new URL(BASE).hostname, path: '/', httpOnly: false, secure: false, sameSite: 'Lax' }
    }).filter((entry) => entry.name)
    const desktopContext = await browser.newContext({ viewport: DESKTOP, baseURL: BASE, locale: 'zh-CN', extraHTTPHeaders: { 'Accept-Language': 'zh-CN,zh;q=0.9' } })
    try {
      await desktopContext.addCookies(cookies)
      await runDesktop(role, desktopContext, creds)
    } finally {
      await desktopContext.close().catch(() => {})
    }
    if (!SKIP_MOBILE) {
      const mobileContext = await browser.newContext({ viewport: MOBILE, baseURL: BASE, locale: 'zh-CN', isMobile: true, hasTouch: true, extraHTTPHeaders: { 'Accept-Language': 'zh-CN,zh;q=0.9' } })
      try {
        await mobileContext.addCookies(cookies)
        await runMobile(role, mobileContext)
      } finally {
        await mobileContext.close().catch(() => {})
      }
    }
  }
  report.exitCode = report.failures.length === 0 ? 0 : 1
} catch (error) {
  report.exitCode = 2
  report.error = short(error instanceof Error ? error.message : String(error), 400)
  console.error('[closure-targets] infrastructure error:', report.error)
} finally {
  if (browser) await browser.close().catch(() => {})
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
console.log(`[closure-targets] checks=${report.checks.length} failures=${report.failures.length} exit=${report.exitCode}`)
console.log(`[closure-targets] report: ${path.join(OUT, 'report.json')}`)
process.exit(report.exitCode)
