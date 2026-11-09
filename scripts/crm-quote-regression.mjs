#!/usr/bin/env node
/**
 * Regression check for the quote → order fixes this project already shipped.
 *
 * The goal says the existing quote/order work must survive every later change, so this
 * re-proves the three behaviours instead of trusting that they still hold:
 *   1. converting a draft quote is refused with 409 and a reason that says what to do;
 *   2. a wrong payload key is a 422 with the offending field path, not a 409;
 *   3. the status dictionary labels carry no carriage returns.
 *
 * Read-only by intent: the convert attempts must all fail, and the script asserts the
 * quote is still a draft and the order count did not move.
 *
 * Usage: node scripts/crm-quote-regression.mjs [--quote <uuid>] [--out <dir>]
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { credentials, loginWithRetry } from './lib/session.mjs'

const BASE = process.env.QUOTE_BASE_URL ?? 'http://127.0.0.1:3000'
const outFlag = process.argv.indexOf('--out')
const OUT = path.resolve(outFlag === -1 ? 'docs/crm-platform/regression' : process.argv[outFlag + 1])

function arg(name) {
  const at = process.argv.indexOf(name)
  return at === -1 ? null : process.argv[at + 1]
}

function psql(sql) {
  try {
    return execFileSync(
      'bash',
      ['-lc', `cd /home/pro/apps/mercato && export $(grep -E "^DATABASE_URL" .env | xargs) && psql "$DATABASE_URL" -At -c ${JSON.stringify(sql)}`],
      { encoding: 'utf8' },
    ).trim()
  } catch (error) {
    return `__ERROR__ ${String(error).slice(0, 120)}`
  }
}

async function post(cookie, apiPath, body) {
  const res = await fetch(`${BASE}${apiPath}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* keep text */
  }
  return { status: res.status, json, text }
}

/**
 * A self-created fixture, only with --create-fixture.
 *
 * The regression needs one draft quote and the table may hold none (the last one was
 * consumed by a business action on 2026-11-09). Creating and deleting one row is a data
 * write, so it is never implicit: without the flag the gate fails with the reason and the
 * two ways forward.
 *
 * The scope comes from an existing quote (`insert ... select tenant_id, organization_id`)
 * rather than being typed in: a hand-written scope is how a fixture ends up in a
 * tenant/organization combination that exists nowhere, and the resulting 403 looks like a
 * product bug. That mistake was made once while building this.
 */
const CREATE_FIXTURE = process.argv.includes('--create-fixture')
const psqlExec = (sql) => {
  try {
    return execFileSync(
      'bash',
      ['-lc', `cd /home/pro/apps/mercato && export $(grep -E "^DATABASE_URL" .env | xargs) && psql "$DATABASE_URL" -At -c ${JSON.stringify(sql)}`],
      { encoding: 'utf8' },
    ).trim()
  } catch (error) {
    return `__ERROR__ ${String(error).slice(0, 200)}`
  }
}

const existingDraft = psql("select id from sales_quotes where status = 'draft' order by created_at desc limit 1")
let quoteId = arg('--quote') ?? existingDraft
let fixtureId = null
if ((!quoteId || quoteId.startsWith('__ERROR__')) && CREATE_FIXTURE) {
  const created = psqlExec(
    "insert into sales_quotes (id, tenant_id, organization_id, quote_number, currency_code, status, created_at, updated_at) " +
      "select gen_random_uuid(), tenant_id, organization_id, 'FIXTURE-QR-' || to_char(now(), 'YYYYMMDDHH24MISS'), 'CNY', 'draft', now(), now() " +
      "from sales_quotes limit 1 returning id",
  )
  if (created.startsWith('__ERROR__') || created === '') {
    console.error(`[quote-regression] 无法创建夹具：${created}`)
    process.exit(1)
  }
  fixtureId = created.split('\n')[0].trim()
  quoteId = fixtureId
  console.log(`[quote-regression] 夹具已创建 ${fixtureId}（--create-fixture，结束时删除）`)
  const cleanup = () => {
    const out = psqlExec(`delete from sales_quotes where id = '${fixtureId}'`)
    const left = psql("select count(*) from sales_quotes where quote_number like 'FIXTURE-QR-%'")
    console.log(`[quote-regression] 夹具已删除 ${fixtureId}${out.startsWith('__ERROR__') ? `（删除失败：${out}）` : ''}，残留 ${left} 行`)
  }
  process.on('exit', cleanup)
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(130))
}
if (!quoteId || quoteId.startsWith('__ERROR__')) {
  // A bare "cannot resolve" is unactionable. Print what the table actually holds, so the
  // next person sees whether the fixture was consumed, never existed, or was never a draft.
  const breakdown = psql(
    "select coalesce(status, '<null>') || '=' || count(*) from sales_quotes group by status order by 1",
  )
  console.error(`[quote-regression] cannot resolve a draft quote: ${quoteId}`)
  console.error(`[quote-regression] sales_quotes 现状：${breakdown.startsWith('__ERROR__') ? breakdown : breakdown.split('\n').join(' · ')}`)
  console.error('[quote-regression] 两条可行路径：')
  console.error('[quote-regression]   1) 指定现成的一条：--quote <uuid>（该草稿必须 status=draft 且未发送）')
  console.error('[quote-regression]   2) 让脚本自建夹具再删除：数据写入，需用户批准后实现（decisions D28）')
  process.exit(1)
}

