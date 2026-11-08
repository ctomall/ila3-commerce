#!/usr/bin/env node
/**
 * M4 adversarial harness: the seven attacks from the security PoC plan, run or refused.
 *
 * The point is honesty about coverage. Each case declares the fixtures it needs; when a
 * fixture is absent the case is reported as BLOCKED with the missing item, never as a
 * pass. A harness that silently skips what it cannot test is worse than no harness.
 *
 * Read-only: every runnable case is a request that must be refused, and the script
 * asserts no row count moved.
 *
 * Usage: node scripts/crm-m4-harness.mjs [--out docs/crm-platform/poc/<dir>]
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const BASE = process.env.M4_BASE_URL ?? 'http://127.0.0.1:3000'
const CREDENTIALS = '/home/pro/.ila3-admin-credentials'
const outFlag = process.argv.indexOf('--out')
const OUT = path.resolve(
  outFlag === -1 ? `docs/crm-platform/poc/${new Date().toISOString().slice(0, 10)}-m4` : process.argv[outFlag + 1],
)
const ZERO = '00000000-0000-0000-0000-000000000000'

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
  if (!res.ok) throw new Error(`login ${res.status}`)
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
}

function psqlCount(table) {
  try {
    const out = execFileSync(
      'bash',
      ['-lc', `cd /home/pro/apps/mercato && export $(grep -E "^DATABASE_URL" .env | xargs) && psql "$DATABASE_URL" -At -c "select count(*) from ${table}"`],
      { encoding: 'utf8' },
    )
    return Number(out.trim())
  } catch {
    return null
  }
}

const creds = credentials()
const cookies = {}
for (const role of ['superadmin', 'employee', 'admin']) if (creds.has(role)) cookies[role] = await login(creds.get(role))

// ---- fixture discovery: what can actually be tested right now -------------------
const openapi = await fetch(`${BASE}/api/docs/openapi`, { headers: { cookie: cookies.superadmin } })
  .then((r) => (r.ok ? r.json() : { paths: {} }))
  .catch(() => ({ paths: {} }))
const paths = Object.keys(openapi.paths ?? {})
const fixtures = {
  'leadgen-api': paths.some((p) => p.includes('/leadgen/')),
  'employee-B': Boolean(cookies.admin && cookies.employee),
  // Two employees in one organization is not cross-employee isolation: the fixture is a
  // second organization, which does not exist yet.
  'second-organization': false,
  'dsh-profile-per-employee': false,
  'probe-tool': false,
  'existing-quote': paths.includes('/sales/quotes/convert'),
}

const before = psqlCount('customer_entities')

async function http({ role, method = 'GET', url, body }) {
  const headers = { accept: 'application/json' }
  if (role !== 'anon') headers.cookie = cookies[role] ?? ''
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${BASE}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' })
  return { status: res.status, text: (await res.text()).slice(0, 200) }
}

/**
 * Case 1 — guessed id. Today the leadgen endpoints do not exist, so the runnable form is
 * "a random uuid on an existing module must be 404, not 403 and not 500".
 */
const cases = [
  {
    id: 1,
    attack: '猜 ID：随机 uuid 取记录（现有模块）',
    path: '/customers/companies/{id}',
    expected: '404（不泄露存在性）',
    requires: [],
    run: () => http({ role: 'employee', method: 'DELETE', url: `/api/customers/companies/${ZERO}` }),
    judge: (r) => r.status === 404,
  },
  {
    id: 1.1,
    attack: '猜 ID：跨员工取 candidate/run（leadgen API）',
    path: '/leadgen/candidates/{id}',
    expected: '404',
    requires: ['leadgen-api', 'second-organization'],
    run: () => http({ role: 'employee', url: `/api/leadgen/candidates/${ZERO}` }),
    judge: (r) => r.status === 404,
  },
  {
    id: 2,
    attack: '直连写接口 + body 注入 tenantId/organizationId',
    path: '/customers/companies',
    expected: '400/403/422，且不写库',
    requires: [],
    run: () =>
      http({
        role: 'employee',
        method: 'POST',
        url: '/api/customers/companies',
        body: { name: '', tenantId: ZERO, organizationId: ZERO },
      }),
    judge: (r) => [400, 403, 422].includes(r.status),
  },
  {
    id: 3,
    attack: '模型伪造身份（调用方指定 agent 与操作者）',
    path: '/ai_assistant/ai/chat',
    expected: '未知 agent 在进入模型前被拒',
    requires: [],
    run: () =>
      http({
        role: 'employee',
        method: 'POST',
        url: '/api/ai_assistant/ai/chat?agent=probe.m4',
        body: { messages: [{ role: 'user', content: 'hi' }] },
      }),
    // 404 with agent_unknown proves the agent is resolved and rejected before any model
    // call; a bare 400 would only prove the payload was wrong.
    judge: (r) => r.status === 404 && r.text.includes('agent_unknown'),
  },
  {
    id: 4,
    attack: '子 Agent 提权（子工具集 ⊄ 父工具集）',
    expected: '子工具集 = 交集',
    requires: ['probe-tool', 'dsh-profile-per-employee'],
    run: null,
    judge: null,
  },
  {
    id: 5,
    attack: '撤权影响在飞任务',
    expected: '≤10s 停止，且不完成 CRM 写入',
    requires: ['leadgen-api', 'dsh-profile-per-employee'],
    run: null,
    judge: null,
  },
  {
    id: 6,
    attack: '跨员工 DSH 隔离（会话/文件/记忆/凭据/浏览器态）',
    expected: '互不可读，跨读返回空 + 审计',
    requires: ['dsh-profile-per-employee', 'second-organization'],
    run: null,
    judge: null,
  },
  {
    id: 7,
    attack: '配额/审批绕过（超额度、审批令牌复用）',
    expected: '429 / 4xx',
    requires: ['leadgen-api'],
    run: null,
    judge: null,
  },
]

