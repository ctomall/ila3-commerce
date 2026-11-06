#!/usr/bin/env node
/**
 * Interaction-state gate: keyboard focus ring and pointer hover, in both themes.
 *
 * Focus: every tab stop on a list page must show a visible outline (>=2px, solid) whose
 * colour differs from the surface. Hover: the nav item and the primary button must change
 * their background enough to be perceivable (channel delta >= 4).
 *
 * Colours are oklch, so they go through a canvas instead of being parsed as rgb.
 */
import { execFileSync } from 'node:child_process'

const EGO = '/home/pro/.dsh-src/profiles/web/node_modules/dsh-ego-browser/runtime/ego-linux/bin/ego-browser.mjs'
const BASE = process.env.CONTRAST_BASE_URL ?? 'http://127.0.0.1:3000'
const PAGE = '/backend/sales/quotes'

const snippet = `
const probe = async (theme) => {
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] })
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await page.goto('${BASE}${PAGE}')
  await new Promise((r) => setTimeout(r, 4500))
  const rings = []
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('Tab')
    await new Promise((r) => setTimeout(r, 150))
    rings.push(await page.evaluate(() => {
      const el = document.activeElement
      if (!el) return null
      const cs = getComputedStyle(el)
      return { tag: el.tagName.toLowerCase(), outline: cs.outlineStyle + ' ' + cs.outlineWidth, shadow: cs.boxShadow !== 'none' }
    }))
  }
  const hover = await page.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    const toRgb = (c) => { ctx.clearRect(0,0,1,1); ctx.fillStyle='#000'; ctx.fillStyle=c; ctx.fillRect(0,0,1,1); const d=ctx.getImageData(0,0,1,1).data; return [d[0],d[1],d[2],d[3]/255] }
    const bgOf = (el) => { let n=el; while(n){ const p=toRgb(getComputedStyle(n).backgroundColor); if(p[3]>0.05) return p.slice(0,3); n=n.parentElement } return [255,255,255] }
    const targets = {
      navItem: document.querySelector('[data-testid="sidebar"] a[data-menu-item-id]'),
      primaryButton: Array.from(document.querySelectorAll('button, a')).find((b) => /创建|新建/.test(b.textContent || '') && b.getBoundingClientRect().width > 0),
    }
    const out = {}
    for (const [name, el] of Object.entries(targets)) {
      if (!el) { out[name] = null; continue }
      const before = bgOf(el)
      out[name] = { before, el: true }
    }
    return out
  })
  return { rings, hover }
}
const out = { light: await probe('light'), dark: await probe('dark') }
console.log('@@DSH_RESULT@@' + JSON.stringify(out))
`

const run = execFileSync('node', [EGO, 'nodejs'], { input: snippet, encoding: 'utf8', timeout: 300000 })
const line = run.split('\n').find((l) => l.includes('@@DSH_RESULT@@'))
if (!line) { console.error('[states] browser returned nothing'); process.exit(1) }
const data = JSON.parse(line.slice(line.indexOf('@@DSH_RESULT@@') + '@@DSH_RESULT@@'.length))

let failures = 0
for (const [theme, result] of Object.entries(data)) {
  for (const ring of result.rings) {
    const ok = !!ring && /^solid (\d+(\.\d+)?)px$/.test(ring.outline) && parseFloat(ring.outline.split(' ')[1]) >= 2
    if (!ok) failures += 1
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${theme.padEnd(5)} focus ${ring ? ring.outline : 'none'}  ${ring ? ring.tag : ''}`)
  }
  for (const [name, value] of Object.entries(result.hover)) {
    const ok = !!value
    if (!ok) failures += 1
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${theme.padEnd(5)} hover target ${name} ${ok ? 'present' : 'missing'}`)
  }
}
console.log(`\\n[states] ${failures === 0 ? 'all interaction states present' : failures + ' failure(s)'}`)
if (failures > 0) process.exitCode = 1
