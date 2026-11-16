import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const base = process.env.BASE_URL
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw Error('Explicit loopback BASE_URL required')
const credential = fs.readFileSync(path.join(os.homedir(), '.ila3-admin-credentials'),'utf8').split('\n').map(line=>line.trim().split(/\s+/)).find(parts=>parts.includes('employee@acme.com'))
if (!credential) throw Error('Test credential unavailable')
const login = await fetch(base+'/api/auth/login',{method:'POST',body:new URLSearchParams({email:'employee@acme.com',password:credential[2]}),signal:AbortSignal.timeout(15000)})
assert.equal(login.status,200)
const {token} = await login.json()
assert.ok(token)
const headers={Cookie:'auth_token='+token}
const original=await fetch(base+'/api/crm_navigation/navigation?chrome=1',{headers,signal:AbortSignal.timeout(15000)})
const directory=await original.json()
assert.equal(original.status,200)
const group=directory.crm.groups.find(g=>g.id==='customers')
assert.ok(group?.items.length)
const target=group.items[0].href
const projected=await fetch(base+'/api/crm_navigation/navigation?chrome=1&path='+encodeURIComponent(target),{headers,signal:AbortSignal.timeout(15000)})
const body=await projected.json()
assert.equal(projected.status,200)
assert.equal(body.crm.groups.length,directory.crm.groups.length)
assert.ok(body.groups.length<directory.groups.length)
assert.equal(projected.headers.get('cache-control'),'no-store')
const browser=await chromium.launch({headless:true,timeout:30000})
const results=[]
try {
 for(const [width,scheme] of [[1440,'light'],[390,'light'],[390,'dark']]) {
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:scheme})
  await context.addCookies([{name:'auth_token',value:token,url:base,httpOnly:true,sameSite:'Lax'}])
  const page=await context.newPage()
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+target,{waitUntil:'domcontentloaded',timeout:30000})
  const selector=page.locator('[data-workspace-switcher]')
  await selector.waitFor({state:'visible',timeout:20000})
  await selector.click()
  const options=await page.getByRole('option').allTextContents()
  assert.ok(options.length>1)
  await page.keyboard.press('Escape')
  if(width<600) {
    await page.getByRole('button',{name:'打开菜单',exact:true}).click()
    const drawerLinks=await page.locator('[data-menu-item-id]:visible').count()
    assert.ok(drawerLinks>0,'Mobile drawer must retain authorized links')
    await page.keyboard.press('Escape')
  }
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
  results.push({width,scheme,options:options.length,overflow,errors})
  await context.close()
 }
} finally {await browser.close()}
console.log(JSON.stringify({api:'passed',groupsBefore:directory.groups.length,groupsAfter:body.groups.length,views:results},null,2))
assert.ok(results.every(x=>!x.overflow && x.errors.length===0),'Viewport or runtime regression')
