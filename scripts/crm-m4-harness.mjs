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
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
import { credentials, loginWithRetry } from './lib/session.mjs'

const BASE = process.env.M4_BASE_URL ?? 'http://127.0.0.1:3000'
const outFlag = process.argv.indexOf('--out')
const OUT = path.resolve(
  outFlag === -1 ? `docs/crm-platform/poc/${new Date().toISOString().slice(0, 10)}-m4` : process.argv[outFlag + 1],
)
const ZERO = '00000000-0000-0000-0000-000000000000'

/** One scalar from the app database, using the same env resolution as psqlCount. */
function psqlValue(sql) {
  try {
    const out = execFileSync(
      'bash',
      ['-lc', `cd ${JSON.stringify(path.resolve(__dirname, '..'))} && export $(grep -E "^DATABASE_URL" .env | xargs) && psql "$DATABASE_URL" -At -c ${JSON.stringify(sql)}`],
      { encoding: 'utf8' },
    )
    return out.trim()
  } catch {
    return null
  }
}

/** Where per-employee DSH homes live: an explicit root, else the production layout. */
function resolveDshProfileRoot() {
  const configured = (process.env.DSH_PROFILE_ROOT ?? '').trim()
  if (configured) return fs.existsSync(configured) ? configured : null
  const production = '/srv/dsh/homes'
  return fs.existsSync(production) ? production : null
}
const dshProfileRoot = resolveDshProfileRoot()

function psqlCount(table) {
  try {
    const out = execFileSync(
      'bash',
      // `cd` to the repo this script lives in, not to a hardcoded path: the old literal made
      // every count null on any other checkout, and null used to read as "unchanged".
      ['-lc', `cd ${JSON.stringify(path.resolve(__dirname, '..'))} && export $(grep -E "^DATABASE_URL" .env | xargs) && psql "$DATABASE_URL" -At -c "select count(*) from ${table}"`],
      { encoding: 'utf8' },
    )
    return Number(out.trim())
  } catch {
    return null
  }
}

const creds = credentials()
const cookies = {}
for (const role of ['superadmin', 'employee', 'admin']) if (creds.has(role)) cookies[role] = await loginWithRetry(BASE, creds.get(role), { role })

// ---- fixture discovery: what can actually be tested right now -------------------
const openapi = await fetch(`${BASE}/api/docs/openapi`, { headers: { cookie: cookies.superadmin } })
  .then((r) => (r.ok ? r.json() : { paths: {} }))
  .catch(() => ({ paths: {} }))
const paths = Object.keys(openapi.paths ?? {})
// The tool registry is the only way to know which tools a session can actually call.
const toolNames = await fetch(`${BASE}/api/ai_assistant/tools`, { headers: { cookie: cookies.superadmin } })
  .then((r) => (r.ok ? r.json() : { tools: [] }))
  .then((d) => (Array.isArray(d.tools) ? d.tools.map((t) => t?.name).filter((n) => typeof n === 'string') : []))
  .catch(() => [])
const fixtures = {
  'leadgen-api': paths.some((p) => p.includes('/leadgen/')),
  'employee-B': Boolean(cookies.admin && cookies.employee),
  // Two employees in one organization is not cross-employee isolation: the fixture is a
  // second organization. Probed, not assumed (it was a literal `false`, so the matrix
  // read like a measurement while nothing measured it — QA finding B-P2-1).
  'second-organization': (psqlCount('organizations') ?? 0) > 1,
  // A per-employee DSH runtime exists when the app is configured with a profile root that
  // is actually on disk. Nothing else would make "runtime isolation" testable.
  // A per-employee runtime exists when the homes root is on disk and holds at least
  // one employee directory. DSH_PROFILE_ROOT overrides; the production layout is
  // /srv/dsh/homes (OS-isolated per-employee Unix users).
  'dsh-profile-per-employee': Boolean(dshProfileRoot) && fs.readdirSync(dshProfileRoot).length > 0,
  // A tool that reports the actor the runtime actually resolved. `context_whoami` exists
  // in the ai-assistant package, so this is discoverable rather than assumed.
  'probe-tool': toolNames.includes('context_whoami'),
  'tool-execute': paths.includes('/ai_assistant/tools/execute'),
  'existing-quote': paths.includes('/sales/quotes/convert'),
}

/** Fixtures whose value came from an actual check, not a constant. */
const PROBED = new Set(['leadgen-api', 'employee-B', 'probe-tool', 'tool-execute', 'existing-quote', 'second-organization', 'dsh-profile-per-employee'])

// The actor the runtime resolves for the same session the cases use.
const selfUserId = await whoamiUserId('employee')

const before = psqlCount('customer_entities')

