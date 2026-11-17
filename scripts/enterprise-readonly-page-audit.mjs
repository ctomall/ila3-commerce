import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const base=process.env.BASE_URL
const output=process.argv[2]
if(!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base) || !output) throw Error('Explicit loopback BASE_URL and output required')
const credentialFile=process.env.CRM_TEST_CREDENTIAL_FILE
if(!credentialFile)throw Error('Explicit test credential file required')
const parts=fs.readFileSync(credentialFile,'utf8').split('\n').map(x=>x.trim().split(/\s+/)).find(x=>x.includes('superadmin@acme.com'))
if(!parts)throw Error('Superadmin test credential missing')
const response=await fetch(base+'/api/auth/login',{method:'POST',body:new URLSearchParams({email:parts[1],password:parts[2]}),signal:AbortSignal.timeout(15000)})
if(!response.ok)throw Error('Test login failed: '+response.status)
const {token}=await response.json()
const headers={Cookie:'auth_token='+token}
const nav=await(await fetch(base+'/api/crm_navigation/navigation?chrome=1&path=/backend',{headers,signal:AbortSignal.timeout(20000)})).json()
if(!nav.crm||nav.crm.error)throw Error('Authorized directory missing')
const entries=[...nav.crm.groups.flatMap(g=>g.items),...nav.crm.manage.categories.flatMap(g=>g.items),...nav.crm.personal.items]
const unique=[...new Map(entries.map(x=>[x.href,x])).values()]
const browser=await chromium.launch({timeout:30000})
const results=[]
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true})
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}})
 await context.addCookies([{name:'auth_token',value:token,url:base,httpOnly:true,sameSite:'Lax'}])
 // No writes during a read-only coverage sweep, including unexpected page effects.
 await context.route('**/api/**',async route=>{
  if(!['GET','HEAD','OPTIONS'].includes(route.request().method()))return route.abort()
  return route.continue()
 })
 const page=await context.newPage()
 let pageErrors=[]
 page.on('pageerror',error=>pageErrors.push(error.name))
 for(const entry of unique){
  pageErrors=[]
  const record={route:entry.href,label:entry.label,verification:'readonly-render-only',viewports:[]}
  try{
   const r=await page.goto(base+entry.href,{waitUntil:'domcontentloaded',timeout:20000})
   record.status=r?.status()??null
   await page.locator('main').waitFor({timeout:10000})
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:900})
    const view=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,title:document.querySelector('main h1,main h2')?.textContent?.trim()??null,denied:/Access Denied|无权访问/.test(document.querySelector('main')?.textContent??''),crashed:/Application error|Something went wrong/.test(document.querySelector('main')?.textContent??'')}))
    record.viewports.push(view)
   }
   record.pageErrors=[...new Set(pageErrors)]
  }catch(error){record.failure=error.name;record.message='Navigation or content readiness failed; inspect locally without logging request headers'}
  results.push(record)
  fs.writeFileSync(output,JSON.stringify({base,scope:'authorized-navigation-static-destinations',count:unique.length,completed:results.length,results},null,2)+'\n')
  console.log(JSON.stringify({route:entry.href,status:record.status,failure:record.failure,overflow:record.viewports.some(v=>v.scrollWidth>v.width+1)}))
 }
 await context.unrouteAll({behavior:'wait'})
 await context.close()
}finally{await browser.close()}
