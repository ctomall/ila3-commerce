import { expect, test, type BrowserContext } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * M3 prototype acceptance, done with a browser instead of a screenshot.
 *
 * Why this file exists: `.ai/qa` shipped with a Playwright config and zero specs, so
 * `yarn test:integration` exited 1 with "No tests found". The route was never exercised
 * by anything that could fail, which is the same class of defect as a gate that always
 * returns zero.
 *
 * What it proves, and nothing more:
 * - every prototype route renders the "非生产数据" banner, so demo data cannot be
 *   mistaken for real data by whoever is looking at the screen;
 * - that banner is absent from the real shell and from the pages an anonymous visitor
 *   can reach (`/`, `/login`), so it cannot silently become site-wide decoration;
 *   `/backend/settings` and other internal pages are not asserted — do not read this
 *   as "we proved it is on prototype routes only";
 * - the six pages agree with each other about which one is active;
 * - the prototype is reachable by a logged-in user but NOT present in the sidebar,
 *   which is what keeps the navigated-entry baseline stable;
 * - an anonymous request does not get the page.
 *
 * One login for the whole file: the login endpoint allows five attempts per minute per
 * IP, and a full `crm-verify-all --full` already spends some of that budget.
 */

const CREDENTIAL_FILE = path.join(os.homedir(), '.ila3-admin-credentials')

function credential(role: string): { email: string; password: string } {
  const fromEnv = process.env.CRM_TEST_EMAIL && process.env.CRM_TEST_PASSWORD
  if (fromEnv) return { email: process.env.CRM_TEST_EMAIL!, password: process.env.CRM_TEST_PASSWORD! }
  const raw = fs.readFileSync(CREDENTIAL_FILE, 'utf8')
  for (const line of raw.split('\n')) {
    const [name, email, password] = line.trim().split(/\s+/)
    if (name === role && email && password) return { email, password }
  }
  throw new Error(`no "${role}" credential in ${CREDENTIAL_FILE}`)
}

const PAGES = [
  { href: '/backend/prototype', label: '业务员首页' },
  { href: '/backend/prototype/tasks', label: '开发任务' },
  { href: '/backend/prototype/candidates', label: '候选审核' },
  { href: '/backend/prototype/accounts', label: '客户列表' },
  { href: '/backend/prototype/accounts/detail', label: '客户详情' },
  { href: '/backend/prototype/drafts', label: '邮件草稿审批' },
]

let sessionCookies: Awaited<ReturnType<BrowserContext['storageState']>>['cookies'] = []
let loginStatus = 0

test.beforeAll(async ({ playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL })
  const response = await request.post('/api/auth/login', { form: credential('admin') })
  loginStatus = response.status()
  const state = await request.storageState()
  sessionCookies = state.cookies
  await request.dispose()
})

test.beforeEach(async ({ context }) => {
  expect(loginStatus, '登录必须成功，否则后面的断言没有意义').toBe(200)
  // A 200 login with no cookie would leave every "count is 0" assertion below green
  // while the browser is anonymous, so the session itself is asserted.
  expect(sessionCookies.length, '登录必须返回 cookie，否则后面测的是匿名视图').toBeGreaterThan(0)
  await context.addCookies(sessionCookies)
})