async function http({ role, method = 'GET', url, body, limit = 200 }) {
  const headers = { accept: 'application/json' }
  if (role !== 'anon') headers.cookie = cookies[role] ?? ''
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${BASE}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' })
  // 200 characters is enough to show a refusal, not enough to parse a list. Judges that
  // must read JSON ask for more (case 1.4 used to judge a truncated body).
  return { status: res.status, text: (await res.text()).slice(0, limit) }
}

/** The actor the runtime actually resolves, so an ownership judge compares against a fact. */
async function whoamiUserId(role) {
  const response = await http({ role, method: 'POST', url: '/api/ai_assistant/tools/execute', body: { toolName: 'context_whoami', args: {} }, limit: 200000 })
  try {
    return JSON.parse(response.text)?.result?.userId ?? null
  } catch {
    return null
  }
}

/** Direct tool execution: deterministic, no model call. */
async function executeTool({ role, toolName, args }) {
  return http({ role, method: 'POST', url: '/api/ai_assistant/tools/execute', body: { toolName, args } })
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
    id: 1.2,
    attack: '猜 ID：AI 会话（他人/不存在）',
    description: '404 且带 conversation_not_found，而不是 403——403 会承认这个 id 存在。',
    expected: '404 conversation_not_found',
    path: '/ai_assistant/ai/conversations/{conversationId}',
    requires: [],
    run: () => http({ role: 'employee', url: `/api/ai_assistant/ai/conversations/${ZERO}` }),
    judge: (r) => r.status === 404 && r.text.includes('conversation_not_found'),
  },
  {
    id: 1.3,
    attack: '猜 ID：AI 会话参与者列表',
    expected: '404（不泄露会话是否存在）',
    path: '/ai_assistant/ai/conversations/{conversationId}/participants',
    requires: [],
    run: () => http({ role: 'employee', url: `/api/ai_assistant/ai/conversations/${ZERO}/participants` }),
    judge: (r) => r.status === 404,
  },
  {
    id: 1.4,
    attack: '会话列表越权（是否只回本人）',
    expected: '200 且 items 为空或全部属于本人',
    path: '/ai_assistant/ai/conversations',
    requires: [],
    weakReason:
      '列表为空时只算弱证据（空列表什么都没证明）；有会话后必须逐个核对 ownerUserId 等于本次调用的真实 actor',
    run: async () => {
      const response = await http({ role: 'employee', url: '/api/ai_assistant/ai/conversations', limit: 200000 })
      let items = null
      try {
        const json = JSON.parse(response.text)
        items = Array.isArray(json.items) ? json.items : Array.isArray(json) ? json : null
      } catch {
        items = null
      }
      return { ...response, items, selfUserId }
    },
    judge: (r) => {
      if (r.status !== 200 || r.items === null) return false
      // The old judge accepted any item whose ownerUserId was null/undefined and never
      // compared it against the caller: it passed on an empty list and would have failed a
      // conversation that legitimately belonged to the employee. Compare against the actor
      // context_whoami actually resolves (QA finding B-P2-3).
      if (r.items.length === 0) return true
      if (!r.selfUserId) return false
      return r.items.every((item) => item?.ownerUserId === r.selfUserId)
    },
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
    attack: '未知 agent 在进入模型前被拒（原误标为“伪造身份”）',
    path: '/ai_assistant/ai/chat',
    expected: '404 agent_unknown，且不进入模型',
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
    id: 3.1,
    attack: '模型伪造操作者（body/query 指定 actorUserId / onBehalfOfUserId）',
    expected: '运行时按真实会话解析 actor，注入值不生效',
    path: '/ai_assistant/tools/execute',
    // `context_whoami` reports the resolved context, which is what this case always
    // needed: an unknown-agent 404 never proved that a forged actor is ignored.
    requires: ['probe-tool', 'tool-execute'],
    run: async () => {
      const forged = {
        actorUserId: '00000000-0000-0000-0000-000000000001',
        userId: '00000000-0000-0000-0000-000000000002',
        onBehalfOfUserId: '00000000-0000-0000-0000-000000000003',
      }
      // `http()` truncates to 200 chars for the matrix, which makes a tool response
      // unparseable (the full context includes ~112 features). Pull the whole body here
      // and return only the resolved actor, so the matrix stays readable.
      const call = async (args) => {
        const res = await fetch(`${BASE}/api/ai_assistant/tools/execute`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: cookies.employee ?? '' },
          body: JSON.stringify({ toolName: 'context_whoami', args }),
        })
        const full = await res.text()
        let userId = null
        try {
          userId = JSON.parse(full)?.result?.userId ?? null
        } catch {
          userId = null
        }
        return { status: res.status, userId, bytes: full.length }
      }
      const baseline = await call({})
      const injected = await call(forged)
      return {
        status: injected.status,
        text: JSON.stringify({ resolvedUserId: injected.userId, baselineUserId: baseline.userId, responseBytes: injected.bytes }),
        baseline: { status: baseline.status, userId: baseline.userId },
        forgedValues: Object.values(forged),
      }
    },
    judge: (r) => {
      if (r.status !== 200 || r.baseline.status !== 200) return false
      let actual = null
      try {
        actual = JSON.parse(r.text)?.resolvedUserId ?? null
      } catch {
        actual = null
      }
      const baseline = r.baseline.userId
      // Same actor with and without the forged fields, and it is not one of the forgeries.
      return Boolean(actual) && actual === baseline && !r.forgedValues.includes(actual)
    },
    weakReason: '证明的是运行时忽略注入字段；审计行里记录的 actor 仍需在有 leadgen 写入路径后复核',
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
    // The attack is employee-level. Two employees in one organization are the right
    // subjects; a second organization would test tenant isolation, which is a
    // different boundary (recorded separately, still a fixture gap).
    requires: ['dsh-profile-per-employee'],
    run: async () => {
      const checks = []
      try {
        const root = dshProfileRoot
        // Two *active bindings whose home already exists* are the real subjects:
        // picking the employee/admin logins instead would depend on whether those
        // sessions had ever started a run (a home is created on first run).
        const rows = psqlValue(
          "select user_id, tenant_id, organization_id from dsh_assistant_bindings where status = 'active'",
        )
        const candidates = (rows ?? '')
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [userId, tenantId, organizationId] = line.split('|')
            const hash = createHash('sha256')
              .update([tenantId, organizationId, userId].join('\u0000'))
              .digest('hex')
              .slice(0, 32)
            return { userId, hash, home: path.join(root, hash) }
          })
          .filter((entry) => fs.existsSync(entry.home))
        const [a, b] = candidates
        checks.push({ name: 'two-employees-with-homes', ok: Boolean(a && b && a.userId !== b.userId) })
        if (a && b) {
          const statA = fs.statSync(a.home)
          const statB = fs.statSync(b.home)
          const userA = `dsh-${a.hash.slice(0, 16)}`
          const userB = `dsh-${b.hash.slice(0, 16)}`
          const owner = (target) => spawnSync('stat', ['-c', '%U', target], { encoding: 'utf8' }).stdout?.trim()
          checks.push({ name: 'homes-0700', ok: (statA.mode & 0o777) === 0o700 && (statB.mode & 0o777) === 0o700 })
          checks.push({
            name: 'distinct-unix-owners',
            ok: owner(a.home) === userA && owner(b.home) === userB && userA !== userB,
          })
          const canRead = (who, target) => spawnSync('sudo', ['-n', '-u', who, 'test', '-r', target], { encoding: 'utf8' }).status === 0
          checks.push({
            name: 'cross-employee-read-denied',
            ok: !canRead(userA, b.home) && !canRead(userB, a.home),
          })
          checks.push({
            name: 'app-user-read-denied',
            ok: spawnSync('test', ['-r', a.home], { encoding: 'utf8' }).status !== 0,
          })
          checks.push({
            name: 'credentials-denied-to-employee',
            ok: !canRead(userA, '/home/pro/.ila3-admin-credentials'),
          })
          const workspacesRoot = path.join(path.dirname(root), 'workspaces')
          checks.push({
            name: 'distinct-workspace-roots',
            ok:
              !fs.existsSync(workspacesRoot) ||
              path.join(workspacesRoot, a.hash) !== path.join(workspacesRoot, b.hash),
          })
          checks.push({
            name: 'distinct-bindings',
            ok:
              psqlValue(
                `select count(distinct id) from dsh_assistant_bindings where user_id in ('${a.userId}','${b.userId}')`,
              ) === '2',
          })
        }
      } catch (error) {
        checks.push({ name: 'probe-error', ok: false, detail: String(error?.message ?? error).slice(0, 160) })
      }
      const ok = checks.length > 0 && checks.every((check) => check.ok)
      return { status: ok ? 200 : 403, text: JSON.stringify(checks) }
    },
    judge: (r) => {
      try {
        const checks = JSON.parse(r.text)
        return Array.isArray(checks) && checks.length > 0 && checks.every((check) => check.ok)
      } catch {
        return false
      }
    },
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
    status: pass ? (item.weakReason ? 'pass-weak' : 'pass') : 'fail',
    weakReason: item.weakReason,
    detail: `${response.status} ${response.text}`,
  })
}

