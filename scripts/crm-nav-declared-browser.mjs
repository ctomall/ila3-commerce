#!/usr/bin/env node
/**
 * Browser evidence for the declared CRM navigation (catalogue v2).
 *
 * This is a gate, not a screenshot tour. It logs in as the real admin and
 * employee accounts, reads the version-2 catalogue from the app, and asserts
 * that the rendered rail/content strip/management/business surfaces agree with
 * that catalogue. Every screenshot is taken only after the page's own content
 * is present and after an interaction that proves the surface is alive.
 *
 * Credentials are read from ~/.ila3-admin-credentials (0600) inside this
 * process and passed to the login API. They are never printed and never
 * written to the report.
 *
 * Usage:
 *   node scripts/crm-nav-declared-browser.mjs \
 *     --base http://127.0.0.1:3100 \
 *     --label candidate \
 *     --expect-sha <commit> \
 *     --out /storage/artifacts/pro/crm-declared-navigation-goal/shots
 *
 * Exit code is 1 when any check fails (unless --no-fail is passed). The report
 * is written even when checks fail, so a failed run still leaves evidence.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { chromium } from 'playwright'

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}
const BASE = String(arg('--base', process.env.CRM_NAV_BASE_URL ?? 'http://127.0.0.1:3000')).replace(/\/+$/, '')
const OUT = path.resolve(arg('--out', '/storage/artifacts/pro/crm-declared-navigation-goal/shots'))
const LABEL = arg('--label', 'candidate')
const EXPECT_SHA = String(arg('--expect-sha', '')).trim().toLowerCase()
const ROLES = String(arg('--roles', 'admin,employee')).split(',').map((role) => role.trim()).filter(Boolean)
const CREDS_PATH = '/home/pro/.ila3-admin-credentials'
const NAV_API = '/api/crm_navigation/navigation'
const FAIL_ON_ISSUES = !process.argv.includes('--no-fail')

fs.mkdirSync(OUT, { recursive: true })

const checks = []
const failures = []
const screenshots = []
const rolesReport = {}

function check(role, name, ok, detail = '') {
  const text = String(detail).replace(/\s+/g, ' ').trim().slice(0, 500)
  checks.push({ role, name, ok: Boolean(ok), detail: text })
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${role}] ${name}${text ? `  — ${text}` : ''}`)
  if (!ok) failures.push(`${role}: ${name}${text ? ` — ${text}` : ''}`)
}

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

function activeGroupFromCatalog(catalog, pathname) {
  if (!catalog?.groups) return null
  if (pathname === '/backend') return catalog.groups.find((group) => group.id === 'home') ?? null
  let best = null
  let bestLength = -1
  for (const group of catalog.groups) {
    const hrefs = [group.landing, ...(group.items ?? []).map((item) => item.href)].filter(Boolean)
    for (const href of hrefs) {
      if (!(pathname === href || pathname.startsWith(`${href}/`))) continue
      if (href.length > bestLength) {
        best = group
        bestLength = href.length
      }
    }
  }
  return best
}

function footerAndBuild(page) {
  return page.evaluate(() => {
    const footer = (document.querySelector('footer')?.innerText ?? '').replace(/\s+/g, ' ').trim()
    const attr = document.querySelector('[data-build-sha]')?.getAttribute('data-build-sha') ?? ''
    const match = footer.match(/\(([0-9a-f]{7,40})\)/i)
    return { footer, buildSha: (attr || match?.[1] || '').toLowerCase() }
  })
}

async function cleanOverlays(page) {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('div, section, aside')) {
      if (element.querySelector('main, nav, table')) continue
      const text = (element.textContent ?? '').trim()
      if (text.startsWith('演示环境') && text.length < 400) element.remove()
      if (text.includes('接受 Cookie') && text.length < 400) element.remove()
    }
  }).catch(() => {})
}

async function takeShot(page, role, name) {
  await cleanOverlays(page)
  const file = path.join(OUT, `${LABEL}-${role}-${name}.png`)
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled' })
  const entry = {
    role,
    name,
    path: file,
    sha256: sha256(file),
    url: page.url(),
    viewport: page.viewportSize(),
    at: new Date().toISOString(),
  }
  screenshots.push(entry)
  return entry
}

function attachDiagnostics(page) {
  const diagnostics = { pageErrors: [], consoleErrors: [], failedRequests: [], serverErrors: [] }
  page.on('pageerror', (error) => diagnostics.pageErrors.push(String(error.message).slice(0, 300)))
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text().slice(0, 300))
  })
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? ''
    if (reason.includes('ERR_ABORTED')) return
    if (!request.url().startsWith(BASE)) return
    diagnostics.failedRequests.push({ url: request.url(), reason })
  })
  page.on('response', (response) => {
    if (response.status() >= 500 && response.url().startsWith(BASE)) {
      diagnostics.serverErrors.push({ url: response.url(), status: response.status() })
    }
  })
  return diagnostics
}

async function surfaceState(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')
    const text = (main?.innerText ?? '').trim()
    const rows = Array.from(document.querySelectorAll('tbody tr')).filter(
      (row) => row.querySelectorAll('td').length >= 2 && (row.innerText ?? '').trim().length > 0,
    )
    return {
      url: location.href,
      pathname: location.pathname,
      mainTextLength: text.length,
      mainText: text.slice(0, 300),
      rows: rows.length,
      loadingTable: /正在加载表格|Loading table/.test(text),
    }
  })
}

async function gotoReady(page, url, { selector, minText = 40, timeout = 45000, requireNav = true } = {}) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
    await page.waitForFunction(
      ({ selector, minText, requireNav }) => {
        const nav = document.querySelector('[data-crm-scene-nav="desktop"]')
        const main = document.querySelector('main')
        if (requireNav && !nav) return false
        if (nav && nav.getAttribute('data-crm-nav-state') === 'loading') return false
        if ((main?.innerText ?? '').trim().length < minText) return false
        if (selector && !document.querySelector(selector)) return false
        return true
      },
      { selector, minText, requireNav },
      { timeout },
    )
    await page.waitForTimeout(200)
    return { ok: true, ...(await surfaceState(page)) }
  } catch (error) {
    const state = await surfaceState(page).catch(() => ({ mainTextLength: 0, mainText: '', rows: 0 }))
    return { ok: false, error: error instanceof Error ? error.message.split('\n')[0] : String(error), ...state }
  }
}

async function waitPath(page, href, timeout = 20000) {
  const target = new URL(href, BASE).pathname
  await page.waitForURL((url) => url.pathname === target, { timeout })
}

async function waitForDataRows(page, timeout = 30000) {
  try {
    await page.waitForFunction(
      () => {
        const main = document.querySelector('main')
        const text = main?.innerText ?? ''
        if (/正在加载表格|正在加载|Loading table|Loading/.test(text)) return false
        return Array.from(document.querySelectorAll('tbody tr')).some(
          (row) => row.querySelectorAll('td').length >= 2 && (row.innerText ?? '').trim().length > 0,
        )
      },
      undefined,
      { timeout },
    )
    return true
  } catch {
    return false
  }
}

async function railSnapshot(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('[data-crm-scene-nav="desktop"]')
    const groups = Array.from(nav?.querySelectorAll('[data-crm-nav-group]') ?? []).map((element) => ({
      id: element.getAttribute('data-crm-nav-group'),
      href: element.getAttribute('href'),
      label: (element.textContent ?? '').trim(),
      active: element.getAttribute('data-crm-nav-active') === 'true',
      ariaCurrent: element.getAttribute('aria-current'),
    }))
    const utilities = Array.from(document.querySelectorAll('[data-crm-utility]')).map((element) => ({
      id: element.getAttribute('data-crm-utility'),
      href: element.getAttribute('href'),
      active: element.getAttribute('aria-current') === 'page',
    }))
    const actions = Array.from(nav?.querySelectorAll('[data-crm-rail-action]') ?? []).map((element) => ({
      id: element.getAttribute('data-crm-rail-action'),
      label: (element.textContent ?? '').trim(),
    }))
    return {
      present: Boolean(nav),
      state: nav?.getAttribute('data-crm-nav-state') ?? null,
      empty: nav?.getAttribute('data-crm-nav-empty') ?? null,
      groups,
      utilities,
      actions,
      nestedLists: nav ? nav.querySelectorAll('ul ul').length : -1,
      groupHeaders: document.querySelectorAll('[data-sidebar-group]').length,
      sidebarHeight: document.querySelector('aside')?.getBoundingClientRect().height ?? null,
    }
  })
}

async function contentSnapshot(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('[data-crm-content-nav]')
    const items = Array.from(nav?.querySelectorAll('[data-crm-content-item]') ?? []).map((element) => ({
      href: element.getAttribute('data-crm-content-item'),
      label: (element.textContent ?? '').trim(),
      active: element.getAttribute('data-crm-content-active') === 'true',
      ariaCurrent: element.getAttribute('aria-current'),
    }))
    return {
      present: Boolean(nav),
      group: nav?.getAttribute('data-crm-content-group') ?? null,
      items,
      active: items.filter((item) => item.active || item.ariaCurrent === 'page').map((item) => item.href),
    }
  })
}

async function mobileSnapshot(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('[data-crm-scene-nav="mobile"]')
    const groups = Array.from(nav?.querySelectorAll('[data-crm-nav-group]') ?? []).map((element) => ({
      id: element.getAttribute('data-crm-nav-group'),
      href: element.getAttribute('href'),
      label: (element.textContent ?? '').trim(),
      active: element.getAttribute('data-crm-nav-active') === 'true',
    }))
    const utilities = Array.from(nav?.querySelectorAll('[data-crm-utility]') ?? []).map((element) => ({
      id: element.getAttribute('data-crm-utility'),
      href: element.getAttribute('href'),
    }))
    return {
      present: Boolean(nav),
      state: nav?.getAttribute('data-crm-nav-state') ?? null,
      groups,
      utilities,
      nestedLists: nav ? nav.querySelectorAll('ul ul').length : -1,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }
  })
}

async function loginWithRetry(context, credential) {
  let lastStatus = 0
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await context.request.post('/api/auth/login', { form: credential })
    lastStatus = response.status()
    if (response.ok()) return { ok: true, status: lastStatus, attempts: attempt }
    if (lastStatus === 429 && attempt < 3) {
      await sleep(25000)
      continue
    }
    return { ok: false, status: lastStatus, attempts: attempt }
  }
  return { ok: false, status: lastStatus, attempts: 3 }
}

function firstItemOf(catalogGroup) {
  return (catalogGroup.items ?? [])[0] ?? null
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  label: LABEL,
  expectSha: EXPECT_SHA || null,
  roles: ROLES,
  build: { footer: '', sha: '' },
  rolesReport,
  screenshots,
  checks,
  failures,
}

try {
  const creds = credentials()
  for (const role of ROLES) {
    const credential = creds.get(role)
    if (!credential) {
      check(role, 'credentials present', false, 'role missing from credential file')
      continue
    }
    const context = await browser.newContext({
      locale: 'zh-CN',
      viewport: { width: 1440, height: 900 },
      baseURL: BASE,
      extraHTTPHeaders: { 'Accept-Language': 'zh-CN,zh;q=0.9' },
    })
    const roleReport = { role, catalog: null, pages: {}, diagnostics: null, checks: [] }
    rolesReport[role] = roleReport
    let page
    try {
      const login = await loginWithRetry(context, credential)
      check(role, 'login succeeds', login.ok, login.ok ? `status ${login.status}` : `status ${login.status}`)
      if (!login.ok) continue

      const catalogResponse = await context.request.get(NAV_API)
      check(role, 'catalogue responds', catalogResponse.ok(), `status ${catalogResponse.status()}`)
      if (!catalogResponse.ok()) continue
      const payload = await catalogResponse.json()
      const catalog = payload?.crm
      roleReport.catalog = catalog
        ? {
            version: catalog.version,
            groups: (catalog.groups ?? []).map((group) => ({
              id: group.id,
              label: group.label,
              landing: group.landing,
              items: (group.items ?? []).length,
            })),
            authorized: (catalog.authorized ?? []).length,
            manage: (catalog.manage?.categories ?? []).length,
            personal: (catalog.personal?.items ?? []).length,
            actions: (catalog.actions ?? []).length,
            unconfiguredGroups: catalog.unconfiguredGroups ?? [],
            unknown: catalog.unknown ?? [],
            duplicates: catalog.duplicates ?? [],
          }
        : null
      check(role, 'catalogue is version 2', catalog?.version === 2, `version=${catalog?.version}`)
      check(role, 'catalogue has top-level groups', Array.isArray(catalog?.groups) && catalog.groups.length > 0, `groups=${catalog?.groups?.length ?? 0}`)
      check(role, 'catalogue has no unconfigured groups', (catalog?.unconfiguredGroups ?? []).length === 0, JSON.stringify(catalog?.unconfiguredGroups ?? []))
      if (!Array.isArray(catalog?.groups) || catalog.groups.length === 0) continue

      page = await context.newPage()
      page.setDefaultTimeout(30000)
      const diagnostics = attachDiagnostics(page)
      roleReport.diagnostics = diagnostics

      const workbench = await gotoReady(page, '/backend/workbench', { selector: '[data-crm-scene-nav="desktop"]', minText: 40 })
      roleReport.pages.workbench = workbench
      check(role, 'workbench renders', workbench.ok, workbench.ok ? `text=${workbench.mainTextLength}` : workbench.error)

      const rail = await railSnapshot(page)
      roleReport.pages.workbench.rail = rail
      const catalogGroupIds = catalog.groups.map((group) => group.id)
      const railGroupIds = rail.groups.map((group) => group.id)
      check(role, 'rail is ready', rail.state === 'ready', `state=${rail.state}`)
      check(role, 'rail has only top-level groups', rail.nestedLists === 0, `nestedLists=${rail.nestedLists}`)
      check(role, 'rail group ids match catalogue', JSON.stringify(railGroupIds) === JSON.stringify(catalogGroupIds), `${railGroupIds.join('|')} vs ${catalogGroupIds.join('|')}`)
      check(role, 'rail has one link per group', rail.groups.length === catalog.groups.length, `rail=${rail.groups.length} catalog=${catalog.groups.length}`)
      const badLandings = rail.groups.filter((group) => {
        const expected = catalog.groups.find((entry) => entry.id === group.id)
        return !expected || group.href !== expected.landing
      })
      check(role, 'rail group links use catalogue landings', badLandings.length === 0, JSON.stringify(badLandings))
      const activeGroups = rail.groups.filter((group) => group.active || group.ariaCurrent === 'page')
      const expectedActive = activeGroupFromCatalog(catalog, '/backend/workbench')
      check(role, 'rail highlights exactly one active group', activeGroups.length === 1, `active=${activeGroups.map((group) => group.id).join(',')}`)
      check(role, 'active group matches the current path', activeGroups[0]?.id === expectedActive?.id, `active=${activeGroups[0]?.id ?? 'none'} expected=${expectedActive?.id ?? 'none'}`)
      check(role, 'rail shows no legacy group headers', rail.groupHeaders === 0, `headers=${rail.groupHeaders}`)
      check(role, 'rail exposes the declared action entries', rail.actions.length === (catalog.railActions ?? []).length, `rail=${rail.actions.length} catalog=${(catalog.railActions ?? []).length}`)

      const build = await footerAndBuild(page)
      roleReport.pages.workbench.build = build
      report.build = build
      check(role, 'footer carries a build SHA', Boolean(build.buildSha), build.footer.slice(0, 120))
      if (EXPECT_SHA) {
        const matches = Boolean(build.buildSha) && (build.buildSha.startsWith(EXPECT_SHA) || EXPECT_SHA.startsWith(build.buildSha))
        check(role, 'footer build SHA matches --expect-sha', matches, `footer=${build.buildSha || 'none'} expected=${EXPECT_SHA}`)
      }
      await takeShot(page, role, 'workbench')

      // Customer list: a real table, not just the rail. Both roles can read it.
      const customersList = await gotoReady(page, '/backend/customers/companies', {
        selector: '[data-crm-nav-group="customers"]',
        minText: 60,
      })
      roleReport.pages.customers = customersList
      check(role, 'customer list renders', customersList.ok, customersList.ok ? `text=${customersList.mainTextLength}` : customersList.error)
      if (customersList.ok) {
        const customersTableReady = await waitForDataRows(page)
        const customersState = await surfaceState(page)
        roleReport.pages.customers.readyState = customersState
        check(role, 'customer list has data rows', customersTableReady && customersState.rows > 0 && !customersState.loadingTable, `rows=${customersState.rows} loading=${customersState.loadingTable} ready=${customersTableReady}`)
        const customersRail = await railSnapshot(page)
        check(role, 'customer list highlights the customers group', customersRail.groups.some((group) => group.id === 'customers' && group.active), `active=${customersRail.groups.filter((group) => group.active).map((group) => group.id).join(',')}`)
        await takeShot(page, role, 'customers')
      }

      // Content strip: a group with at least two entries. Customers is the
      // strongest fixture (companies/people/deals), but fall back to the first
      // multi-entry group so the check also works if declarations change.
      const contentGroup = catalog.groups.find((group) => group.id === 'customers' && (group.items ?? []).length >= 2) ?? catalog.groups.find((group) => (group.items ?? []).length >= 2) ?? null
      if (!contentGroup) {
        check(role, 'content strip group exists', false, 'no catalogue group has two or more entries')
      } else {
        const first = firstItemOf(contentGroup)
        const second = contentGroup.items[1]
        const firstPage = await gotoReady(page, first.href, { selector: `[data-crm-content-group="${contentGroup.id}"]`, minText: 60 })
        roleReport.pages.content = firstPage
        check(role, 'content strip renders on a group page', firstPage.ok, firstPage.ok ? `text=${firstPage.mainTextLength}` : firstPage.error)
        const content = await contentSnapshot(page)
        roleReport.pages.content.snapshot = content
        check(role, 'content strip belongs to the active group', content.group === contentGroup.id, `group=${content.group} expected=${contentGroup.id}`)
        const expectedContentHrefs = (contentGroup.items ?? []).map((item) => item.href)
        check(role, 'content strip lists the declared entries', JSON.stringify(content.items.map((item) => item.href)) === JSON.stringify(expectedContentHrefs), content.items.map((item) => item.href).join('|'))
        check(role, 'content strip highlights the current entry', content.active.length === 1 && content.active[0] === first.href, `active=${content.active.join(',')}`)
        await takeShot(page, role, 'content-strip')

        await page.locator('[data-crm-content-item]').nth(1).click()
        await waitPath(page, second.href)
        await page.waitForSelector(`[data-crm-content-group="${contentGroup.id}"]`, { timeout: 20000 })
        const afterTab = await contentSnapshot(page)
        roleReport.pages.content.afterTab = afterTab
        check(role, 'content tab click navigates', page.url().includes(second.href), page.url())
        check(role, 'clicked content entry becomes active', afterTab.active.length === 1 && afterTab.active[0] === second.href, `active=${afterTab.active.join(',')}`)
        await takeShot(page, role, 'content-tab')

        await page.goBack()
        await waitPath(page, first.href)
        await page.waitForSelector(`[data-crm-content-group="${contentGroup.id}"]`, { timeout: 20000 })
        const afterBack = await contentSnapshot(page)
        roleReport.pages.content.afterBack = afterBack
        check(role, 'browser Back restores the prior content entry', page.url().includes(first.href), page.url())
        check(role, 'Back restores the prior active content entry', afterBack.active.length === 1 && afterBack.active[0] === first.href, `active=${afterBack.active.join(',')}`)
        const railAfterBack = await railSnapshot(page)
        check(role, 'rail keeps the group active after Back', railAfterBack.groups.some((group) => group.id === contentGroup.id && group.active), `active=${railAfterBack.groups.filter((group) => group.active).map((group) => group.id).join(',')}`)
      }

      // Customer record deep link: the rail and content strip must survive a
      // detail URL, and the parent list entry must still be the active one.
      const customersGroup = catalog.groups.find((group) => group.id === 'customers')
      if (!customersGroup) {
        check(role, 'customers group exists', false, 'no customers group in catalogue')
      } else {
        const listResponse = await context.request.get('/api/customers/companies?page=1&pageSize=1')
        const listBody = listResponse.ok() ? await listResponse.json().catch(() => null) : null
        const companyId = listBody?.items?.[0]?.id ?? listBody?.data?.[0]?.id ?? null
        if (!companyId) {
          check(role, 'customer fixture is available', false, `list status ${listResponse.status()}, no company id`)
        } else {
          const detail = await gotoReady(page, `/backend/customers/companies/${companyId}`, { selector: '[data-crm-nav-group="customers"]', minText: 60 })
          roleReport.pages.customerDetail = detail
          check(role, 'customer detail deep link renders', detail.ok, detail.ok ? `text=${detail.mainTextLength}` : detail.error)
          const detailRail = await railSnapshot(page)
          check(role, 'customer detail keeps the customers group active', detailRail.groups.some((group) => group.id === 'customers' && group.active), `active=${detailRail.groups.filter((group) => group.active).map((group) => group.id).join(',')}`)
          const detailContent = await contentSnapshot(page)
          check(role, 'customer detail keeps the content strip', detailContent.present && detailContent.group === 'customers', `group=${detailContent.group}`)
          check(role, 'customer detail highlights the parent list entry', detailContent.active.includes('/backend/customers/companies'), `active=${detailContent.active.join(',')}`)
          const crumb = await page.evaluate(() => (document.querySelector('nav[aria-label="Breadcrumb"]')?.innerText ?? '').replace(/\s+/g, ' ').trim())
          check(role, 'customer detail has a breadcrumb', crumb.length > 0, crumb.slice(0, 100))
          await takeShot(page, role, 'customer-detail')
        }
      }

      // Management centre: search filters in place and never navigates.
      const manage = await gotoReady(page, '/backend/manage', { selector: '[data-manage-entry]', minText: 40 })
      roleReport.pages.manage = manage
      check(role, 'management centre renders entries', manage.ok, manage.ok ? `entries=${await page.locator('[data-manage-entry]').count()}` : manage.error)
      if (manage.ok) {
        const entries = await page.evaluate(() =>
          Array.from(document.querySelectorAll('[data-manage-entry]')).map((element) => ({
            href: element.getAttribute('data-manage-entry') ?? '',
            text: (element.innerText ?? '').trim(),
          })),
        )
        const total = entries.length
        check(role, 'management centre has entries', total > 0, `total=${total}`)
        let chosen = null
        for (const entry of entries) {
          const candidates = [entry.text.split('\n')[0], entry.href.split('/').filter(Boolean).slice(-1)[0]].filter(Boolean)
          for (const candidate of candidates) {
            const token = String(candidate).trim().slice(0, Math.min(6, String(candidate).trim().length))
            if (token.length < 2) continue
            const matches = entries.filter((item) => item.text.toLowerCase().includes(token.toLowerCase())).length
            if (matches >= 1 && matches < total) {
              chosen = { token, matches }
              break
            }
          }
          if (chosen) break
        }
        if (!chosen) {
          check(role, 'management search fixture is available', false, `no discriminating token across ${total} entries`)
        } else {
          const beforeUrl = page.url()
          try {
            await page.fill('[data-manage-search]', chosen.token)
            await page.waitForFunction(
              ({ total }) => {
                const count = document.querySelectorAll('[data-manage-entry]').length
                return count > 0 && count < total
              },
              { total },
              { timeout: 10000 },
            )
            const filteredCount = await page.locator('[data-manage-entry]').count()
            roleReport.pages.manage.search = { token: chosen.token, before: total, after: filteredCount }
            check(role, 'management search filters entries', filteredCount > 0 && filteredCount < total, `token=${chosen.token} ${total}->${filteredCount}`)
            check(role, 'management search stays on /backend/manage', new URL(page.url()).pathname === '/backend/manage' && page.url() === beforeUrl, page.url())
            await takeShot(page, role, 'manage-search')
            await page.fill('[data-manage-search]', '')
            await page.waitForFunction(
              ({ total }) => document.querySelectorAll('[data-manage-entry]').length === total,
              { total },
              { timeout: 10000 },
            )
            check(role, 'clearing management search restores entries', (await page.locator('[data-manage-entry]').count()) === total, `total=${total}`)
          } catch (error) {
            check(role, 'management search interaction completed', false, error instanceof Error ? error.message.split('\n')[0] : String(error))
          }
        }
      }

      // Business cards: every declared group must be rendered with entries.
      const business = await gotoReady(page, '/backend/business', { selector: '[data-business-group]', minText: 40 })
      roleReport.pages.business = business
      check(role, 'business directory renders groups', business.ok, business.ok ? `text=${business.mainTextLength}` : business.error)
      if (business.ok) {
        const businessCards = await page.evaluate(() =>
          Array.from(document.querySelectorAll('[data-business-group]')).map((element) => ({
            id: element.getAttribute('data-business-group'),
            entries: element.querySelectorAll('[data-business-entry]').length,
          })),
        )
        check(role, 'business cards match catalogue groups', businessCards.length === catalog.groups.length, `cards=${businessCards.length} catalog=${catalog.groups.length}`)
        check(role, 'every business card has entries', businessCards.every((card) => card.entries > 0), JSON.stringify(businessCards))
        await takeShot(page, role, 'business')
        const firstEntry = page.locator('[data-business-entry]').first()
        if (await firstEntry.count()) {
          const href = await firstEntry.getAttribute('data-business-entry')
          await firstEntry.click()
          await waitPath(page, href)
          const businessRail = await railSnapshot(page)
          const expectedBusinessGroup = activeGroupFromCatalog(catalog, new URL(page.url()).pathname)
          check(role, 'business card navigates to a declared entry', page.url().includes(href), page.url())
          check(role, 'business card navigation keeps a valid active group', expectedBusinessGroup ? businessRail.groups.some((group) => group.id === expectedBusinessGroup.id && group.active) : businessRail.groups.some((group) => group.active), `active=${businessRail.groups.filter((group) => group.active).map((group) => group.id).join(',')}`)
          await page.goBack()
          await waitPath(page, '/backend/business')
        }
      }

      // Direct settings URL: the rail stays, but no settings page is allowed in
      // the daily groups and no group may be falsely highlighted.
      const settingsHref = catalog.manage?.categories?.flatMap((category) => category.items ?? [])?.find((item) => item.href?.startsWith('/backend/'))?.href
      if (!settingsHref) {
        check(role, 'settings fixture is available', false, 'no management entry to open')
      } else {
        const settings = await gotoReady(page, settingsHref, { minText: 20 })
        roleReport.pages.settings = { href: settingsHref, ...settings }
        check(role, 'direct settings URL renders with the rail', settings.ok, settings.ok ? `text=${settings.mainTextLength}` : settings.error)
        const settingsRail = await railSnapshot(page)
        check(role, 'direct settings URL keeps top-level groups', settingsRail.groups.length > 0, `groups=${settingsRail.groups.length}`)
        const settingsActiveGroups = settingsRail.groups.filter((group) => group.active || group.ariaCurrent === 'page')
        check(role, 'settings page does not falsely highlight a daily group', settingsActiveGroups.length === 0, `active=${settingsActiveGroups.map((group) => group.id).join(',')}`)
        const settingsInRail = settingsRail.groups.filter((group) => group.href?.startsWith('/backend/config/') || group.href === settingsHref)
        check(role, 'settings page is not inside the daily rail', settingsInRail.length === 0, JSON.stringify(settingsInRail))
        const settingsContent = await contentSnapshot(page)
        check(role, 'settings page has no daily content strip', !settingsContent.present, `group=${settingsContent.group ?? 'none'}`)
        await takeShot(page, role, 'settings-direct')
      }

      // Mobile drawer: complete group list at the required viewport.
      await page.setViewportSize({ width: 390, height: 844 })
      const mobilePage = await gotoReady(page, '/backend/customers/companies', { minText: 40, requireNav: false })
      check(role, 'mobile customer page renders', mobilePage.ok, mobilePage.ok ? `text=${mobilePage.mainTextLength}` : mobilePage.error)
      const trigger = page.getByRole('button', { name: /打开菜单|Open menu/ }).first()
      if (!(await trigger.count())) {
        check(role, 'mobile drawer trigger exists', false, 'no 打开菜单/Open menu button')
      } else {
        await trigger.click()
        let mobileReady = false
        try {
          await page.waitForSelector('[data-crm-scene-nav="mobile"][data-crm-nav-state="ready"]', {
            state: 'visible',
            timeout: 20000,
          })
          mobileReady = true
        } catch {
          mobileReady = false
        }
        const mobile = await mobileSnapshot(page)
        roleReport.pages.mobile = { ...mobile, readyWait: mobileReady }
        check(role, 'mobile drawer is ready', mobileReady && mobile.state === 'ready', `state=${mobile.state} readyWait=${mobileReady}`)
        check(role, 'mobile drawer is actually open', mobile.present === true, `present=${mobile.present}`)
        check(role, 'mobile drawer lists every group', mobile.groups.length === catalog.groups.length, `drawer=${mobile.groups.length} catalog=${catalog.groups.length}`)
        check(role, 'mobile drawer is top-level only', mobile.nestedLists === 0, `nestedLists=${mobile.nestedLists}`)
        check(role, 'mobile drawer exposes utility entries', mobile.utilities.length === (catalog.utility ?? []).length, `drawer=${mobile.utilities.length} catalog=${(catalog.utility ?? []).length}`)
        check(role, 'mobile drawer has no horizontal overflow', mobile.documentWidth <= mobile.viewportWidth + 1, `document=${mobile.documentWidth} viewport=${mobile.viewportWidth}`)
        await takeShot(page, role, 'mobile-drawer')
        await page.getByRole('button', { name: /关闭菜单|Close menu/ }).first().click().catch(() => {})
      }
      await page.setViewportSize({ width: 1440, height: 900 })

      // Keyboard: focus a group that is not the current one and press Enter.
      const keyboardPage = await gotoReady(page, '/backend/workbench', { selector: '[data-crm-scene-nav="desktop"]', minText: 40 })
      check(role, 'keyboard page renders', keyboardPage.ok, keyboardPage.ok ? `text=${keyboardPage.mainTextLength}` : keyboardPage.error)
      if (keyboardPage.ok) {
        const currentPath = new URL(page.url()).pathname
        const target = catalog.groups.find((group) => group.landing !== currentPath && group.landing?.startsWith('/backend/')) ?? catalog.groups[0]
        const targetLink = page.locator(`[data-crm-nav-group="${target.id}"]`)
        await targetLink.focus()
        const focusStyle = await targetLink.evaluate((element) => {
          const style = getComputedStyle(element)
          return { boxShadow: style.boxShadow, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth }
        })
        check(role, 'keyboard focus has a visible ring', focusStyle.boxShadow !== 'none' || focusStyle.outlineStyle !== 'none', JSON.stringify(focusStyle))
        await page.keyboard.press('Enter')
        await waitPath(page, target.landing)
        await page.waitForSelector(`[data-crm-nav-group="${target.id}"]`, { timeout: 20000 })
        const keyboardRail = await railSnapshot(page)
        roleReport.pages.keyboard = { target: target.id, href: target.landing, focusStyle, url: page.url() }
        check(role, 'keyboard Enter navigates to the group landing', page.url().includes(target.landing), page.url())
        check(role, 'keyboard navigation activates the target group', keyboardRail.groups.some((group) => group.id === target.id && group.active), `active=${keyboardRail.groups.filter((group) => group.active).map((group) => group.id).join(',')}`)
        await takeShot(page, role, 'keyboard')
      }

      // Employee authorization: a hidden entry is not authorization.
      const deniedApi = await context.request.get('/api/directory/organizations')
      if (role === 'employee') {
        check(role, 'employee admin API is refused', deniedApi.status() === 403, `status ${deniedApi.status()}`)
        await page.goto('/backend/directory/organizations', { waitUntil: 'domcontentloaded', timeout: 45000 })
        let deniedText = ''
        try {
          await page.waitForFunction(
            () => /Access Denied|无权限/.test(document.querySelector('main')?.innerText ?? ''),
            undefined,
            { timeout: 20000 },
          )
          deniedText = await page.evaluate(() => (document.querySelector('main')?.innerText ?? '').replace(/\s+/g, ' ').trim())
        } catch {
          deniedText = await page.evaluate(() => (document.querySelector('main')?.innerText ?? '').replace(/\s+/g, ' ').trim()).catch(() => '')
        }
        check(role, 'employee admin URL is visibly denied', /Access Denied|无权限/.test(deniedText), deniedText.slice(0, 120) || 'no denial text')
        await takeShot(page, role, 'admin-denied')
      } else {
        check(role, 'admin admin API is not refused', deniedApi.status() !== 403, `status ${deniedApi.status()}`)
      }

      // 502: the shell asks for a typed chrome fallback. The route keeps a
      // truthful 502 for the plain API and returns a 200 catalogue with
      // crm.error=true when the chrome query is present; intercepting the
      // chrome request with a raw 502 would leave the provider without a
      // payload and hide the rail entirely, so reproduce the server contract.
      const fallbackCatalog = {
        version: 2,
        error: true,
        groups: [],
        railActions: [],
        utility: [],
        manage: { categories: [] },
        personal: { items: [] },
        unknown: [],
        unconfiguredGroups: [],
        actions: [],
        authorized: [],
        duplicates: [],
      }
      const navRequests = []
      const errorPage = await context.newPage()
      const errorDiagnostics = { pageErrors: [], consoleErrors: [] }
      errorPage.on('pageerror', (error) => errorDiagnostics.pageErrors.push(String(error.message).slice(0, 200)))
      errorPage.on('console', (message) => {
        if (message.type() === 'error') errorDiagnostics.consoleErrors.push(message.text().slice(0, 200))
      })
      await errorPage.route('**/api/crm_navigation/navigation*', async (route) => {
        const url = new URL(route.request().url())
        navRequests.push(`${url.pathname}${url.search}`)
        if (url.searchParams.get('chrome') === '1') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              groups: [],
              settingsSections: [],
              profileSections: [],
              settingsPathPrefixes: [],
              profilePathPrefixes: [],
              grantedFeatures: [],
              crm: fallbackCatalog,
            }),
          })
          return
        }
        await route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Navigation is unavailable.' }),
        })
      })
      await errorPage.goto('/backend/workbench', { waitUntil: 'domcontentloaded', timeout: 45000 })
      let errorState = null
      try {
        await errorPage.waitForSelector('[data-crm-nav-state="error"]', { timeout: 20000 })
        errorState = await errorPage.evaluate(() => ({
          state: document.querySelector('[data-crm-nav-state="error"]')?.getAttribute('data-crm-nav-state') ?? null,
          groups: document.querySelectorAll('[data-crm-nav-group]').length,
          text: (document.querySelector('main')?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
          retry: Boolean(Array.from(document.querySelectorAll('button')).find((button) => /重试|Retry/.test(button.textContent ?? ''))),
        }))
      } catch {
        errorState = await errorPage.evaluate(() => ({
          state: document.querySelector('[data-crm-nav-state]')?.getAttribute('data-crm-nav-state') ?? null,
          groups: document.querySelectorAll('[data-crm-nav-group]').length,
          text: (document.querySelector('main')?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
          retry: Boolean(Array.from(document.querySelectorAll('button')).find((button) => /重试|Retry/.test(button.textContent ?? ''))),
        })).catch(() => null)
      }
      const chromeRequested = navRequests.some((request) => request.includes('chrome=1'))
      roleReport.pages.error502 = { ...errorState, diagnostics: errorDiagnostics, navRequests, chromeRequested }
      check(role, 'shell requests the typed chrome fallback', chromeRequested, `requests=${navRequests.join(',') || 'none'}`)
      check(role, '502 shows the error affordance', errorState?.state === 'error', `state=${errorState?.state ?? 'none'} text=${errorState?.text ?? ''}`)
      check(role, '502 renders no fallback groups', errorState?.groups === 0, `groups=${errorState?.groups ?? 'unknown'}`)
      check(role, '502 offers a retry action', errorState?.retry === true, `retry=${errorState?.retry}`)
      await takeShot(errorPage, role, 'nav-502')
      await errorPage.close()

      // Hygiene is asserted only for the normal pages. The 502 page is an
      // expected failure and is recorded above instead.
      const expected403 = role === 'employee' ? diagnostics.consoleErrors.filter((message) => /status of 403/i.test(message)) : []
      const unexpectedConsoleErrors = diagnostics.consoleErrors.filter((message) => !expected403.includes(message))
      roleReport.diagnostics = { ...diagnostics, expected403 }
      check(role, 'no page errors', diagnostics.pageErrors.length === 0, diagnostics.pageErrors.join(' | ').slice(0, 200))
      check(role, 'no unexpected console errors', unexpectedConsoleErrors.length === 0, `unexpected=${unexpectedConsoleErrors.join(' | ').slice(0, 200)} expected403=${expected403.length}`)
      check(role, 'no 5xx responses from the app', diagnostics.serverErrors.length === 0, JSON.stringify(diagnostics.serverErrors).slice(0, 300))
      check(role, 'no unexpected failed requests', diagnostics.failedRequests.length === 0, JSON.stringify(diagnostics.failedRequests).slice(0, 300))
    } catch (error) {
      check(role, 'role completed', false, error instanceof Error ? error.message.split('\n')[0] : String(error))
    } finally {
      await page?.close().catch(() => {})
      await context.close().catch(() => {})
    }
  }
} catch (error) {
  check('global', 'runner completed', false, error instanceof Error ? error.message.split('\n')[0] : String(error))
} finally {
  await browser.close().catch(() => {})
}

report.checks = checks
report.failures = failures
report.screenshots = screenshots
fs.writeFileSync(path.join(OUT, `${LABEL}-declared-browser-report.json`), `${JSON.stringify(report, null, 2)}\n`)
console.log(`[declared-browser] ${checks.length} checks, ${failures.length} failure(s); report in ${OUT}`)
if (FAIL_ON_ISSUES && failures.length > 0) process.exitCode = 1