// A caller-supplied id is a claim; check it before the run spends a login on it.
if (arg('--quote')) {
  const resolved = psql(
    `select coalesce(status, '<null>') || '|' || case when deleted_at is null then 'live' else 'deleted' end from sales_quotes where id = '${quoteId}'`,
  )
  if (resolved.startsWith('__ERROR__') || resolved === '') {
    console.error(`[quote-regression] --quote ${quoteId} 不存在（或读取失败：${resolved}）`)
    process.exit(1)
  }
  const [status, lifecycle] = resolved.split('|')
  if (status !== 'draft' || lifecycle !== 'live') {
    console.error(`[quote-regression] --quote ${quoteId} 不能用作夹具：status=${status}、${lifecycle}`)
    console.error('[quote-regression] 回归要跑 convert/send，夹具必须是未删除的 status=draft 报价')
    process.exit(1)
  }
}

const cred = credentials().get('superadmin')
const cookie = await loginWithRetry(BASE, cred, { role: 'superadmin' })

const ordersBefore = Number(psql('select count(*) from sales_orders'))
const quoteBefore = psql(`select status || '|' || currency_code from sales_quotes where id = '${quoteId}'`)

const results = []

const wrongKey = await post(cookie, `/api/sales/quotes/convert`, { id: quoteId })
results.push({
  name: 'wrong payload key → 422 with field path',
  expected: '422 + details[].path contains quoteId',
  pass:
    wrongKey.status === 422 &&
    Array.isArray(wrongKey.json?.details) &&
    JSON.stringify(wrongKey.json.details).includes('quoteId'),
  detail: `${wrongKey.status} ${JSON.stringify(wrongKey.json).slice(0, 160)}`,
})

const draftConvert = await post(cookie, `/api/sales/quotes/convert`, { quoteId })
results.push({
  name: 'draft convert → 409 with reason',
  expected: '409 + Chinese reason mentioning 状态/draft',
  pass: draftConvert.status === 409 && /状态|draft/.test(draftConvert.text),
  detail: `${draftConvert.status} ${draftConvert.text.slice(0, 160)}`,
})

const ordersAfter = Number(psql('select count(*) from sales_orders'))
const quoteAfter = psql(`select status || '|' || currency_code from sales_quotes where id = '${quoteId}'`)
results.push({
  name: 'no side effects on the quote or orders',
  expected: `orders ${ordersBefore}→${ordersBefore}, quote unchanged`,
  pass: ordersAfter === ordersBefore && quoteAfter === quoteBefore,
  detail: `orders ${ordersBefore}→${ordersAfter}, quote ${quoteBefore} → ${quoteAfter}`,
})

const crCount = Number(
  psql("select count(*) from dictionary_entries where label like '%' || chr(13) || '%' or coalesce(value,'') like '%' || chr(13) || '%'"),
)
results.push({
  name: 'dictionary labels carry no carriage returns',
  expected: '0',
  pass: crCount === 0,
  detail: `entries with CR: ${crCount}`,
})

const dictNameCr = Number(psql("select count(*) from dictionaries where name like '%' || chr(13) || '%'"))
results.push({
  name: 'dictionary names: legacy CR (known, not counted)',
  expected: 'forward-only fix does not rewrite old rows; needs a data cleanup decision',
  pass: true,
  known: true,
  detail: `dictionary names with CR: ${dictNameCr}`,
})

const failing = results.filter((r) => !r.pass && !r.known)
const known = results.filter((r) => r.known)
fs.mkdirSync(OUT, { recursive: true })
const stamp = new Date().toISOString().slice(0, 10)
const file = path.join(OUT, `quote-${stamp}.md`)
const lines = [
  '# 报价/订单修复回归',
  '',
  `生成时间：${new Date().toISOString()} · 目标：${BASE} · 报价：\`${quoteId}\``,
  '',
  `用例 ${results.length} · 通过 ${results.length - failing.length - known.length} · 失败 ${failing.length} · 已知遗留 ${known.length}`,
  '',
  '| 用例 | 期望 | 结果 | 实测 |',
  '|---|---|---|---|',
  ...results.map((r) => `| ${r.name} | ${r.expected} | ${r.known ? '已知遗留' : r.pass ? '通过' : '**失败**'} | ${r.detail.replace(/\|/g, '/')} |`),
  '',
  failing.length === 0 ? '结论：既有报价/订单修复仍然有效。' : '结论：有回归，必须先修再继续。',
]
fs.writeFileSync(file, lines.join('\n') + '\n')

console.log(`[quote-regression] ${results.length - failing.length}/${results.length} passed`)
for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'} ${r.name} — ${r.detail}`)
console.log(`[quote-regression] wrote ${path.relative(process.cwd(), file)}`)
process.exit(failing.length === 0 ? 0 : 1)