test.describe('CRM 原型六页', () => {
  test('每一页都带「非生产数据」横幅，且只有当前页被标为 active', async ({ page }) => {
    for (const target of PAGES) {
      const response = await page.goto(target.href)
      expect(response?.status(), `${target.href} 应该 200`).toBe(200)

      await expect(page.getByText('原型演示').first()).toBeVisible()
      // The banner promises "不落库 · 不发送"; if that wording disappears the promise
      // is no longer on screen, so pin it.
      await expect(page.getByText(/非生产数据/).first()).toBeVisible()
      await expect(page.getByText(/不落库/).first()).toBeVisible()
      await expect(page.getByText(/不发送/).first()).toBeVisible()

      const nav = page.getByRole('navigation', { name: '原型页面' })
      await expect(nav).toBeVisible()
      await expect(nav.getByRole('link')).toHaveCount(PAGES.length)
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1)
      await expect(nav.locator('[aria-current="page"]')).toHaveText(target.label)
    }
  })

  /**
   * 目标原文要求原型覆盖：无权限 / 空 / 错误 / 预算 / 重复 / 并发冲突 / 发送未知 / 断线取消。
   * 这八项此前只写在文档表格里，浏览器从未点过。每条都断言那句"为什么这样处理"，而不是只断言
   * 状态标签存在——标签存在而文案缺失，等于没演示。
   */
  test('八个边界状态都能在原型里点到，且文案说明了处理方式', async ({ page }) => {
    const clickState = async (label: string) => {
      await page.getByRole('button', { name: label, exact: true }).first().click()
    }

    await page.goto('/backend/prototype/tasks')
    await clickState('空')
    await expect(page.getByText(/还没有数据/).first()).toBeVisible()
    await clickState('错误')
    await expect(page.getByText(/加载失败/).first()).toBeVisible()
    await clickState('无权限')
    await expect(page.getByText(/404 而不是 403/).first()).toBeVisible()
    await clickState('额度耗尽')
    await expect(page.getByText(/12 \/ 12/).first()).toBeVisible()
    await clickState('重复')
    await expect(page.getByText(/已存在/).first()).toBeVisible()
    await clickState('并发冲突')
    await expect(page.getByText(/版本 7 → 8/).first()).toBeVisible()
    await clickState('连接中断')
    await expect(page.getByText(/重连后从上次游标继续/).first()).toBeVisible()
    await clickState('已取消')
    await expect(page.getByText(/额度已退回/).first()).toBeVisible()

    // 发送未知在草稿页，且必须强调"先查不重发"，否则复制这条文案的人会写成一个重发按钮。
    await page.goto('/backend/prototype/drafts')
    await clickState('发送未知')
    await expect(page.getByText(/先查询，不重发/).first()).toBeVisible()
  })

  test('真实后台页没有原型横幅，侧边导航也没有原型入口', async ({ page }) => {
    const response = await page.goto('/backend')
    expect(response?.status()).toBe(200)

    // Without this, an unauthenticated visit lands on /login?redirect=%2Fbackend with
    // status 200, where every "count is 0" assertion below passes while nothing about
    // the real shell was ever observed. An independent review proved that hole.
    expect(page.url(), '/backend 必须真的停在后台，而不是被重定向到登录页').not.toContain('/login')
    expect(page.url()).toContain('/backend')

    // This is the discriminating assertion: the marker exists, so a leak into the real
    // shell would be caught here rather than being admired as "consistent design".
    await expect(page.getByText(/非生产数据/)).toHaveCount(0)
    for (const target of PAGES) {
      await expect(page.getByRole('link', { name: target.label, exact: true })).toHaveCount(0)
    }
  })

  test('未登录拿不到原型页', async ({ browser, baseURL }) => {
    const anonymous = await browser.newContext()
    const page = await anonymous.newPage()
    const response = await page.goto(`${baseURL}/backend/prototype`)
    // Either the request is refused or it lands on the login screen; both mean the page
    // is not served to an anonymous visitor.
    const landedOnLogin = page.url().includes('/login')
    expect(landedOnLogin || (response?.status() ?? 0) >= 300).toBe(true)
    await expect(page.getByText(/非生产数据/)).toHaveCount(0)

    // The banner must not leak onto the pages an unauthenticated visitor can see either.
    for (const open of ['/', '/login']) {
      const res = await page.goto(`${baseURL}${open}`)
      expect(res?.status() ?? 0, `${open} 不该 5xx`).toBeLessThan(500)
      await expect(page.getByText(/非生产数据/)).toHaveCount(0)
    }
    await anonymous.close()
  })
})