const after = psqlCount('customer_entities')
const noWrites = before !== null && before === after
// The docstring said "asserts no row count moved" while the result only reached the matrix,
// so a missing psql (both counts null) exited 0 and the gate stayed green. A run that cannot
// measure its own footprint proves nothing and must not pass (audit finding B-P1-2).
const writeProblems = []
if (before === null || after === null) writeProblems.push(`无法读取 customer_entities 行数（${before}->${after}），零写入结论不成立`)
else if (before !== after) writeProblems.push(`customer_entities 行数从 ${before} 变为 ${after}，存在写入`)
const passed = results.filter((r) => r.status === 'pass')
const passedWeak = results.filter((r) => r.status === 'pass-weak')
const failed = results.filter((r) => r.status === 'fail')
const blocked = results.filter((r) => r.status === 'blocked')
const invalid = results.filter((r) => r.status === 'invalid')

fs.mkdirSync(OUT, { recursive: true })
const payload = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  fixtures,
  rowCount: { table: 'customer_entities', before, after, unchanged: noWrites },
  summary: { total: results.length, pass: passed.length, passWeak: passedWeak.length, fail: failed.length, blocked: blocked.length, invalid: invalid.length },
  results,
}
fs.writeFileSync(path.join(OUT, 'matrix.json'), JSON.stringify(payload, null, 2) + '\n')

