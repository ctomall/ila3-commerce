#!/usr/bin/env node
/**
 * Security probe for the CRM lead-generation platform (M4 input).
 *
 * Records what the running instance actually answers, per role, for the cases the
 * contract says must be refused. This is a BASELINE, not a fix: a case marked
 * "needs-review" is a finding to fix before M4 can pass.
 *
 * Rules:
 * - read-only by construction: no case may create, update or delete a record. The two
 *   POST probes send payloads that fail validation, and the script asserts the row
 *   count before and after is identical.
 * - no model calls: AI chat is probed with an unknown agent id only, which the router
 *   rejects before dispatch.
 * - credentials are read from ~/.ila3-admin-credentials (mode 600) and never printed.
 *
 * Usage: node scripts/crm-security-probe.mjs [--out docs/crm-platform/poc/<dir>]
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const BASE = process.env.PROBE_BASE_URL ?? 'http://127.0.0.1:3000'
const CREDENTIALS = '/home/pro/.ila3-admin-credentials'
const outFlag = process.argv.indexOf('--out')
const OUT = path.resolve(
  outFlag === -1 ? `docs/crm-platform/poc/${new Date().toISOString().slice(0, 10)}-probe` : process.argv[outFlag + 1],
)

const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

function credentials() {
  const map = new Map()
  for (const line of fs.readFileSync(CREDENTIALS, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    const [role, email, password] = line.trim().split(/\s+/)
    if (role && email && password) map.set(role, { email, password })
  }
  return map
}

async function login(cred) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(cred).toString(),
    redirect: 'manual',
  })
  if (!res.ok) throw new Error(`login failed: ${res.status}`)
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  if (!cookie) throw new Error('login returned no cookie')
  return cookie
}

function rowCount(table) {
  try {
    const url = execFileSync('bash', ['-lc', `cd /home/pro/apps/mercato && export $(grep -E "^DATABASE_URL" .env | xargs) && psql "$DATABASE_URL" -At -c "select count(*) from ${table}"`], {
      encoding: 'utf8',
    })
    return Number(url.trim())
  } catch {
    return null
  }
}

async function probe({ role, cookie, method, path: apiPath, body, expect, check }) {
  const headers = { accept: 'application/json' }
  if (cookie) headers.cookie = cookie
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${BASE}${apiPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  })
  const text = await res.text()
  const expected = new Set(Array.isArray(expect) ? expect : [expect])
  let semantics = null
  if (check) {
    try {
      semantics = check(JSON.parse(text), res.status)
    } catch {
      semantics = false
    }
  }
  const ok = expected.has(res.status) && (semantics === null || semantics === true)
  return {
    role,
    method,
    path: apiPath,
    expected: [...expected].join('|'),
    status: res.status,
    verdict: ok ? 'as-expected' : 'needs-review',
    ...(check ? { semanticCheck: semantics === true ? 'passed' : 'failed' } : {}),
    body: text.slice(0, 220),
  }
}

const creds = credentials()
const cookies = {}
for (const role of ['superadmin', 'admin', 'employee']) {
  if (creds.has(role)) cookies[role] = await login(creds.get(role))
}

const before = rowCount('customer_entities')

// Baseline the caller's own visible set: an injected scope must not widen it.
let baselineCompanyTotal = null
{
  const res = await fetch(`${BASE}/api/customers/companies`, { headers: { cookie: cookies.employee ?? '' } })
  if (res.ok) {
    const json = await res.json().catch(() => null)
    baselineCompanyTotal = typeof json?.total === 'number' ? json.total : null
  }
}

const cases = [
  // auth boundary
  { role: 'anon', cookie: null, method: 'GET', path: '/api/customers/companies', expect: 401 },
  { role: 'employee', method: 'GET', path: '/api/customers/companies', expect: 200 },
  { role: 'employee', method: 'GET', path: '/api/sales/quotes', expect: 200 },

  // feature boundary: employee holds audit_logs.view_self only
  // status alone proves nothing here: 200 with tenant-wide rows would be the bug.
  // The response must be self-scoped (canViewTenant false), even when asked otherwise.
  {
    role: 'employee',
    method: 'GET',
    path: '/api/audit_logs/audit-logs/actions?canViewTenant=true&scope=tenant',
    expect: 200,
    check: (json) => json.canViewTenant !== true && Array.isArray(json.items),
  },
  { role: 'admin', method: 'GET', path: '/api/audit_logs/audit-logs/actions', expect: [200, 403] },

  // scope injection: a value the caller must not be able to honour
  { role: 'employee', method: 'GET', path: `/api/customers/companies?tenantId=${ZERO_UUID}`, expect: [403, 200] },
  {
    role: 'employee',
    method: 'GET',
    path: `/api/customers/companies?organizationId=${ZERO_UUID}`,
    expect: [403, 200],
    // A 200 is only acceptable if it is the caller's own set, not a widened one.
    check: (json) => baselineCompanyTotal === null || json.total === baselineCompanyTotal,
  },

  // write attempts: any refusal is acceptable, a 2xx would not be (it would mean a write)
  // 400 = no organization context, 403 = tenant not targetable, 422 = validation. All fail closed.
  { role: 'employee', method: 'POST', path: '/api/customers/companies', body: {}, expect: [400, 403, 422] },
  {
    role: 'employee',
    method: 'POST',
    path: '/api/customers/companies',
    body: { name: '', tenantId: ZERO_UUID, organizationId: ZERO_UUID },
    expect: [400, 403, 422],
  },
  { role: 'employee', method: 'DELETE', path: `/api/customers/companies/${ZERO_UUID}`, expect: [403, 404] },

  // AI surface: unknown agent must be rejected before any model call
  {
    role: 'employee',
    method: 'POST',
    path: '/api/ai_assistant/ai/chat?agent=probe.does_not_exist',
    body: { messages: [{ role: 'user', content: 'hi' }] },
    expect: 404,
    check: (json) => json.code === 'agent_unknown',
  },
  { role: 'anon', cookie: null, method: 'POST', path: '/api/ai_assistant/ai/chat?agent=probe.does_not_exist', body: { messages: [] }, expect: 401 },

  // contract surface: anonymous 401; any signed-in employee may read it (recorded, by design)
  { role: 'anon', cookie: null, method: 'GET', path: '/api/docs/openapi', expect: 401 },
  { role: 'employee', method: 'GET', path: '/api/docs/openapi', expect: 200 },
]

const results = []
for (const item of cases) {
  const cookie = item.role === 'anon' ? null : cookies[item.role === 'admin' ? 'admin' : item.role === 'superadmin' ? 'superadmin' : 'employee']
  results.push(await probe({ ...item, cookie }))
}

const after = rowCount('customer_entities')
const noWrites = before !== null && before === after

const failing = results.filter((r) => r.verdict === 'needs-review')
fs.mkdirSync(OUT, { recursive: true })
const payload = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  rowCount: { before, after, unchanged: noWrites },
  baseline: { employeeVisibleCompanies: baselineCompanyTotal },
  summary: { cases: results.length, asExpected: results.length - failing.length, needsReview: failing.length },
  results,
}
fs.writeFileSync(path.join(OUT, 'matrix.json'), JSON.stringify(payload, null, 2) + '\n')

const md = [
  '# M4 安全探针 · 基线',
  '',
  `生成时间：${payload.generatedAt} · 目标：${BASE}`,
  '',
  `用例 ${results.length} · 符合预期 ${payload.summary.asExpected} · 需要复核 ${payload.summary.needsReview}`,
  '',
  `写入检查：\`customer_entities\` 前 ${before} / 后 ${after} → ${noWrites ? '**未写入**' : '**发生变化，必须调查**'}`,
  '',
  '| 角色 | 方法 | 路径 | 期望 | 实际 | 判定 |',
  '|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.role} | ${r.method} | \`${r.path}\` | ${r.expected} | ${r.status} | ${r.verdict === 'as-expected' ? '符合' : '**需复核**'} |`),
  '',
  '## 响应片段',
  '',
  ...results.map((r) => `- \`${r.method} ${r.path}\` (${r.role}) → ${r.status}\n  \`\`\`\n  ${r.body.replace(/\n/g, ' ').slice(0, 200)}\n  \`\`\``),
  '',
  '## 本探针未覆盖（原因）',
  '',
  '- **跨组织隔离**：当前只有一个租户一个组织（`tenants` 1 行、`organizations` 1 行），没有第二个组织可作对照。要么建测试组织，要么用第二租户——两者都属数据写入，需你确认。',
  '- **跨员工 DSH 隔离**（会话/文件/记忆/凭据/浏览器态）：需要每员工独立的 DSH 运行时；本仓库只有 CRM 侧，DSH 侧待定。',
  '- **AI 工具越权（G2）**：探针只测「未知 agent 被拒」；真实工具的越权路径需要在 PoC 环境里注册探针工具，属实现工作。',
  '',
  '结论：本文件是**基线**，不是通过证明。判定为「需复核」的用例，就是 M4 之前要修掉的清单。',
].join('\n')

fs.writeFileSync(path.join(OUT, 'matrix.md'), md + '\n')
console.log(`[probe] ${payload.summary.asExpected}/${results.length} as expected, ${payload.summary.needsReview} needs review`)
console.log(`[probe] rows ${before} -> ${after} (${noWrites ? 'unchanged' : 'CHANGED'})`)
for (const r of results.filter((x) => x.verdict !== 'as-expected')) {
  console.log(`  NEEDS REVIEW ${r.method} ${r.path} [${r.role}] expected ${r.expected} got ${r.status}`)
}
console.log(`[probe] wrote ${path.relative(process.cwd(), OUT)}/matrix.{json,md}`)
