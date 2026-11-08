#!/usr/bin/env node
/**
 * English-residual sweep for the Chinese UI.
 *
 * Loads the main backend pages in a real browser, extracts visible text, and reports
 * Latin-script words that are probably untranslated. Acronyms and domain terms that
 * are legitimately Latin (AI, API, EUDR, USD, …) are filtered out, so the output is a
 * short list a human can act on rather than a wall of noise.
 *
 * This is a detector, not a gate: it does not fail the build. Its output feeds
 * docs/crm-platform/appendix/i18n-residual.md, and fixing a hit usually means adding a
 * key to src/i18n/zh.json (the pages already call t(key, fallback)).
 *
 * Usage: node scripts/crm-i18n-sweep.mjs [--out path.md]
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const EGO = '/home/pro/.dsh-src/profiles/web/node_modules/dsh-ego-browser/runtime/ego-linux/bin/ego-browser.mjs'
const BASE = process.env.SWEEP_BASE_URL ?? 'http://127.0.0.1:3000'
const CREDENTIALS = '/home/pro/.ila3-admin-credentials'
const outFlag = process.argv.indexOf('--out')
const OUT = path.resolve(outFlag === -1 ? 'docs/crm-platform/appendix/i18n-residual.md' : process.argv[outFlag + 1])

const PAGES = [
  ['/backend', '工作台'],
  ['/backend/customers/companies', '公司'],
  ['/backend/customers/people', '联系人'],
  ['/backend/customers/deals', '商机'],
  ['/backend/sales/quotes', '报价单'],
  ['/backend/sales/orders', '订单'],
  ['/backend/staff/leave-requests', '团队请假'],
  ['/backend/staff/my-leave-requests', '我的请假'],
]

/** Words that are Latin by design. Keep this list short and justified. */
const ALLOW = new Set(
  [
    'ai', 'api', 'apis', 'eudr', 'id', 'ids', 'usd', 'eur', 'cny', 'gbp', 'sku', 'skus',
    'uuid', 'url', 'urls', 'pdf', 'csv', 'xlsx', 'json', 'http', 'https', 'html', 'mcp',
    'dsh', 'crm', 'erp', 'smtp', 'mx', 'dns', 'sso', 'mfa', 'rbac', 'acl', 'utf', 'om',
  ].map((w) => w.toLowerCase()),
)

function credentials() {
  const map = new Map()
  for (const line of fs.readFileSync(CREDENTIALS, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    const [role, email, password] = line.trim().split(/\s+/)
    if (role && email && password) map.set(role, { email, password })
  }
  return map
}

const cred = credentials().get('superadmin')
if (!cred) throw new Error('no superadmin credentials')

const payload = JSON.stringify({ pages: PAGES, allow: [...ALLOW], base: BASE, cred })

const snippet = `
import { readFileSync } from 'node:fs'
const cfg = ${JSON.stringify('@@CFG@@')}
`

const script = `
const PAGES = ${JSON.stringify(PAGES.map(([href, label]) => ({ href, label })))}
const BASE = ${JSON.stringify(BASE)}
const ALLOW = new Set(${JSON.stringify([...ALLOW])})
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.evaluate(async (cred) => {
  const body = new URLSearchParams(cred)
  await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() })
}, ${JSON.stringify(cred)})
const results = []
for (const item of PAGES) {
  await page.goto(BASE + item.href, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3500)
  const text = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body
    return main.innerText || ''
  })
  const words = new Map()
  for (const raw of text.split(/[^A-Za-z]+/)) {
    const word = raw.trim()
    if (word.length < 3) continue
    if (ALLOW.has(word.toLowerCase())) continue
    words.set(word, (words.get(word) || 0) + 1)
  }
  const samples = [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  results.push({ href: item.href, label: item.label, samples, textLength: text.length })
}
console.log('@@DSH_RESULT@@' + JSON.stringify({ results }))
`

// Simpler and safer: run the browser snippet through ego-browser's stdin interface.
const run = execFileSync('node', [EGO, 'nodejs'], { input: script, encoding: 'utf8', timeout: 300000 })
const line = run.split('\n').find((l) => l.includes('@@DSH_RESULT@@'))
if (!line) {
  console.error('[i18n-sweep] browser did not return a result')
  process.exit(1)
}
const data = JSON.parse(line.slice(line.indexOf('@@DSH_RESULT@@') + '@@DSH_RESULT@@'.length))

const hits = data.results.filter((r) => r.samples.length > 0)
const lines = [
  '# 中文界面英语残留扫描',
  '',
  `生成时间：${new Date().toISOString()} · 页面 ${data.results.length} · 有残留 ${hits.length}`,
  '',
  '扫描方式：真实浏览器登录后逐页取 `main` 文本，按非字母切词，过滤掉合法拉丁缩写（AI/API/EUDR/USD…）。',
  '命中不等于错误——专有名词也会命中；这里只是把可能需要翻译的地方列出来。',
  '',
]

for (const r of data.results) {
  lines.push(`## ${r.label} · \`${r.href}\``, '')
  if (!r.samples.length) {
    lines.push('无拉丁词命中。', '')
    continue
  }
  lines.push('| 词 | 次数 |', '|---|---|')
  for (const [word, count] of r.samples) lines.push(`| ${word} | ${count} |`)
  lines.push('')
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, lines.join('\n') + '\n')
console.log(`[i18n-sweep] ${hits.length}/${data.results.length} page(s) with Latin hits -> ${path.relative(process.cwd(), OUT)}`)
for (const r of hits) console.log(`  ${r.href}: ${r.samples.map(([w, c]) => `${w}×${c}`).join(', ')}`)
