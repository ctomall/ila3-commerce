import {expect,test,type BrowserContext} from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
let cookies:Awaited<ReturnType<BrowserContext['storageState']>>['cookies']=[]
test.beforeAll(async({playwright,baseURL})=>{
 const line=fs.readFileSync(path.join(os.homedir(),'.ila3-admin-credentials'),'utf8').split('\n').map(x=>x.trim().split(/\s+/)).find(x=>x.includes('employee@acme.com'))
 if(!line)throw Error('Test credential unavailable')
 const api=await playwright.request.newContext({baseURL})
 const login=await api.post('/api/auth/login',{form:{email:line[1],password:line[2]}})
 expect(login.status()).toBe(200)
 cookies=(await api.storageState()).cookies
 expect(cookies.length).toBeGreaterThan(0)
 await api.dispose()
})
test.beforeEach(async({context})=>{await context.addCookies(cookies)})
test('authorized directory projects sidebar without removing searchable entries',async({page,request})=>{
 const api=await page.request.get('/api/crm_navigation/navigation?chrome=1&path=/backend/customers/companies')
 expect(api.status()).toBe(200)
 const data=await api.json()
 expect(data.crm.version).toBe(2)
 expect(data.groups.length).toBeLessThan(data.crm.groups.length+1)
 await page.goto('/backend/customers/companies')
 await expect(page.locator('[data-workspace-switcher]')).toBeVisible()
 await page.locator('[data-workspace-switcher]').click()
 expect(await page.getByRole('option').count()).toBeGreaterThan(1)
 await page.keyboard.press('Escape')
 const anonymous=await request.get('/api/crm_navigation/navigation?path=/backend/customers/companies')
 expect(anonymous.status()).toBe(401)
})
test('favorite survives refresh and settings hierarchy remains accessible',async({page,playwright,baseURL})=>{
 // Start from an empty server preference so a previous run cannot turn the
 // "favorite" button into "unfavorite" and make this test state-dependent.
 const api=await playwright.request.newContext({baseURL,storageState:{cookies,origins:[]}})
 expect((await api.put('/api/workspace_settings/preferences',{data:{favorites:[],recentWorkspace:null,selectedPreset:null}})).status()).toBe(200)
 await api.dispose()
 await page.goto('/backend/manage')
 await expect(page.locator('[data-manage-search]')).toBeVisible()
 await expect(page.getByRole('button',{name:'组织与业务设置',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'查找功能入口',exact:true}).click()
 await page.getByRole('textbox',{name:'查找功能入口',exact:true}).fill('客户')
 await expect(page.locator('[data-nav-search-entry]').first()).toBeVisible()
 await page.getByRole('button',{name:'收藏入口',exact:true}).first().click()
 await page.reload()
 await page.getByRole('button',{name:'查找功能入口',exact:true}).click()
 await expect(page.getByRole('button',{name:'取消收藏',exact:true}).first()).toBeVisible()
})
test('mobile drawer and dark mode retain authorized navigation without overflow',async({page})=>{
 await page.setViewportSize({width:390,height:900})
 await page.emulateMedia({colorScheme:'dark'})
 await page.goto('/backend/customers/companies')
 await expect(page.locator('[data-workspace-switcher]')).toBeVisible()
 await page.getByRole('button',{name:'打开菜单',exact:true}).click()
 expect(await page.locator('[data-menu-item-id]:visible').count()).toBeGreaterThan(0)
 await page.keyboard.press('Escape')
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
})

test('model catalog preserves nonempty columns and edit dialog without writes',async({page,context,playwright,baseURL})=>{
 const credential=fs.readFileSync(path.join(os.homedir(),'.ila3-admin-credentials'),'utf8').split('\n').map(x=>x.trim().split(/\s+/)).find(x=>x.includes('superadmin@acme.com'))
 if(!credential)throw Error('Admin test credential unavailable')
 const api=await playwright.request.newContext({baseURL})
 expect((await api.post('/api/auth/login',{form:{email:credential[1],password:credential[2]}})).status()).toBe(200)
 await context.clearCookies()
 await context.addCookies((await api.storageState()).cookies)
 await api.dispose()
 await page.route('**/api/ai_model_config/models',route=>route.request().method()==='GET'?route.fulfill({json:{providers:[{id:'test',name:'Test provider',configured:true,envKey:null,builtinModelCount:1,customModelCount:0,enabledModelCount:1}],models:[{entryId:null,providerId:'test',modelId:'fixture-model',name:'Fixture model',contextWindow:32000,tags:['fast'],enabled:true,builtin:true,overridden:false}],scope:{tenantId:null}}}):route.abort())
 await page.route('**/api/ai_model_config/providers',route=>route.request().method()==='GET'?route.fulfill({json:{providers:[],systemDefault:null}}):route.abort())
 await page.goto('/backend/config/ai-assistant/models')
 await expect(page.locator('[data-ai-models-row="test:fixture-model"]')).toBeVisible()
 expect(await page.getByRole('columnheader').count()).toBe(7)
 await page.locator('[data-ai-models-edit="test:fixture-model"]').click()
 await expect(page.getByRole('dialog')).toBeVisible()
 await page.keyboard.press('Escape')
})

async function loginAs(playwright: import('@playwright/test').PlaywrightWorkerArgs['playwright'], baseURL: string | undefined, role: string) {
  const line = fs.readFileSync(path.join(os.homedir(), '.ila3-admin-credentials'), 'utf8')
    .split('\n').map((x) => x.trim().split(/\s+/)).find((x) => x.includes(role))
  if (!line) throw new Error(`Test credential unavailable: ${role}`)
  const api = await playwright.request.newContext({ baseURL })
  expect((await api.post('/api/auth/login', { form: { email: line[1], password: line[2] } })).status()).toBe(200)
  const state = await api.storageState()
  await api.dispose()
  return state.cookies
}

function orgIdOf(cookies: Awaited<ReturnType<typeof loginAs>>): string {
  const cookie = cookies.find((entry) => entry.name === 'om_selected_org')?.value
  return cookie ?? ''
}

test('workspace editor is gated by its feature, not by a role name', async ({ browser, playwright, baseURL }) => {
  const admin = await loginAs(playwright, baseURL, 'superadmin@acme.com')
  const employee = await loginAs(playwright, baseURL, 'employee@acme.com')

  const probe = await playwright.request.newContext({ baseURL, storageState: { cookies: employee, origins: [] } })
  const nav = await (await probe.get('/api/crm_navigation/navigation?chrome=1&path=/backend')).json()
  const organizationId = nav.navigationPreferenceScope?.organizationId as string | undefined
  await probe.dispose()
  expect(Boolean(organizationId)).toBe(true)

  const employeeContext = await browser.newContext()
  await employeeContext.addCookies(employee)
  const employeePage = await employeeContext.newPage()
  await employeePage.goto('/backend/config/navigation')
  await expect(employeePage.getByText(/Access Denied|无权访问/)).toBeVisible()
  await employeeContext.close()

  const adminContext = await browser.newContext()
  await adminContext.addCookies([
    ...admin,
    { name: 'om_selected_org', value: String(organizationId), url: baseURL!, sameSite: 'Lax' },
  ])
  const adminPage = await adminContext.newPage()
  await adminPage.goto('/backend/config/navigation')
  await expect(adminPage.locator('[data-layout-row]').first()).toBeVisible()
  expect(await adminPage.locator('[data-layout-row]').count()).toBeGreaterThan(3)
  await adminContext.close()
})

test('a stored preference is read back by a browser without local state', async ({ page, context, playwright, baseURL }) => {
  const employee = await loginAs(playwright, baseURL, 'employee@acme.com')
  const api = await playwright.request.newContext({ baseURL, storageState: { cookies: employee, origins: [] } })
  const put = await api.put('/api/workspace_settings/preferences', {
    data: { favorites: ['/backend/customers/companies'], recentWorkspace: 'customers', selectedPreset: null },
  })
  expect(put.status()).toBe(200)
  await api.dispose()

  await context.clearCookies()
  await context.addCookies(employee)
  await page.goto('/backend/manage')
  await expect(page.locator('[data-manage-search]')).toBeVisible()
  await page.getByRole('button', { name: '查找功能入口', exact: true }).click()
  await page.getByRole('textbox', { name: '查找功能入口', exact: true }).fill('客户')
  await expect(page.locator('[data-nav-search-entry]').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '取消收藏', exact: true }).first()).toBeVisible()
})

