#!/usr/bin/env node
/**
 * Browser evidence for the CRM five-scene navigation.
 *
 * Modes:
 *   --mode capture   record the rail + screenshots (works on the old shell too)
 *   --mode verify    assert the new IA invariants and capture the same shots
 *
 * Readiness is selector/text based, never a bare fixed sleep: a screenshot only
 * runs after the surface's own content is present. Every run records page
 * errors, console errors, failed requests and 5xx responses, so a blank or
 * half-hydrated page fails with evidence instead of a pretty picture.
 *
 * Credentials are read from ~/.ila3-admin-credentials (0600) inside this process
 * and passed to the login API; they are never printed or written to the report.
 *
 * Usage:
 *   node scripts/crm-nav-browser.mjs --mode verify --base http://127.0.0.1:3100 \
 *     --label after --expect-sha <commit> --out /storage/artifacts/pro/crm-navigation-goal/shots
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}
const BASE = arg('--base', 'http://127.0.0.1:3000')
const OUT = path.resolve(arg('--out', '/storage/artifacts/pro/crm-navigation-goal/shots'))
const LABEL = arg('--label', 'after')
const MODE = arg('--mode', 'verify')
const EXPECT_SHA = arg('--expect-sha', '')
const ROLES = (arg('--roles', 'admin,employee')).split(',').filter(Boolean)
const CREDS_PATH = '/home/pro/.ila3-admin-credentials'
fs.mkdirSync(OUT, { recursive: true })

function credentials() {
  const map = new Map()
  for (const line of fs.readFileSync(CREDS_PATH, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    const [role, email, password] = line.trim().split(/\s+/)
    if (role && email && password) map.set(role, { email, password })
  }
  return map
}

const failures = []
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`)
  if (!ok) failures.push(`${name}: ${detail ?? ''}`)
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const creds = credentials()

async function sidebarSnapshot(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('[data-crm-scene-nav="desktop"]')
    const aside = document.querySelector('aside')
    const groups = document.querySelectorAll('[data-sidebar-group]')
    const search = document.querySelector('aside input[aria-label]')
    const items = Array.from(nav?.querySelectorAll('a,button') ?? [])
    const rect = aside?.getBoundingClientRect()
    return {
      navPresent: Boolean(nav),
      navState: nav?.getAttribute('data-crm-nav-state') ?? null,
      items: items.map((item) => (item.textContent ?? '').trim()),
      itemCount: items.length,
      sidebarWidth: rect ? Math.round(rect.width) : null,
      sidebarHeight: rect ? Math.round(rect.height) : null,
      groupHeaders: groups.length,
      nestedLists: nav ? nav.querySelectorAll('ul ul').length : 0,
      searchVisible: search ? getComputedStyle(search).display !== 'none' && search.getBoundingClientRect().width > 0 : false,
      text: (aside?.innerText ?? '').slice(0, 400),
    }
  })
}

async function cleanOverlays(page) {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('div, section, aside')) {
      // Never remove a wrapper that owns real content: some banners are nested
      // in a layout container, and removing it would blank the screenshot.
      if (element.querySelector('main, nav, table')) continue
      const text = element.textContent ?? ''
      if (text.startsWith('演示环境') && text.length < 400) element.remove()
      if (text.includes('接受 Cookie') && text.length < 400) element.remove()
    }
  }).catch(() => {})
}

/**
 * Click a link inside a named nav without Playwright's actionability wait.
 * The shell can re-render the nav while a payload refreshes; the link is real
 * and native-clicking it still exercises the route change.
 */
async function clickNavLink(page, ariaLabel, text) {
  return page.evaluate(({ ariaLabel, text }) => {
    const nav = document.querySelector(`nav[aria-label="${ariaLabel}"]`)
    const link = Array.from(nav?.querySelectorAll('a') ?? []).find((anchor) => (anchor.textContent ?? '').trim() === text)
    if (!link) return false
    link.click()
    return true
  }, { ariaLabel, text })
}

async function surfaceState(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')
    const text = (main?.innerText ?? '').trim()
    const rows = Array.from(document.querySelectorAll('tbody tr'))
    const dataRows = rows.filter((row) => row.querySelectorAll('td').length >= 2 && (row.innerText ?? '').trim().length > 0)
    return {
      mainTextLength: text.length,
      mainText: text.slice(0, 300),
      rows: dataRows.length,
      loadingTable: /正在加载表格|Loading table/.test(text),
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }
  })
}

