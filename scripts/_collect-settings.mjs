import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = 'http://127.0.0.1:3000'
const OUT = '/tmp/visible-settings.json'

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

// 1. settings entry point + its sub navigation
const seeds = ['/backend/settings']
const visited = new Set()
const queue = [...seeds]
const seen = new Map()

while (queue.length && visited.size < 45) {
  const path = queue.shift()
  if (!path || visited.has(path)) continue
  visited.add(path)
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(800)
  const texts = await collect()
  for (const t of texts) seen.set(t, (seen.get(t) || 0) + 1)
  const found = await links()
  console.log('visited', path, 'texts', texts.length, 'links', found.length)
  for (const href of found) {
    if (!href || visited.has(href)) continue
    if (href.startsWith('/backend/settings') || href.includes('/config') || href.startsWith('/backend/settings/')) {
      queue.push(href)
    }
  }
}

fs.writeFileSync(OUT, JSON.stringify({ pages: [...visited], texts: [...seen.keys()] }, null, 0), 'utf8')
console.log('pages:', visited.size, 'unique text nodes:', seen.size)
await browser.close()