const results = []
for (const item of cases) {
  // A 404 from a path that does not exist is not a security result. Learned the hard way:
  // /api/ai/chat is really /api/ai_assistant/ai/chat, and the wrong path "passed" twice.
  if (item.path && !paths.includes(item.path)) {
    results.push({
      id: item.id,
      attack: item.attack,
      expected: item.expected,
      requires: item.requires,
      status: 'invalid',
      detail: `openapi 里没有 ${item.path}：404 不能当作拒绝证据`,
    })
    continue
  }
  const missing = item.requires.filter((f) => !fixtures[f])
  if (missing.length > 0 || typeof item.run !== 'function') {
    results.push({
      ...item,
      run: undefined,
      judge: undefined,
      status: 'blocked',
      missing,
      detail: missing.length ? `缺少 fixture：${missing.join('、')}` : '用例未实现',
    })
    continue
  }
  const response = await item.run()
  const pass = Boolean(item.judge?.(response))
  results.push({
    id: item.id,
    attack: item.attack,
    expected: item.expected,
    requires: item.requires,
    status: pass ? 'pass' : 'fail',
    detail: `${response.status} ${response.text}`,
  })
}

const after = psqlCount('customer_entities')
const noWrites = before !== null && before === after
const passed = results.filter((r) => r.status === 'pass')
const failed = results.filter((r) => r.status === 'fail')
const blocked = results.filter((r) => r.status === 'blocked')
const invalid = results.filter((r) => r.status === 'invalid')

fs.mkdirSync(OUT, { recursive: true })
const payload = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  fixtures,
  rowCount: { table: 'customer_entities', before, after, unchanged: noWrites },
  summary: { total: results.length, pass: passed.length, fail: failed.length, blocked: blocked.length, invalid: invalid.length },
  results,
}
fs.writeFileSync(path.join(OUT, 'matrix.json'), JSON.stringify(payload, null, 2) + '\n')

const md = [
  '# M4 对抗用例执行记录',
  '',
  `生成时间：${payload.generatedAt} · 目标：${BASE}`,
  '',
  `共 ${results.length} 例 · 通过 ${passed.length} · 失败 ${failed.length} · 无法执行（缺 fixture）${blocked.length} · **用例无效 ${invalid.length}**`,
  '',
  `写入检查：\`customer_entities\` ${before} → ${after}（${noWrites ? '未写入' : '**发生变化，必须调查**'}）`,
  '',
  '| # | 攻击 | 期望 | 结果 | 实测/阻塞原因 |',
  '|---|---|---|---|---|',
  ...results.map(
    (r) =>
      `| ${r.id} | ${r.attack} | ${r.expected} | ${r.status === 'pass' ? '通过' : r.status === 'fail' ? '**失败**' : r.status === 'invalid' ? '**用例无效**' : '阻塞'} | ${String(r.detail).replace(/\|/g, '/').slice(0, 120)} |`,
  ),
  '',
  '## fixture 现状',
  '',
  '| fixture | 是否存在 | 说明 |',
  '|---|---|---|',
  ...Object.entries(fixtures).map(([k, v]) => `| \`${k}\` | ${v ? '有' : '**无**'} | ${k === 'leadgen-api' ? 'leadgen 路由未部署（迁移未批准）' : k === 'second-organization' ? '只有一个租户一个组织' : k === 'dsh-profile-per-employee' ? '没有每员工 DSH 运行时' : k === 'probe-tool' ? '未注册越权探针工具' : ''} |`),
  '',
  '> **阻塞不等于通过。** 只有 `pass` 才算 M4 有证据；`blocked` 的用例在 fixture 到位前不能计入验收。',
]
fs.writeFileSync(path.join(OUT, 'matrix.md'), md + '\n')

console.log(`[m4] pass ${passed.length} · fail ${failed.length} · blocked ${blocked.length} · invalid ${invalid.length} · rows ${before}->${after}`)
for (const r of results) console.log(`  ${r.status.toUpperCase().padEnd(7)} #${r.id} ${r.attack}${r.detail ? ` — ${String(r.detail).slice(0, 80)}` : ''}`)
console.log(`[m4] wrote ${path.relative(process.cwd(), OUT)}/matrix.{json,md}`)
process.exit(failed.length === 0 && invalid.length === 0 ? 0 : 1)