/**
 * Wait until a list table has real data rows, not the spinner row.
 *
 * The earlier capture took the screenshot while the table still showed
 * "正在加载表格…" — the page was not blank, the gate was simply too weak.
 */
async function waitForDataTable(page, timeout = 30000) {
  try {
    await page.waitForFunction(
      () => {
        const main = document.querySelector('main')
        const text = main?.innerText ?? ''
        if (/正在加载表格|Loading table/.test(text)) return false
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

/**
 * Navigate and wait until the surface's own content is present. Returns
 * `{ ok, ...state }`; on timeout it returns the last observable state instead of
 * throwing, so the caller can record a precise failure.
 */
async function gotoReady(page, url, { selector, minText = 60, timeout = 45000 } = {}) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
    await page.waitForFunction(
      ({ selector, minText }) => {
        const main = document.querySelector('main')
        if (!main) return false
        if ((main.innerText ?? '').trim().length < minText) return false
        if (selector && !document.querySelector(selector)) return false
        return true
      },
      { selector, minText },
      { timeout },
    )
    // Paint settle only; readiness was already proven by the predicate.
    await page.waitForTimeout(250)
    return { ok: true, ...(await surfaceState(page)) }
  } catch (error) {
    const state = await surfaceState(page).catch(() => ({ mainTextLength: 0, mainText: '', rows: 0 }))
    return { ok: false, error: error instanceof Error ? error.message.split('\n')[0] : String(error), ...state }
  }
}

for (const role of ROLES) {
  const cred = creds.get(role)
  if (!cred) {
    check(`${role} credentials`, false, 'missing from credential file')
    continue
  }
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width: 1280, height: 900 },
    baseURL: BASE,
    extraHTTPHeaders: { 'Accept-Language': 'zh-CN,zh;q=0.9' },
  })
  const login = await context.request.post('/api/auth/login', { form: cred })
  if (!login.ok()) {
    check(`${role} login`, false, `status ${login.status()}`)
    await context.close()
    continue
  }
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  const diagnostics = { pageErrors: [], consoleErrors: [], failedRequests: [], serverErrors: [] }
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message.slice(0, 300)))
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

  const shot = async (name) => {
    await cleanOverlays(page)
    await page.screenshot({ path: path.join(OUT, `${LABEL}-${role}-${name}.png`), fullPage: false })
  }

  const buildFooter = async () => {
    return page.evaluate(() => {
      const footer = document.querySelector('footer')
      return (footer?.innerText ?? '').replace(/\s+/g, ' ').trim()
    })
  }

  // ---- workbench -----------------------------------------------------------
  const workbench = await gotoReady(page, '/backend/workbench', { selector: '[data-crm-scene-nav="desktop"]', minText: 40 })
  const sidebar = await sidebarSnapshot(page)
  const footer = await buildFooter()
  await shot('workbench')
  results.push({ role, surface: 'workbench', sidebar, footer, ready: workbench.ok })
  if (MODE === 'verify') {
    check(`${role} workbench ready`, workbench.ok, workbench.ok ? `text=${workbench.mainTextLength}` : workbench.error)
    check(`${role} five scenes`, sidebar.itemCount === 5, `items=${sidebar.itemCount} [${sidebar.items.join(' | ')}]`)
    check(`${role} no group headers`, sidebar.groupHeaders === 0, `headers=${sidebar.groupHeaders}`)
    check(`${role} no nested rail tree`, sidebar.nestedLists === 0, `nested=${sidebar.nestedLists}`)
    check(`${role} rail search hidden`, sidebar.searchVisible === false, `visible=${sidebar.searchVisible}`)
    if (EXPECT_SHA) check(`${role} build sha in footer`, footer.includes(EXPECT_SHA), footer.slice(0, 80))
  }

  // ---- customers -----------------------------------------------------------
  const customersReady = await gotoReady(page, '/backend/customers/companies', {
    selector: 'nav[aria-label="客户视图"] a',
    minText: 80,
  })
  const customers = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="客户视图"], nav[aria-label="Customer views"]')
    const active = document.querySelector('[data-crm-scene="customers"]')
    return {
      tabs: Array.from(nav?.querySelectorAll('a') ?? []).map((a) => (a.textContent ?? '').trim()),
      active: active?.getAttribute('aria-current') ?? null,
    }
  })
  const customersTableReady = await waitForDataTable(page)
  const customersState = await surfaceState(page)
  await shot('customers')
  results.push({ role, surface: 'customers', ...customers, ...customersState, ready: customersReady.ok })
  if (MODE === 'verify') {
    check(`${role} customer page ready`, customersReady.ok, customersReady.ok ? `text=${customersReady.mainTextLength}` : customersReady.error)
    check(`${role} customer table loaded`, customersTableReady && !customersState.loadingTable, `rows=${customersState.rows} loading=${customersState.loadingTable}`)
    check(`${role} customer content not blank`, customersState.rows > 0 && customersState.mainTextLength > 150, `rows=${customersState.rows} text=${customersState.mainTextLength}`)
    check(`${role} customer tabs`, customers.tabs.join('/') === '公司/联系人/商机', customers.tabs.join('/'))
    check(`${role} customer scene highlighted`, customers.active === 'page', `aria-current=${customers.active}`)

    const clickedPeople = await clickNavLink(page, '客户视图', '联系人')
    check(`${role} tab link present`, clickedPeople, `clicked=${clickedPeople}`)
    if (clickedPeople) {
      await page.waitForURL('**/backend/customers/people', { timeout: 20000 })
      await waitForDataTable(page)
    }
    await page.waitForFunction(() => (document.querySelector('main')?.innerText ?? '').trim().length > 80)
    const peopleActive = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="客户视图"]')
      const current = nav?.querySelector('[aria-current="page"]')
      return current ? (current.textContent ?? '').trim() : null
    })
    check(`${role} tab navigation`, peopleActive === '联系人', `active=${peopleActive}`)
    await page.goBack()
    await page.waitForFunction(() => location.pathname === '/backend/customers/companies')
    await waitForDataTable(page)
    check(`${role} browser back`, page.url().includes('/backend/customers/companies'), page.url())

    const listed = await context.request.get('/api/customers/companies?page=1&pageSize=1')
    const listedBody = listed.ok() ? await listed.json() : null
    const companyId = listedBody?.items?.[0]?.id ?? listedBody?.data?.[0]?.id ?? null
    if (companyId) {
      const detailReady = await gotoReady(page, `/backend/customers/companies/${companyId}`, {
        selector: 'nav[aria-label="关联对象"]',
        minText: 80,
      })
      const related = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="关联对象"]')
        return {
          present: Boolean(nav),
          links: Array.from(nav?.querySelectorAll('a') ?? []).map((a) => ({ label: (a.textContent ?? '').trim(), href: a.getAttribute('href') })),
        }
      })
      await shot('company-detail')
      results.push({ role, surface: 'company-detail', ...related, ready: detailReady.ok })
      check(`${role} record related nav`, detailReady.ok && related.present && related.links.length > 0, JSON.stringify(related.links))
      check(`${role} related nav self-describes scope`, related.links.some((link) => link.label === '全部联系人') && related.links.some((link) => link.label === '全部任务'), JSON.stringify(related.links))
      check(`${role} related nav uses list filter`, related.links.some((link) => link.href?.includes('companyId=')), JSON.stringify(related.links))
    } else {
      check(`${role} record related nav`, false, 'no company fixture returned by the list API')
    }
  }

  // ---- business ------------------------------------------------------------
  const businessReady = await gotoReady(page, '/backend/business', { selector: '[data-business-category]', minText: 60 })
  const business = await page.evaluate(() => ({
    categories: document.querySelectorAll('[data-business-category]').length,
    pinned: document.querySelectorAll('[data-business-pinned] a').length,
    entryLinks: document.querySelectorAll('[data-business-entry]').length,
    nestedLists: document.querySelectorAll('[data-business-category] ul').length,
    categoryTabs: document.querySelectorAll('nav[aria-label="业务分类"] a').length,
    mainTextLength: (document.querySelector('main')?.innerText ?? '').trim().length,
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  }))
  await shot('business')
  results.push({ role, surface: 'business', ...business, ready: businessReady.ok })
  if (MODE === 'verify') {
    check(`${role} business home ready`, businessReady.ok, businessReady.ok ? `text=${businessReady.mainTextLength}` : businessReady.error)
    check(`${role} business home is a summary`, business.entryLinks === 0 && business.nestedLists === 0, `entryLinks=${business.entryLinks} nested=${business.nestedLists}`)
    check(`${role} business home fits first screen`, business.scrollHeight <= business.viewportHeight + 48, `scroll=${business.scrollHeight} viewport=${business.viewportHeight}`)
    check(`${role} business category tiles`, business.categories > 0 && business.pinned > 0, `categories=${business.categories} pinned=${business.pinned}`)
    const clickedSales = await clickNavLink(page, '业务分类', '销售')
    if (clickedSales) {
      await page.waitForURL('**/backend/business/sales', { timeout: 20000 })
      await page.waitForSelector('[data-business-entry]', { timeout: 20000 })
      const category = await page.evaluate(() => ({
        heading: document.querySelector('h1')?.textContent ?? '',
        entries: document.querySelectorAll('[data-business-entry]').length,
      }))
      await shot('business-sales')
      results.push({ role, surface: 'business-category', ...category })
      check(`${role} business category page`, category.entries > 0, `heading=${category.heading} entries=${category.entries}`)
    }
  }

  // ---- messages ------------------------------------------------------------
  const messagesReady = await gotoReady(page, '/backend/messages', { selector: 'nav[aria-label="消息视图"]', minText: 40 })
  const messages = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="消息视图"], nav[aria-label="Message views"]')
    return { tabs: Array.from(nav?.querySelectorAll('a') ?? []).map((a) => (a.textContent ?? '').trim()) }
  })
  await shot('messages')
  results.push({ role, surface: 'messages', ...messages, ready: messagesReady.ok })
  if (MODE === 'verify') check(`${role} message views`, messagesReady.ok && messages.tabs.length >= 3, messages.tabs.join('/'))

  // ---- single AI entry -----------------------------------------------------
  await gotoReady(page, '/backend/workbench', { selector: '[data-crm-scene-nav="desktop"]', minText: 40 })
  const aiButton = page.locator('[data-crm-scene="assistant"]')
  if (await aiButton.count()) {
    await aiButton.first().click()
    await page.waitForSelector('[data-ai-launcher-picker], [data-ai-launcher-sheet], [role="dialog"]', { timeout: 15000 }).catch(() => {})
    const dialog = await page.evaluate(() => Boolean(document.querySelector('[data-ai-launcher-picker], [data-ai-launcher-sheet], [role="dialog"]')))
    check(`${role} AI entry opens assistant`, dialog, `dialog=${dialog}`)
    await page.keyboard.press('Escape')
  } else {
    check(`${role} AI entry opens assistant`, false, 'AI scene button missing')
  }

  // ---- management centre ---------------------------------------------------
  const manageReady = await gotoReady(page, '/backend/manage', { selector: '[data-manage-entry]', minText: 60 })
  const manage = await page.evaluate(() => ({
    search: Boolean(document.querySelector('[data-manage-search]')),
    categories: Array.from(document.querySelectorAll('[data-manage-category]')).map((section) => section.getAttribute('data-manage-category')),
    entries: document.querySelectorAll('[data-manage-entry]').length,
  }))
  await shot('manage')
  results.push({ role, surface: 'manage', ...manage, ready: manageReady.ok })
  if (MODE === 'verify') {
    check(`${role} management ready`, manageReady.ok, manageReady.ok ? `text=${manageReady.mainTextLength}` : manageReady.error)
    check(`${role} management search`, manage.search, `search=${manage.search}`)
    check(`${role} management categories`, manage.categories.length > 0, manage.categories.join(','))
    check(`${role} management entries`, manage.entries > 0, `entries=${manage.entries}`)
    if (manage.search) {
      const firstLabel = (await page.locator('[data-manage-entry]').first().innerText()).split('\n')[0].trim()
      await page.locator('[data-manage-search]').fill(firstLabel)
      await page.waitForFunction((needle) => {
        const text = document.querySelector('main')?.innerText ?? ''
        return text.includes(needle) && document.querySelectorAll('[data-manage-entry]').length > 0
      }, firstLabel)
      const filtered = await page.evaluate((needle) => ({
        entries: document.querySelectorAll('[data-manage-entry]').length,
        text: document.querySelector('main')?.innerText ?? '',
        needle,
      }), firstLabel)
      check(`${role} management search filters`, filtered.entries > 0 && filtered.entries <= manage.entries && filtered.text.includes(filtered.needle), `needle=${filtered.needle} entries=${filtered.entries}`)
      await shot('manage-search')
    }
  }

  // ---- profile -------------------------------------------------------------
  const profileReady = await gotoReady(page, '/backend/profile', { minText: 40 })
  await shot('profile')
  if (MODE === 'verify') check(`${role} profile ready`, profileReady.ok, profileReady.ok ? `text=${profileReady.mainTextLength}` : profileReady.error)

  if (MODE === 'verify') {
    // ---- mobile ------------------------------------------------------------
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoReady(page, '/backend/customers/companies', { selector: 'nav[aria-label="客户视图"] a', minText: 60 })
    const trigger = page.getByRole('button', { name: /打开菜单|Open menu/ }).first()
    if (await trigger.count()) await trigger.click()
    await page.waitForSelector('[data-crm-scene-nav="mobile"]', { timeout: 15000 })
    const mobile = await page.evaluate(() => {
      const nav = document.querySelector('[data-crm-scene-nav="mobile"]')
      return {
        present: Boolean(nav),
        state: nav?.getAttribute('data-crm-nav-state') ?? null,
        items: Array.from(nav?.querySelectorAll('a,button') ?? []).map((item) => (item.textContent ?? '').trim()),
      }
    })
    await page.screenshot({ path: path.join(OUT, `${LABEL}-${role}-mobile-drawer.png`), fullPage: false })
    results.push({ role, surface: 'mobile', ...mobile })
    check(`${role} mobile drawer scenes`, mobile.items.slice(0, 5).join('/') === '工作台/AI助手/客户/业务/消息', mobile.items.join('/'))
    check(`${role} mobile drawer utility`, mobile.items.includes('管理中心') && mobile.items.includes('个人账户'), mobile.items.join('/'))

    // ---- direct URL keeps the rail ----------------------------------------
    await page.setViewportSize({ width: 1280, height: 900 })
    await gotoReady(page, '/backend/config/sales', { selector: '[data-crm-scene-nav="desktop"]', minText: 40 })
    const direct = await sidebarSnapshot(page)
    await shot('direct-settings-url')
    results.push({ role, surface: 'direct-settings-url', sidebar: direct })
    check(`${role} direct URL keeps rail`, direct.itemCount === 5 && direct.groupHeaders === 0, `items=${direct.itemCount} headers=${direct.groupHeaders}`)

    // ---- hidden != authorized ----------------------------------------------
    if (role === 'employee') {
      await page.goto('/backend/directory/organizations', { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => /Access Denied|无权限/.test(document.querySelector('main')?.innerText ?? ''), undefined, { timeout: 20000 })
      const deniedText = await page.evaluate(() => document.querySelector('main')?.innerText ?? '')
      await page.screenshot({ path: path.join(OUT, `${LABEL}-${role}-direct-admin-page.png`), fullPage: false })
      check(`${role} direct admin URL denied`, /Access Denied|无权限/.test(deniedText), deniedText.slice(0, 60).replace(/\n/g, ' '))
    }
  }

  results.push({ role, diagnostics })
  if (MODE === 'verify') {
    check(`${role} no page errors`, diagnostics.pageErrors.length === 0, diagnostics.pageErrors.join(' | ').slice(0, 200))
    check(`${role} no 5xx responses`, diagnostics.serverErrors.length === 0, JSON.stringify(diagnostics.serverErrors).slice(0, 200))
  }
  await context.close()
}

await browser.close()

const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  label: LABEL,
  mode: MODE,
  roles: ROLES,
  expectSha: EXPECT_SHA || null,
  results,
  failures,
}
fs.writeFileSync(path.join(OUT, `${LABEL}-browser-report.json`), `${JSON.stringify(report, null, 2)}\n`)
console.log(`[crm-nav-browser] ${failures.length} failure(s); report in ${OUT}`)
if (MODE === 'verify' && failures.length) process.exit(1)
