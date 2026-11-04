import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = 'http://127.0.0.1:3000'
const OUT = '/tmp/visible-all.json'
const MAX_PAGES = 130

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await browser.newContext({
  locale: 'zh-CN',
  viewport: { width: 1500, height: 1000 },
  extraHTTPHeaders: { 'accept-language': 'zh-CN,zh;q=0.9' },
})
const page = await ctx.newPage()
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input[name="email"]', { timeout: 30000 })
await page.fill('input[name="email"]', 'admin@acme.com')
await page.fill('input[name="password"]', 'secret')
await page.click('button[type="submit"]')
await page.waitForURL('**/backend**', { timeout: 60000 }).catch(() => {})
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})

// expand every collapsed sidebar group so all links exist in the DOM
const expandable = await page.locator('aside button, aside [role="button"]').all()
for (const el of expandable) {
  try {
    const text = (await el.innerText()).trim()
    if (text.length < 40) await el.click({ timeout: 800 })
  } catch {
    /* ignore */
  }
}
await page.waitForTimeout(1500)

const collect = () =>
  page.evaluate(() => {
    const out = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
    while (walker.nextNode()) {
      const el = walker.currentNode
      if (el.children.length > 0) continue
      if (el.closest('script,style,noscript')) continue
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const t = (el.textContent || '').trim().replace(/\s+/g, ' ')
      if (!t || t.length > 90) continue
      out.push(t)
    }
    return out
  })

const links = () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href^="/backend"]')).map((a) => a.getAttribute('href')),
  )

const queue = [...new Set(await links())].filter((h) => h && !h.includes('/['))
const visited = new Set()
const seen = new Map()
console.log('seed links:', queue.length)

while (queue.length && visited.size < MAX_PAGES) {
  const path = queue.shift()
  if (!path || visited.has(path)) continue
  visited.add(path)
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(500)
  const texts = await collect()
  for (const t of texts) seen.set(t, (seen.get(t) || 0) + 1)
  if (visited.size % 10 === 0) console.log('visited', visited.size, 'nodes', seen.size)
  for (const href of await links()) {
    if (!href || visited.has(href) || queue.includes(href)) continue
    if (href.startsWith('/backend')) queue.push(href)
  }
}

fs.writeFileSync(OUT, JSON.stringify({ pages: [...visited], texts: [...seen.keys()] }, null, 0), 'utf8')
console.log('pages:', visited.size, 'unique text nodes:', seen.size)
await browser.close()
