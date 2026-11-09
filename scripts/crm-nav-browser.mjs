#!/usr/bin/env node
/**
 * Browser evidence for the CRM five-scene navigation.
 *
 * Modes:
 *   --mode capture   record the current rail + screenshots (works on the old shell too)
 *   --mode verify    assert the new IA invariants and capture the same shots
 *
 * Credentials are read from ~/.ila3-admin-credentials (0600) inside this process
 * and passed to the login API; they are never printed or written to the report.
 *
 * Usage:
 *   node scripts/crm-nav-browser.mjs --mode capture --base http://127.0.0.1:3000 \
 *     --label before --out /storage/artifacts/pro/crm-navigation-goal/shots
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
      const text = element.textContent ?? ''
      if (text.startsWith('演示环境') && text.length < 400) element.remove()
      if (text.includes('接受 Cookie') && text.length < 400) element.remove()
    }
  }).catch(() => {})
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
  page.on('pageerror', (error) => console.error(`[${role} pageerror]`, error.message))

  const shot = async (name) => {
    await cleanOverlays(page)
    await page.screenshot({ path: path.join(OUT, `${LABEL}-${role}-${name}.png`), fullPage: false })
  }

  await page.goto('/backend/workbench', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="sidebar"], aside', { timeout: 60000 })
  await page.waitForTimeout(2500)
  const sidebar = await sidebarSnapshot(page)
  await shot('workbench')

  results.push({ role, surface: 'workbench', sidebar })
  if (MODE === 'verify') {
    check(`${role} five scenes`, sidebar.itemCount === 5, `items=${sidebar.itemCount} [${sidebar.items.join(' | ')}]`)
    check(`${role} no group headers`, sidebar.groupHeaders === 0, `headers=${sidebar.groupHeaders}`)
    check(`${role} no nested rail tree`, sidebar.nestedLists === 0, `nested=${sidebar.nestedLists}`)
    check(`${role} rail search hidden`, sidebar.searchVisible === false, `visible=${sidebar.searchVisible}`)
  }

  await page.goto('/backend/customers/companies', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav[aria-label="客户视图"] a, nav[aria-label="Customer views"] a', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(800)
  const customers = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="客户视图"], nav[aria-label="Customer views"]')
    const active = document.querySelector('[data-crm-scene="customers"]')
    return {
      tabs: Array.from(nav?.querySelectorAll('a') ?? []).map((a) => (a.textContent ?? '').trim()),
      active: active?.getAttribute('aria-current') ?? null,
    }
  })
  await shot('customers')
  results.push({ role, surface: 'customers', ...customers })
  if (MODE === 'verify') {
    check(`${role} customer tabs`, customers.tabs.join('/') === '公司/联系人/商机', customers.tabs.join('/'))
    check(`${role} customer scene highlighted`, customers.active === 'page', `aria-current=${customers.active}`)

    // Second level is real navigation: clicking a tab changes the route and
    // browser Back restores the previous tab/page.
    const peopleTab = page.locator('nav[aria-label="客户视图"] a').filter({ hasText: '联系人' }).first()
    await peopleTab.waitFor({ state: 'visible', timeout: 20000 })
    await peopleTab.click()
    await page.waitForURL('**/backend/customers/people', { timeout: 20000 })
    await page.waitForTimeout(1200)
    const peopleActive = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="客户视图"]')
      const current = nav?.querySelector('[aria-current="page"]')
      return current ? (current.textContent ?? '').trim() : null
    })
    check(`${role} tab navigation`, peopleActive === '联系人', `active=${peopleActive}`)
    await page.goBack()
    await page.waitForTimeout(1200)
    check(`${role} browser back`, page.url().includes('/backend/customers/companies'), page.url())

    // Object detail: related-record navigation is present and links to a real page.
    const listed = await context.request.get('/api/customers/companies?page=1&pageSize=1')
    const listedBody = listed.ok() ? await listed.json() : null
    const companyId = listedBody?.items?.[0]?.id ?? listedBody?.data?.[0]?.id ?? null
    if (companyId) {
      await page.goto(`/backend/customers/companies/${companyId}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2500)
      const related = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="关联对象"]')
        return {
          present: Boolean(nav),
          links: Array.from(nav?.querySelectorAll('a') ?? []).map((a) => ({ label: (a.textContent ?? '').trim(), href: a.getAttribute('href') })),
        }
      })
      await shot('company-detail')
      results.push({ role, surface: 'company-detail', ...related })
      check(`${role} record related nav`, related.present && related.links.length > 0, JSON.stringify(related.links))
      check(`${role} related nav uses list filter`, related.links.some((link) => link.href?.includes('companyId=')), JSON.stringify(related.links))
    } else {
      check(`${role} record related nav`, false, 'no company fixture returned by the list API')
    }
  }

  await page.goto('/backend/business', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-business-category]', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(800)
  const business = await page.evaluate(() => ({
    categories: document.querySelectorAll('[data-business-category]').length,
    categoryTabs: document.querySelectorAll('nav[aria-label="业务分类"], nav[aria-label="Business categories"] a').length,
  }))
  await shot('business')
  results.push({ role, surface: 'business', ...business })
  if (MODE === 'verify') {
    check(`${role} business category home`, business.categories > 0, `cards=${business.categories}`)
    const salesTab = page.getByRole('link', { name: '销售', exact: true }).first()
    if (await salesTab.count()) {
      await salesTab.click()
      await page.waitForURL('**/backend/business/sales', { timeout: 15000 })
      await page.waitForTimeout(1200)
      const category = await page.evaluate(() => ({
        heading: document.querySelector('h1')?.textContent ?? '',
        entries: document.querySelectorAll('[data-business-entry]').length,
      }))
      await shot('business-sales')
      results.push({ role, surface: 'business-category', ...category })
      check(`${role} business category page`, category.entries > 0, `heading=${category.heading} entries=${category.entries}`)
    }
  }

  await page.goto('/backend/messages', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const messages = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="消息视图"], nav[aria-label="Message views"]')
    return { tabs: Array.from(nav?.querySelectorAll('a') ?? []).map((a) => (a.textContent ?? '').trim()) }
  })
  await shot('messages')
  results.push({ role, surface: 'messages', ...messages })
  if (MODE === 'verify') check(`${role} message views`, messages.tabs.length >= 3, messages.tabs.join('/'))

  // Single AI usage entry: the rail button opens the existing assistant launcher.
  await page.goto('/backend/workbench', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const aiButton = page.locator('[data-crm-scene="assistant"]')
  if (await aiButton.count()) {
    await aiButton.first().click()
    await page.waitForTimeout(1500)
    const dialog = await page.evaluate(() => Boolean(document.querySelector('[data-ai-launcher-picker], [data-ai-launcher-sheet], [role="dialog"]')))
    check(`${role} AI entry opens assistant`, dialog, `dialog=${dialog}`)
    await page.keyboard.press('Escape')
  } else {
    check(`${role} AI entry opens assistant`, false, 'AI scene button missing')
  }

  await page.goto('/backend/manage', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-manage-search]', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(800)
  const manage = await page.evaluate(() => ({
    search: Boolean(document.querySelector('[data-manage-search]')),
    categories: Array.from(document.querySelectorAll('[data-manage-category]')).map((section) => section.getAttribute('data-manage-category')),
    entries: document.querySelectorAll('[data-manage-entry]').length,
  }))
  await shot('manage')
  results.push({ role, surface: 'manage', ...manage })
  if (MODE === 'verify') {
    check(`${role} management search`, manage.search, `search=${manage.search}`)
    check(`${role} management categories`, manage.categories.length > 0, manage.categories.join(','))
    check(`${role} management entries`, manage.entries > 0, `entries=${manage.entries}`)
    if (manage.search) {
      const firstLabel = (await page.locator('[data-manage-entry]').first().innerText()).split('\n')[0].trim()
      await page.locator('[data-manage-search]').fill(firstLabel)
      await page.waitForTimeout(500)
      const filtered = await page.evaluate((needle) => ({
        entries: document.querySelectorAll('[data-manage-entry]').length,
        text: document.querySelector('main')?.innerText ?? '',
        needle,
      }), firstLabel)
      check(`${role} management search filters`, filtered.entries > 0 && filtered.entries < manage.entries && filtered.text.includes(filtered.needle), `needle=${filtered.needle} entries=${filtered.entries}`)
      await shot('manage-search')
    }
  }

  await page.goto('/backend/profile', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await shot('profile')

  if (MODE === 'verify') {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/backend/customers/companies', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const trigger = page.getByRole('button', { name: /打开菜单|Open menu/ }).first()
    if (await trigger.count()) await trigger.click()
    await page.waitForTimeout(800)
    const mobile = await page.evaluate(() => {
      const nav = document.querySelector('[data-crm-scene-nav="mobile"]')
      return {
        present: Boolean(nav),
        items: Array.from(nav?.querySelectorAll('a,button') ?? []).map((item) => (item.textContent ?? '').trim()),
      }
    })
    await page.screenshot({ path: path.join(OUT, `${LABEL}-${role}-mobile-drawer.png`), fullPage: false })
    results.push({ role, surface: 'mobile', ...mobile })
    check(`${role} mobile drawer scenes`, mobile.items.slice(0, 5).join('/') === '工作台/AI助手/客户/业务/消息', mobile.items.join('/'))
    check(`${role} mobile drawer utility`, mobile.items.includes('管理中心') && mobile.items.includes('个人账户'), mobile.items.join('/'))

    // A direct URL into a former settings page keeps the same five-scene rail.
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/backend/config/sales', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    const direct = await sidebarSnapshot(page)
    await shot('direct-settings-url')
    results.push({ role, surface: 'direct-settings-url', sidebar: direct })
    check(`${role} direct URL keeps rail`, direct.itemCount === 5 && direct.groupHeaders === 0, `items=${direct.itemCount} headers=${direct.groupHeaders}`)

    // Hiding a menu entry is not authorization: an employee who types an
    // admin-only URL must see the denial, and the API must refuse independently.
    if (role === 'employee') {
      await page.goto('/backend/directory/organizations', { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2500)
      const deniedText = await page.evaluate(() => document.querySelector('main')?.innerText ?? '')
      await page.screenshot({ path: path.join(OUT, `${LABEL}-${role}-direct-admin-page.png`), fullPage: false })
      check(`${role} direct admin URL denied`, /Access Denied|无权限/.test(deniedText), deniedText.slice(0, 60).replace(/\n/g, ' '))
    }
  }

  await context.close()
}

await browser.close()

const report = { generatedAt: new Date().toISOString(), base: BASE, label: LABEL, mode: MODE, roles: ROLES, results, failures }
fs.writeFileSync(path.join(OUT, `${LABEL}-browser-report.json`), `${JSON.stringify(report, null, 2)}\n`)
console.log(`[crm-nav-browser] ${failures.length} failure(s); report in ${OUT}`)
if (MODE === 'verify' && failures.length) process.exit(1)