test('organization label is shared by directory and search while hidden stays sidebar-only',async({page,context})=>{
 await context.route('**/api/crm_navigation/navigation?**',async route=>{
  const response=await route.fetch()
  const payload=await response.json()
  payload.workspaceLayout={version:1,order:['customers'],hidden:['customers'],labels:{customers:'组织客户专用'},presets:[],assignments:{}}
  await route.fulfill({response,json:payload})
 })
 try {
  await page.goto('/backend/business')
  await expect(page.getByRole('heading',{name:'组织客户专用',exact:true})).toBeVisible()
  await page.locator('[data-workspace-switcher]').click()
  expect(await page.getByRole('option',{name:'组织客户专用',exact:true}).count()).toBe(0)
  await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'查找功能入口',exact:true}).click()
  await page.getByRole('textbox',{name:'查找功能入口',exact:true}).fill('组织客户专用')
  await expect(page.locator('[data-nav-search-entry]').first()).toBeVisible()
 } finally { await context.unrouteAll({behavior:'wait'}) }
})

test('direct create-page navigation offers the authorized parent on desktop and mobile',async({page})=>{
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:900})
  await page.goto('/backend/customers/companies/create')
  const link=page.locator('[data-navigation-return]')
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href','/backend/customers/companies')
  await link.click()
  await expect(page).toHaveURL(/\/backend\/customers\/companies$/)
  await expect(page.locator('[data-navigation-return]')).toHaveCount(0)
 }
})