const md = [
  '# M4 对抗用例执行记录',
  '',
  `生成时间：${payload.generatedAt} · 目标：${BASE}`,
  '',
  `共 ${results.length} 例 · 通过 ${passed.length} · 弱通过 ${passedWeak.length} · 失败 ${failed.length} · 无法执行（缺 fixture）${blocked.length} · **用例无效 ${invalid.length}**`,
  '',
  `写入检查：\`customer_entities\` ${before} → ${after}（${noWrites ? '未写入' : '**发生变化，必须调查**'}）`,
  '',
  '| # | 攻击 | 期望 | 结果 | 实测/阻塞原因 |',
  '|---|---|---|---|---|',
  ...results.map(
    (r) =>
      `| ${r.id} | ${r.attack} | ${r.expected} | ${r.status === 'pass' ? '通过' : r.status === 'pass-weak' ? '弱通过' : r.status === 'fail' ? '**失败**' : r.status === 'invalid' ? '**用例无效**' : '阻塞'} | ${String(r.detail).replace(/\|/g, '/').slice(0, 120)} |`,
  ),
  '',
  '## fixture 现状',
  '',
  '| fixture | 是否存在 | 说明 |',
  '|---|---|---|',
  // Two of these are literals, not probes. Printing them as "无" made the matrix look like a
  // measurement, so a reviewer could believe the fixture appears as soon as a route ships.
  // Label the ones nobody measured (audit finding B-P2).
  ...Object.entries(fixtures).map(([k, v]) =>
    `| \`${k}\` | ${PROBED.has(k) ? (v ? '有' : '**无**') : '**未探测（写死 false）**'} | ${
      k === 'leadgen-api'
        ? 'leadgen 路由未部署（迁移未批准）'
        : k === 'second-organization'
          ? 'probed：organizations 表只有 1 行，所有用户也在同一组织'
          : k === 'dsh-profile-per-employee'
            ? 'probed：没有配置 DSH_PROFILE_ROOT 且目录不存在——派生层已由 dsh-profile 门证明，运行时仍缺'
            : k === 'probe-tool'
              ? 'context_whoami 是否在运行时工具表里'
              : k === 'tool-execute'
                ? '/ai_assistant/tools/execute 是否在 openapi 里'
                : ''
    } |`,
  ),
  '',
  '> **阻塞不等于通过。** 只有 `pass` 才算 M4 有证据；`blocked` 的用例在 fixture 到位前不能计入验收。',
]
fs.writeFileSync(path.join(OUT, 'matrix.md'), md.join('\n') + '\n')

console.log(`[m4] pass ${passed.length} · pass-weak ${passedWeak.length} · fail ${failed.length} · blocked ${blocked.length} · invalid ${invalid.length} · rows ${before}->${after}`)
for (const r of results) console.log(`  ${r.status.toUpperCase().padEnd(7)} #${r.id} ${r.attack}${r.detail ? ` — ${String(r.detail).slice(0, 80)}` : ''}`)
console.log(`[m4] wrote ${path.relative(process.cwd(), OUT)}/matrix.{json,md}`)
// Blocked and invalid cases are coverage gaps, not product failures: they are recorded in
// the matrix and reported loudly, but they must not turn the run red. Only a real `fail`
// (a request that was NOT refused) exits non-zero.
if (invalid.length > 0) console.error(`[m4] WARNING: ${invalid.length} case(s) are invalid — their evidence does not count`)
for (const problem of writeProblems) console.error(`[m4] FAIL ${problem}`)
console.log(writeProblems.length === 0 ? '[m4] zero-write: confirmed' : '[m4] zero-write: NOT established')
process.exit(failed.length === 0 && writeProblems.length === 0 ? 0 : 1)
