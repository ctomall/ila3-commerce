#!/usr/bin/env node
/**
 * One-command regression for the UI work (unslop pass).
 *
 * Everything asserted here was measured by hand during the pass; this file keeps
 * those assertions runnable so a future change cannot quietly undo them.
 *
 * Two groups:
 *   - static: HTTP + repository checks, no browser needed
 *   - browser: needs the ego-browser runtime (focus ring, aria-sort, geometry)
 *
 * Usage: node scripts/ui-regression.mjs [--static]
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const EGO = '/home/pro/.dsh-src/profiles/web/node_modules/dsh-ego-browser/runtime/ego-linux/bin/ego-browser.mjs'
const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(38)} ${detail}`)
}

// ---------- static ----------
async function get(url, cookie) {
  const res = await fetch(url, { headers: cookie ? { cookie } : {} })
  return { status: res.status, text: await res.text(), headers: res.headers }
}

async function login() {
  const creds = fs.readFileSync('/home/pro/.ila3-admin-credentials', 'utf8')
  const line = creds.split('\n').find((l) => l.startsWith('superadmin'))
  const [, email, password] = line.trim().split(/\s+/)
  const res = await fetch('http://127.0.0.1:3000/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }),
  })
  const setCookie = res.headers.getSetCookie?.() ?? []
  return setCookie.map((c) => c.split(';')[0]).join('; ')
}

const cookie = await login()
const loginHtml = await get('http://127.0.0.1:3000/login')
const loginKb = Math.round(Buffer.byteLength(loginHtml.text) / 1024)
const keys = new Set([...loginHtml.text.matchAll(/\\"([a-zA-Z][a-zA-Z0-9_]{2,60}\.[a-zA-Z0-9_.]{2,80})\\":/g)].map((m) => m[1]))
record('T1 /login size <= 150KB', loginKb <= 150, `${loginKb}KB`)
record('T1 /login keys <= 1500', keys.size <= 1500, `${keys.size} keys`)

const backend = await get('http://127.0.0.1:3000/backend/customers/companies', cookie)
const notices = (backend.text.match(/notices\./g) || []).length
record('P1 consent copy present', notices > 0, `notices. x${notices}`)

const zh = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/i18n/zh.json'), 'utf8'))
record('P2 no query duration', !/用时/.test(zh['ui.dataTable.pagination.resultsWithDuration'] || ''), 'resultsWithDuration')

try {
  execFileSync('node', ['scripts/verify-patches.mjs'], { cwd: ROOT, stdio: 'pipe' })
  record('T16 managed patches', true, 'all present')
} catch (e) {
  record('T16 managed patches', false, String(e.stdout || e).slice(0, 60))
}
try {
  execFileSync('node', ['scripts/check-token-layers.mjs', '--strict'], { cwd: ROOT, stdio: 'pipe' })
  record('T10 token layers', true, '0 non-semantic')
} catch {
  record('T10 token layers', false, 'violations found')
}

// ---------- browser ----------
if (!process.argv.includes('--static')) {
  const snippet = `
await cdp('Emulation.setDeviceMetricsOverride', { width: 900, height: 800, deviceScaleFactor: 1, mobile: false })
await page.goto('http://127.0.0.1:3000/backend/customers/companies')
await new Promise((r) => setTimeout(r, 4500))
if (await page.evaluate(() => !!document.querySelector('#email'))) {
  console.log('@@DSH_RESULT@@' + JSON.stringify({ needsLogin: true }))
} else {
  const geometry = await page.evaluate(() => {
    const td = document.querySelector('tbody td')
    const th = document.querySelector('thead th')
    const sortable = Array.from(document.querySelectorAll('thead th')).filter((h) => { const b = h.querySelector('button'); return b && (b.innerText || '').trim().length > 0 })
    const tds = Array.from(document.querySelectorAll('td'))
    return {
      tdH: td ? Math.round(td.getBoundingClientRect().height) : null,
      thH: th ? Math.round(th.getBoundingClientRect().height) : null,
      sortable: sortable.length,
      withAriaSort: sortable.filter((h) => h.getAttribute('aria-sort') !== null).length,
      tabular: tds.filter((c) => getComputedStyle(c).fontVariantNumeric.includes('tabular')).length,
      tds: tds.length,
      emoji: ((document.body.innerText || '').match(/[\\u{1F300}-\\u{1FAFF}]/gu) || []).length,
      animating: Array.from(document.querySelectorAll('body *')).filter((el) => (el.className || '').toString().match(/animate-(pulse|ping|bounce|spin)/)).length,
    }
  })
  const rings = []
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab')
    await new Promise((r) => setTimeout(r, 180))
    rings.push(await page.evaluate(() => { const el = document.activeElement; if (!el) return null; const cs = getComputedStyle(el); return cs.outlineStyle + ' ' + cs.outlineWidth }))
  }
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await page.goto('http://127.0.0.1:3000/backend/customers/companies')
  await new Promise((r) => setTimeout(r, 3500))
  const sidebar = await page.evaluate(() => {
    const s = document.querySelector('[data-testid="sidebar"]')
    return s ? { w: Math.round(s.getBoundingClientRect().width), h: Math.round(s.getBoundingClientRect().height) } : null
  })
  console.log('@@DSH_RESULT@@' + JSON.stringify({ needsLogin: false, geometry, rings, sidebar }))
}
`
  try {
    const out = execFileSync('node', [EGO, 'nodejs'], { input: snippet, encoding: 'utf8', timeout: 240000 })
    const line = out.split('\n').find((l) => l.includes('@@DSH_RESULT@@')) || ''
    const data = JSON.parse(line.slice(line.indexOf('@@DSH_RESULT@@') + '@@DSH_RESULT@@'.length))
    if (data.needsLogin) {
      record('browser checks', false, 'SKIPPED — session not logged in')
    } else {
      const g = data.geometry
      record('P0 row height <= 41px', g.tdH !== null && g.tdH <= 41, `${g.tdH}px`)
      record('P0 header height <= 36px', g.thH !== null && g.thH <= 36, `${g.thH}px`)
      record('P1 aria-sort on sortable th', g.sortable > 0 && g.withAriaSort === g.sortable, `${g.withAriaSort}/${g.sortable}`)
      record('P2 tabular figures', g.tds > 0 && g.tabular === g.tds, `${g.tabular}/${g.tds}`)
      record('checklist no emoji', g.emoji === 0, `${g.emoji}`)
      record('checklist no looping motion', g.animating === 0, `${g.animating}`)
      const solid = data.rings.filter((r) => r === 'solid 2px').length
      record('P1 focus ring 2px', solid === data.rings.length, `${solid}/${data.rings.length}`)
      record('P0 sidebar expanded', data.sidebar && data.sidebar.w >= 239, data.sidebar ? `${data.sidebar.w}px` : 'missing')
    }
  } catch (e) {
    record('browser checks', false, String(e.message || e).slice(0, 60))
  }
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exit(1)
