import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = 'http://127.0.0.1:3000'
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

const hrefs = await page.evaluate(() => {
  const aside = document.querySelector('aside')
  if (!aside) return []
  return Array.from(aside.querySelectorAll('a[href^="/backend"]')).map((a) => a.getAttribute('href'))
})
const unique = [...new Set(hrefs)].slice(0, 18)
console.log('pages:', unique.length)

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

const seen = new Map()
const pages = [page.url(), ...unique]
for (const p of pages) {
  const url = p.startsWith('http') ? p : BASE + p
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1200)
  const texts = await collect()
  for (const t of texts) seen.set(t, (seen.get(t) || 0) + 1)
  console.log('visited', url, 'texts', texts.length)
}

fs.writeFileSync('/tmp/visible-text.json', JSON.stringify({ pages, texts: [...seen.keys()] }, null, 0), 'utf8')
console.log('unique text nodes:', seen.size)
await browser.close()
