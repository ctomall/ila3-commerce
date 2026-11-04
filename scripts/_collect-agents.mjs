import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = 'http://127.0.0.1:3000'
const OUT = '/tmp/visible-agents.json'
const PAGES = [
  '/backend/config/ai-assistant/agents',
  '/backend/config/ai-assistant/settings',
  '/backend/config/ai-assistant/usage',
  '/backend/config/ai-assistant/playground',
  '/backend/config/ai-assistant/allowlist',
  '/backend/config/ai-assistant/moderation-flags',
  '/backend/config/ai-assistant/legacy',
]

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await browser.newContext({
  locale: 'zh-CN',
  viewport: { width: 1500, height: 1200 },
  extraHTTPHeaders: { 'accept-language': 'zh-CN,zh;q=0.9' },
})
const api = await ctx.request.post(`${BASE}/api/auth/login`, {
  form: { email: 'admin@acme.com', password: 'secret' },
})
console.log('login', api.status())
const page = await ctx.newPage()

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
      if (!t || t.length > 120) continue
      out.push(t)
    }
    return out
  })

const seen = new Map()
for (const p of PAGES) {
  await page.goto(BASE + p, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(2000)
  const texts = await collect()
  console.log('visited', p, texts.length)
  for (const t of texts) seen.set(t, (seen.get(t) || 0) + 1)
  // expand accordions / details on the agents page so hidden text is captured too
  for (const el of await page.locator('button, summary, [role="button"]').all()) {
    try {
      const txt = (await el.innerText()).trim()
      if (txt && txt.length < 40) await el.click({ timeout: 500 })
    } catch {
      /* ignore */
    }
  }
  await page.waitForTimeout(800)
  for (const t of await collect()) seen.set(t, (seen.get(t) || 0) + 1)
  await page.screenshot({ path: `/tmp/om-final/${p.split('/').pop()}.png`, fullPage: true }).catch(() => {})
}

fs.writeFileSync(OUT, JSON.stringify({ pages: PAGES, texts: [...seen.keys()] }, null, 0), 'utf8')
console.log('unique text nodes:', seen.size)
await browser.close()
