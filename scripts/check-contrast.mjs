#!/usr/bin/env node
/**
 * Contrast gate for the app's key text roles, in both themes.
 *
 * Colours are oklch, so computed styles cannot be parsed as rgb — a naive parse reported
 * 1.0-1.5 for everything and would have "fixed" contrast that was already fine. The
 * measurement renders each colour through a canvas and reads the pixel.
 *
 * Threshold: WCAG AA for normal text is 4.5:1; large text (>=24px, or >=18.66px bold) is 3:1.
 *
 * A pass also requires the measurement to have happened on the intended page: an
 * unauthenticated visit lands on /login, where most selectors do not exist. The sample
 * list used to be filtered down to whatever rendered, so that run reported "1/1 within
 * AA" and PASSED. The gate now asserts the page URL and the full sample count.
 *
 * Usage: node scripts/check-contrast.mjs [--json]
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const EGO = '/home/pro/.dsh-src/profiles/web/node_modules/dsh-ego-browser/runtime/ego-linux/bin/ego-browser.mjs'
const BASE = process.env.CONTRAST_BASE_URL ?? 'http://127.0.0.1:3000'
const PAGE = process.env.CONTRAST_PAGE ?? '/backend/sales/quotes'

const SAMPLE_NAMES = ['body', 'table header', 'page title', 'muted text', 'sidebar group', 'primary button']

const snippet = `
const COOKIES = __COOKIES__
for (const c of COOKIES) await cdp('Network.setCookie', c)

const measure = async (theme) => {
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] })
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await page.goto('${BASE}${PAGE}')
  // Wait for the page's primary action instead of a fixed 5s: on a cold session the
  // shell + table can take longer, and a missing primary button fails the gate for a
  // timing reason rather than a contrast one (2026-11-10: "5/6 samples rendered").
  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => /创建销售单据|创建订单/.test(document.body.innerText))
    if (ready) break
    await new Promise((r) => setTimeout(r, 1000))
  }
  await new Promise((r) => setTimeout(r, 1500))
  return await page.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    const toRgb = (c) => { ctx.clearRect(0,0,1,1); ctx.fillStyle='#000'; ctx.fillStyle=c; ctx.fillRect(0,0,1,1); const d=ctx.getImageData(0,0,1,1).data; return [d[0],d[1],d[2],d[3]/255] }
    const over = (fg,bg) => fg[3] >= 0.99 ? fg : [0,1,2].map(i=>Math.round(fg[i]*fg[3]+bg[i]*(1-fg[3])))
    const lum = ([r,g,b]) => { const f=(v)=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4)}; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b) }
    const ratio = (a,b) => { const l1=lum(a), l2=lum(b); const [hi,lo]=l1>l2?[l1,l2]:[l2,l1]; return (hi+0.05)/(lo+0.05) }
    const bgOf = (el) => { let n=el; while(n){ const p=toRgb(getComputedStyle(n).backgroundColor); if(p[3]>0.05) return p.slice(0,3); n=n.parentElement } return [255,255,255] }
    const pick = (sel) => document.querySelector(sel)
    const samples = [
      ['body', pick('table tbody td span')],
      ['table header', pick('table thead th')],
      ['page title', pick('h1') || pick('h2')],
      ['muted text', pick('.text-muted-foreground')],
      // The five-scene rail replaced the old grouped sidebar, so the data attribute this
      // sample relied on is gone; a rail link is the closest equivalent text role.
      ['sidebar group', pick('[data-testid="sidebar"] a') || pick('[data-sidebar-group="true"] button')],
      // Locale-agnostic: the primary action is the create-document link. Matching on its
      // Chinese label failed whenever the measuring session rendered English.
      ['primary button', document.querySelector('a[data-slot="button"][href*="/backend/sales/documents/create"]')
        || Array.from(document.querySelectorAll('button, a')).find((b)=>/创建销售单据|创建订单|create (sales|order)/i.test(b.innerText||''))],
    ].filter(([, el]) => el)
    const measured = samples.map(([name, el]) => {
      const cs = getComputedStyle(el); const bg = bgOf(el)
      const fg = over(toRgb(cs.color), bg)
      const size = parseFloat(cs.fontSize); const bold = Number(cs.fontWeight) >= 700
      const large = size >= 24 || (bold && size >= 18.66)
      return { name, ratio: +ratio(fg,bg).toFixed(2), threshold: large ? 3 : 4.5, size, bold }
    })
    return {
      url: location.pathname + location.search,
      expected: ${SAMPLE_NAMES.length},
      items: measured,
    }
  })
}
const out = { light: await measure('light'), dark: await measure('dark') }
console.log('@@DSH_RESULT@@' + JSON.stringify(out))
`

// Log in as superadmin from the outer process and hand the cookies to the browser
// snippet: the profile may be signed in as an ordinary employee, whose view has no
// create button, which made the primary-button sample disappear for the wrong reason.
const credLines = fs
  .readFileSync('/home/pro/.ila3-admin-credentials', 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => line.split(/\s+/))
const adminCred = credLines.find((parts) => parts[0] === 'superadmin')
if (!adminCred) {
  console.error('[contrast] no superadmin credential in ~/.ila3-admin-credentials')
  process.exit(1)
}
const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ email: adminCred[1], password: adminCred[2] }).toString(),
})
if (!loginRes.ok) {
  console.error(`[contrast] login failed: ${loginRes.status}`)
  process.exit(1)
}
const cookies = (loginRes.headers.getSetCookie?.() ?? []).map((raw) => {
  const pair = raw.split(';')[0]
  const at = pair.indexOf('=')
  return { name: pair.slice(0, at), value: pair.slice(at + 1), url: BASE, path: '/', httpOnly: true, secure: false }
})
// A brand-new session has no organization selected, so /backend renders the chooser
// instead of the page under test. The token already names the tenant and organization.
const loginBody = await loginRes.json().catch(() => null)
const token = loginBody?.token
if (typeof token === 'string' && token.split('.').length === 3) {
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
  if (claims.tenantId) cookies.push({ name: 'om_selected_tenant', value: String(claims.tenantId), url: BASE, path: '/', httpOnly: false, secure: false })
  if (claims.orgId) cookies.push({ name: 'om_selected_org', value: String(claims.orgId), url: BASE, path: '/', httpOnly: false, secure: false })
}

const run = execFileSync('node', [EGO, 'nodejs'], { input: snippet.replace('__COOKIES__', JSON.stringify(cookies)), encoding: 'utf8', timeout: 300000 })
const line = run.split('\n').find((l) => l.includes('@@DSH_RESULT@@'))
if (!line) {
  console.error('[contrast] browser did not return a measurement')
  process.exit(1)
}
const data = JSON.parse(line.slice(line.indexOf('@@DSH_RESULT@@') + '@@DSH_RESULT@@'.length))

let failures = 0
const rows = []
for (const [theme, items] of Object.entries(data)) {
  const seen = items?.url ?? '(none)'
  const expectedCount = items?.expected ?? SAMPLE_NAMES.length
  const measured = Array.isArray(items?.items) ? items.items : []
  if (seen !== PAGE) {
    console.error(`[contrast] ${theme}: measured ${seen} instead of ${PAGE} — the page did not render (not signed in?), refusing to pass`)
    failures += 1
  }
  if (measured.length < expectedCount) {
    // Name the samples that are actually absent: slicing by count blamed whatever came
    // last in the list, which sent one debugging session after the wrong selector.
    const seenNames = new Set(measured.map((item) => item.name))
    const missing = SAMPLE_NAMES.filter((name) => !seenNames.has(name))
    console.error(`[contrast] ${theme}: only ${measured.length}/${expectedCount} samples rendered (missing: ${missing.join(', ')})`)
    failures += 1
  }
  for (const item of measured) {
    const ok = item.ratio >= item.threshold
    if (!ok) failures += 1
    rows.push({ theme, ...item, ok })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${theme.padEnd(5)} ${item.name.padEnd(16)} ${String(item.ratio).padStart(6)}:1  (needs ${item.threshold})`)
  }
}
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2))
console.log(`\n[contrast] ${rows.length - failures}/${rows.length} within AA`)
switch (failures) {
  case 0:
    break
  default:
    process.exitCode = 1
}