test('embedded table scrolls locally without overflowing the narrow document',async({page,context,playwright,baseURL})=>{
 const admin=await loginAs(playwright,baseURL,'superadmin@acme.com')
 await context.clearCookies();await context.addCookies(admin)
 await page.setViewportSize({width:390,height:900})
 await page.goto('/backend/config/sales')
 await expect(page.locator('main table').first()).toBeVisible()
 const view=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,local:Array.from(document.querySelectorAll('main .isolate')).some(e=>e.scrollWidth>e.clientWidth&&getComputedStyle(e).overflowX==='auto')}))
 expect(view.scroll).toBeLessThanOrEqual(view.width+1)
 expect(view.local).toBe(true)
})

test('detail pages keep a 390px document and wide record tables scroll locally',async({page,context,playwright,baseURL})=>{
 const admin=await loginAs(playwright,baseURL,'superadmin@acme.com')
 await context.clearCookies();await context.addCookies(admin)
 const detailPages=[
  {list:'/api/customers/companies?limit=1',href:(id:string)=>`/backend/customers/companies/${id}`,hasTable:false},
  {list:'/api/sales/orders?limit=1',href:(id:string)=>`/backend/sales/orders/${id}`,hasTable:true},
 ]
 for(const entry of detailPages){
  const response=await page.request.get(entry.list)
  expect(response.status()).toBe(200)
  const data=await response.json()
  const id=data.items?.[0]?.id
  expect(id).toBeTruthy()
  await page.setViewportSize({width:390,height:900})
  await page.goto(entry.href(id))
  await expect(page.locator('main')).toBeVisible()
  await expect(page.locator('header')).toBeVisible()
  if(entry.hasTable){
   // The record table arrives with its own fetch; measure after it is painted.
   await expect(page.locator('main table').first()).toBeVisible()
   await page.waitForTimeout(300)
  }
  const view=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,local:Array.from(document.querySelectorAll('main div.overflow-hidden')).some(e=>e.scrollWidth>e.clientWidth&&getComputedStyle(e).overflowX==='auto')}))
  expect(view.scroll).toBeLessThanOrEqual(view.width+1)
  if(entry.hasTable) expect(view.local).toBe(true)
 }
})

test('wide grid cards keep the narrow document and scroll their table locally',async({page,context,playwright,baseURL})=>{
 const admin=await loginAs(playwright,baseURL,'superadmin@acme.com')
 await context.clearCookies();await context.addCookies(admin)
 await page.setViewportSize({width:390,height:900})
 for(const route of ['/backend/prototype/candidates','/backend/prototype/drafts']){
  await page.goto(route)
  await expect(page.locator('main table').first()).toBeVisible()
  await page.waitForTimeout(300)
  const view=await page.evaluate(()=>({
   width:innerWidth,
   scroll:document.documentElement.scrollWidth,
   local:Array.from(document.querySelectorAll('main div')).some(e=>e.scrollWidth>e.clientWidth&&getComputedStyle(e).overflowX==='auto'),
  }))
  expect(view.scroll).toBeLessThanOrEqual(view.width+1)
  expect(view.local).toBe(true)
 }
})

test('create pages with a settings column keep the desktop and narrow documents',async({page,context,playwright,baseURL})=>{
 const admin=await loginAs(playwright,baseURL,'superadmin@acme.com')
 await context.clearCookies();await context.addCookies(admin)
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900})
  await page.goto('/backend/checkout/pay-links/create')
  await expect(page.locator('main')).toBeVisible()
  await page.waitForTimeout(500)
  const view=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
  expect(view.scroll).toBeLessThanOrEqual(view.width+1)
 }
})
