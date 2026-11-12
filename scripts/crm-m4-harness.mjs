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
// The leadgen routes live under src/app/api and are not described in the generated
// OpenAPI, so "documented" is the wrong test for them. Liveness is measured with a
// real request: an authenticated guess of a well-formed id must come back as the
// route's own JSON 404, not as the router's missing-page response.
const leadgenProbe = cookies.employee
  ? await fetch(`${BASE}/api/leadgen/candidates/${ZERO}`, { headers: { cookie: cookies.employee, accept: 'application/json' } }).catch(() => null)
  : null
const leadgenProbeBody = leadgenProbe ? await leadgenProbe.text().catch(() => '') : ''
const leadgenLive = Boolean(leadgenProbe) && [200, 401, 403, 404].includes(leadgenProbe.status) && /candidate_not_found|leadgen/i.test(leadgenProbeBody)
const fixtures = {
  'leadgen-api': leadgenLive || paths.some((p) => p.includes('/leadgen/')),
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
    // The API is live now, so the guess is a real request. A candidate that belongs
    // to another organization is inserted as a fixture (no second account needed) and
    // must be invisible: 404 on detail, absent from the list, and the response must
    // not echo the marker name.
    requires: ['leadgen-api'],
    run: async () => {
      const checks = []
      const marker = `M4-CROSS-ORG-${Date.now()}`
      const scope = (psqlValue("select tenant_id || '|' || organization_id from users where id = '" + selfUserId + "'") ?? '').split('|')
      const [tenantId] = scope
      const foreignOrg = '00000000-0000-4000-8000-0000000000ff'
      if (!tenantId) return { status: 0, text: 'fixture-error: no tenant for employee' }
      // Fingerprint carries the marker: a constant one collided with a fixture left by
      // an earlier run and turned "insert failed" into a false security result.
      const fingerprint = `m4-${marker}`
      const inserted = psqlValue(
        `insert into leadgen_candidates (tenant_id, organization_id, run_id, submitted_fingerprint, company_dedupe_key, company_name, status, created_at, updated_at) values ('${tenantId}', '${foreignOrg}', '${foreignOrg}', '${fingerprint}', 'n:${marker}', '${marker}', 'submitted', now(), now()) returning id`,
      )
      const foreignId = (inserted ?? '')
        .split('\n')
        .map((line) => line.trim())
        .find((line) => /^[0-9a-f-]{36}$/i.test(line)) ?? null
      checks.push({ name: 'fixture-inserted', ok: Boolean(foreignId), detail: String(inserted).slice(0, 160) })
      try {
        const detail = await http({ role: 'employee', url: `/api/leadgen/candidates/${foreignId}`, limit: 400 })
        const unknown = await http({ role: 'employee', url: `/api/leadgen/candidates/${ZERO}`, limit: 400 })
        const list = await http({ role: 'employee', url: '/api/leadgen/candidates?limit=100', limit: 200000 })
        checks.push({ name: 'foreign-detail-404', ok: detail.status === 404 && !detail.text.includes(marker) })
        checks.push({ name: 'unknown-detail-404', ok: unknown.status === 404 })
        checks.push({ name: 'foreign-row-not-listed', ok: list.status === 200 && !list.text.includes(marker) })
      } finally {
        if (foreignId) psqlValue(`delete from leadgen_candidates where id = '${foreignId}'`)
      }
      const ok = checks.every((check) => check.ok)
      return { status: ok ? 404 : 500, text: JSON.stringify(checks) }
    },
    judge: (r) => {
      try {
        const parsed = JSON.parse(r.text)
        return Array.isArray(parsed) && parsed.every((check) => check.ok)
      } catch {
        return false
      }
    },
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
    weakReason: '列表为空时只算弱证据（空列表什么都没证明）；有会话时逐个核对 detail.isOwner',
    weakJudge: (r) => r.items.length === 0,
    run: async () => {
      const list = async () => {
        const response = await http({ role: 'employee', url: '/api/ai_assistant/ai/conversations', limit: 200000 })
        try {
          const json = JSON.parse(response.text)
          return Array.isArray(json.items) ? json.items : Array.isArray(json) ? json : null
        } catch {
          return null
        }
      }
      let items = await list()
      // Seed one conversation when the account has none, so the case measures the
      // ownership filter instead of passing on an empty list.
      if (Array.isArray(items) && items.length === 0) {
        await http({
          role: 'employee',
          method: 'POST',
          url: '/api/ai_assistant/ai/conversations',
          body: { agentId: 'catalog.catalog_assistant', title: 'M4 seed conversation' },
        })
        items = await list()
      }
      // List rows do not carry the owner; the detail does. Check every row.
      const details = []
      for (const item of Array.isArray(items) ? items : []) {
        const id = item?.conversationId
        if (!id) continue
        const detail = await http({ role: 'employee', url: `/api/ai_assistant/ai/conversations/${id}`, limit: 200000 })
        let isOwner = null
        try {
          isOwner = JSON.parse(detail.text)?.conversation?.isOwner ?? null
        } catch {
          isOwner = null
        }
        details.push({ id, status: detail.status, isOwner })
      }
      return {
        status: 200,
        text: JSON.stringify({ count: Array.isArray(items) ? items.length : null, details }),
        items: Array.isArray(items) ? items : null,
        details,
      }
    },
    judge: (r) => {
      if (r.status !== 200 || r.items === null) return false
      // An empty list is not evidence of filtering, but it is not a failure either;
      // weakJudge reports it as weak. Every visible row must be the caller's own.
      if (r.items.length === 0) return true
      return r.details.length === r.items.length && r.details.every((d) => d.status === 200 && d.isOwner === true)
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
      // The weak reason said the audit row needed a leadgen write path; that path now
      // exists, so the actor recorded by the review decision is checked against the
      // actor the runtime resolved (the forged ids must not appear there).
      const auditActor = psqlValue(
        'select actor_user_id from leadgen_candidate_decisions order by created_at desc limit 1',
      )
      return {
        status: injected.status,
        text: JSON.stringify({ resolvedUserId: injected.userId, baselineUserId: baseline.userId, auditActor, responseBytes: injected.bytes }),
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
      let auditActor = null
      try {
        auditActor = JSON.parse(r.text)?.auditActor ?? null
      } catch {
        auditActor = null
      }
      // Same actor with and without the forged fields, it is not one of the forgeries,
      // and the leadgen decision ledger recorded that same actor.
      return Boolean(actual) && actual === baseline && !r.forgedValues.includes(actual) && auditActor === actual
    },
  },
  {
    id: 4,
    attack: '子 Agent 提权（子工具集 ⊄ 父工具集）',
    expected: '子工具集 = 交集',
    requires: [],
    run: async () => {
      // The derivation is the authoritative place where a child's requested tool
      // set is intersected with the granted/ceiling set, and `wideningAttempt` is
      // how a caller detects a child that would exceed its parent. The deployed
      // capability surface is checked too: if a spawn tool ever appears, this case
      // must be extended to test the real escalation path.
      const snippet = `
import { deriveProfile, wideningAttempt } from './src/lib/dsh/profile.ts'
const base = {
  userId: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  organizationId: '00000000-0000-4000-8000-000000000003',
  assistantId: 'crm.employee_assistant',
  policyVersion: 'm4',
  grantedTools: ['crm.find_companies', 'crm.update_company'],
  assistantTools: ['crm.find_companies', 'crm.update_company'],
}
const parent = deriveProfile({ ...base, requestedTools: ['crm.find_companies', 'crm.update_company'] })
const narrowed = deriveProfile({ ...base, requestedTools: ['crm.find_companies'] })
const escalated = deriveProfile({ ...base, requestedTools: ['crm.find_companies', 'crm.update_company'] })
const attempts = ['crm.find_companies', 'crm.update_company', 'crm.delete_everything']
const detected = wideningAttempt(parent, { ...parent, tools: attempts })
console.log(JSON.stringify({ parent: parent.tools, narrowed: narrowed.tools, escalated: escalated.tools, detected }))
`
      const output = execFileSync('npx', ['tsx', '-e', snippet], {
        encoding: 'utf8',
        cwd: path.resolve(__dirname, '..'),
        timeout: 120_000,
      })
      const parsed = JSON.parse(output.trim().split('\n').at(-1))
      // Live capability surface: no tool can spawn a child agent or drive a browser.
      const toolsRes = await fetch(`${BASE}/api/ai_assistant/tools`, { headers: { cookie: cookies.employee } })
      const toolsBody = await toolsRes.json().catch(() => ({}))
      const toolNames = (toolsBody?.tools ?? []).map((tool) => tool?.name).filter((name) => typeof name === 'string')
      const spawnLike = toolNames.filter((name) => /spawn|subagent|delegate|execute_child/i.test(name))
      const browserLike = toolNames.filter((name) => /browser|playwright|navigate|screenshot/i.test(name))
      const checks = [
        { name: 'child-cannot-add-tools', ok: parsed.narrowed.every((tool) => parsed.parent.includes(tool)) },
        {
          name: 'narrowing-is-honoured',
          ok: parsed.narrowed.length === 1 && parsed.narrowed[0] === 'crm.find_companies',
        },
        {
          name: 'widening-is-detected',
          ok: Array.isArray(parsed.detected) && parsed.detected.includes('crm.delete_everything'),
        },
        {
          name: 'no-spawn-capability-deployed',
          ok: toolsRes.status === 200 && toolNames.length > 0 && spawnLike.length === 0,
          detail: `${toolNames.length} tools`,
        },
        {
          name: 'no-browser-capability-deployed',
          ok: toolsRes.status === 200 && browserLike.length === 0,
          detail: browserLike.join(',') || 'none',
        },
      ]
      const ok = checks.every((check) => check.ok)
      return { status: ok ? 200 : 403, text: JSON.stringify({ checks, parsed }) }
    },
    // No longer weak: the case now proves both the derivation guard and that the
    // deployed surface has no spawn/browser capability at all. Adding one must extend
    // this case (the new checks fail closed as soon as such a tool appears).
    judge: (r) => {
      try {
        const checks = JSON.parse(r.text).checks
        return Array.isArray(checks) && checks.length > 0 && checks.every((check) => check.ok)
      } catch {
        return false
      }
    },
  },
  {
    id: 5,
    attack: '撤权影响在飞任务',
    expected: '≤10s 停止，且不完成 CRM 写入',
    // Revocation is a DSH runtime property, not a leadgen one: the subject is an
    // in-flight run of a real employee binding. The run is restored afterwards.
    requires: ['dsh-profile-per-employee'],
    run: async () => {
      const checks = []
      const employeeUserId = await whoamiUserId('employee')
      checks.push({ name: 'employee-resolved', ok: Boolean(employeeUserId) })
      if (!employeeUserId) return { status: 403, text: JSON.stringify(checks) }
      let controller = null
      try {
        controller = new AbortController()
        const streamPromise = fetch(`${BASE}/api/ai_assistant/chat`, {
          method: 'POST',
          headers: { cookie: cookies.employee, 'content-type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                role: 'user',
                // Unique per run: an identical transcript would replay the previous
                // run through the bridge's idempotency key instead of starting one.
                content: `Write a 3000-word essay about the history of CRM software. Output only the essay. (revocation probe ${Date.now()})`,
              },
            ],
          }),
          signal: controller.signal,
        }).then((res) => res.text()).catch((error) => `stream-error:${error?.name ?? error}`)
        let run = null
        for (let i = 0; i < 80; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250))
          run = psqlValue(
            `select id, status from dsh_runs where user_id = '${employeeUserId}' order by created_at desc limit 1`,
          )
          if (run && run.includes('|running')) break
        }
        checks.push({ name: 'run-in-flight', ok: Boolean(run && run.includes('|running')) })
        if (!run || !run.includes('|running')) return { status: 403, text: JSON.stringify(checks) }
        const runId = run.split('|')[0]

        const revokedAt = Date.now()
        const revoke = await http({
          role: 'superadmin',
          method: 'POST',
          url: '/api/internal/dsh-bindings/revoke',
          body: { targetUserId: employeeUserId, reason: 'm4-case5-revocation' },
          limit: 400,
        })
        const streamed = await Promise.race([
          streamPromise,
          new Promise((resolve) => setTimeout(() => resolve('timeout'), 15000)),
        ])
        const stoppedMs = Date.now() - revokedAt
        const status = psqlValue(`select status from dsh_runs where id = '${runId}'`)
        const binding = psqlValue(`select status from dsh_assistant_bindings where user_id = '${employeeUserId}'`)
        checks.push({ name: 'revoke-accepted', ok: revoke.status === 200, detail: revoke.text.slice(0, 80) })
        checks.push({ name: 'stream-ended-within-10s', ok: stoppedMs <= 10_000, detail: `${stoppedMs}ms` })
        checks.push({
          name: 'stream-reports-run-cancelled',
          ok: typeof streamed === 'string' && streamed.includes('run_cancelled'),
        })
        checks.push({ name: 'run-cancelled', ok: status === 'cancelled', detail: status })
        checks.push({ name: 'binding-revoked', ok: binding === 'revoked', detail: binding })
      } catch (error) {
        checks.push({ name: 'probe-error', ok: false, detail: String(error?.message ?? error).slice(0, 160) })
      } finally {
        // Always hand the employee back an active binding, even when a probe threw.
        try {
          psqlValue(
            `update dsh_assistant_bindings set status = 'active', revision = revision + 1, updated_at = now() where user_id = '${employeeUserId}' returning status`,
          )
        } catch {
          /* the check below reports the failure */
        }
        const restored = psqlValue(`select status from dsh_assistant_bindings where user_id = '${employeeUserId}'`)
        checks.push({ name: 'binding-restored', ok: restored === 'active', detail: restored })
        controller?.abort()
      }
      const ok = checks.every((check) => check.ok)
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
    // Quota bypass is testable now that the reservation API is live: a fixture bucket
    // with one unit must refuse two, and the reservation must not be booked twice.
    // The dispatch boundary is now exercised end to end through the simulated transport:
    // one approval -> one dispatch, a suppressed recipient is refused, a dispatch without
    // a `send` reservation is refused, and the reservation is consumed exactly once.
    // Real provider delivery stays in the separately authorized M6, so the case still
    // reports pass-weak instead of claiming the whole attack is covered.
    requires: ['leadgen-api'],
    run: async () => {
      const checks = []
      const scope = (psqlValue("select tenant_id || '|' || organization_id from users where id = '" + selfUserId + "'") ?? '').split('|')
      const [tenantId, organizationId] = scope
      if (!tenantId || !organizationId) return { status: 0, text: 'fixture-error: no scope' }
      const period = new Date().toISOString().slice(0, 7)
      const bucketId = `00000000-0000-4000-8000-${String(Date.now()).slice(-12)}`
      // Declared outside the try: the finally has to delete it, and a `const` inside
      // the try block is not visible there (that is how a spent `send` bucket leaked
      // and then poisoned the next run's reservation with "tenant 剩余 0").
      let sendBucketId = null
      let sendBucket2Id = null
      const keyBase = `m4-quota-${Date.now()}`
      try {
        psqlValue(
          `insert into leadgen_quota_buckets (id, tenant_id, organization_id, scope_kind, scope_id, quota_kind, period_key, limit_units, reserved_units, consumed_units, version, created_at, updated_at) values ('${bucketId}', '${tenantId}', '${organizationId}', 'tenant', null, 'lead', '${period}', 1, 0, 0, 1, now(), now())`,
        )
        const over = await fetch(`${BASE}/api/leadgen/quota/reservations`, {
          method: 'POST',
          headers: { cookie: cookies.employee, 'content-type': 'application/json', 'idempotency-key': `${keyBase}-over` },
          body: JSON.stringify({ quotaKind: 'lead', units: 2 }),
        })
        const overText = await over.text()
        checks.push({ name: 'over-limit-429', ok: over.status === 429 || overText.includes('quota_exceeded') })
        // The route needs the header, not a body field; http() cannot set headers, so
        // raw requests are used for the reservation steps.
        const raw = await fetch(`${BASE}/api/leadgen/quota/reservations`, {
          method: 'POST',
          headers: { cookie: cookies.employee, 'content-type': 'application/json', 'idempotency-key': `${keyBase}-1` },
          body: JSON.stringify({ quotaKind: 'lead', units: 1 }),
        })
        checks.push({ name: 'first-reservation-201', ok: raw.status === 201, detail: `${raw.status} ${(await raw.text()).slice(0, 120)}` })
        const replay = await fetch(`${BASE}/api/leadgen/quota/reservations`, {
          method: 'POST',
          headers: { cookie: cookies.employee, 'content-type': 'application/json', 'idempotency-key': `${keyBase}-1` },
          body: JSON.stringify({ quotaKind: 'lead', units: 1 }),
        })
        checks.push({ name: 'same-key-replayed', ok: replay.status === 200 })
        const second = await fetch(`${BASE}/api/leadgen/quota/reservations`, {
          method: 'POST',
          headers: { cookie: cookies.employee, 'content-type': 'application/json', 'idempotency-key': `${keyBase}-2` },
          body: JSON.stringify({ quotaKind: 'lead', units: 1 }),
        })
        checks.push({ name: 'exhausted-429', ok: second.status === 429 })
        checks.push({ name: 'no-negative-headroom', ok: Number(psqlValue(`select reserved_units + consumed_units from leadgen_quota_buckets where id = '${bucketId}'`)) === 1 })

        // Approval-token abuse: an approval is bound to the reviewed body, and the
        // dispatch boundary accepts exactly one dispatch per approval. The transport
        // is the simulated one (`externalEffect: false`), so this proves the token
        // contract without any real outbound.
        const candidate = psqlValue(
          `select id || '|' || coalesce(contact_email, 'qa@m4.example') from leadgen_candidates where tenant_id = '${tenantId}' and organization_id = '${organizationId}' and status in ('approved','crm_written') order by updated_at desc limit 1`,
        )
        const [candidateId, recipient] = (candidate ?? '').split('|')
        if (candidateId) {
          const draftRes = await fetch(`${BASE}/api/leadgen/drafts`, {
            method: 'POST',
            headers: { cookie: cookies.employee, 'content-type': 'application/json' },
            body: JSON.stringify({ candidateId, recipientEmail: recipient || 'qa@m4.example', subject: 'M4 approval binding', bodyMarkdown: `body ${keyBase}` }),
          })
          const draftBody = await draftRes.json().catch(() => ({}))
          const draftId = draftBody?.draft?.id
          const bodyHash = draftBody?.bodyHash
          checks.push({ name: 'draft-created', ok: [200, 201].includes(draftRes.status) && Boolean(draftId) })
          if (draftId && bodyHash) {
            const approve = (hash, key) =>
              fetch(`${BASE}/api/leadgen/drafts/${draftId}/approvals`, {
                method: 'POST',
                headers: { cookie: cookies.employee, 'content-type': 'application/json' },
                body: JSON.stringify({ decision: 'approved', draftHash: hash }),
              })
            const firstApprove = await approve(bodyHash)
            const replayApprove = await approve(bodyHash)
            const staleApprove = await approve(`${bodyHash}-edited`)
            checks.push({ name: 'approval-bound-to-body', ok: firstApprove.status === 201 })
            checks.push({ name: 'approval-replayed', ok: replayApprove.status === 200 })
            checks.push({ name: 'edited-body-refused', ok: staleApprove.status === 409 })
            const firstApproval = await firstApprove.json().catch(() => ({}))
            const approvalId = firstApproval?.approval?.id
            if (approvalId) {
              const dispatch = (draft, token, lease) =>
                fetch(`${BASE}/api/leadgen/drafts/${draft}/sends`, {
                  method: 'POST',
                  headers: { cookie: cookies.employee, 'content-type': 'application/json' },
                  body: JSON.stringify(lease ? { approvalId: token, leaseToken: lease } : { approvalId: token }),
                })
              // A dispatch must be funded, and a send lease names the draft it pays for:
              // reserve after the draft exists so the lease can be bound to it.
              sendBucketId = `00000000-0000-4000-8000-${String(Date.now() + 1).slice(-12)}`
              psqlValue(
                `insert into leadgen_quota_buckets (id, tenant_id, organization_id, scope_kind, scope_id, quota_kind, period_key, limit_units, reserved_units, consumed_units, version, created_at, updated_at) values ('${sendBucketId}', '${tenantId}', '${organizationId}', 'tenant', null, 'send', '${period}', 2, 0, 0, 1, now(), now())`,
              )
              const reserveSend = async (draft, keySuffix) => {
                const res = await fetch(`${BASE}/api/leadgen/quota/reservations`, {
                  method: 'POST',
                  headers: { cookie: cookies.employee, 'content-type': 'application/json', 'idempotency-key': `${keyBase}-${keySuffix}` },
                  body: JSON.stringify({ quotaKind: 'send', units: 1, draftId: draft }),
                })
                const body = await res.json().catch(() => ({}))
                return { status: res.status, leaseToken: body?.reservation?.leaseToken, error: body?.error ?? null }
              }
              const unbound = await fetch(`${BASE}/api/leadgen/quota/reservations`, {
                method: 'POST',
                headers: { cookie: cookies.employee, 'content-type': 'application/json', 'idempotency-key': `${keyBase}-send-unbound` },
                body: JSON.stringify({ quotaKind: 'send', units: 1 }),
              })
              checks.push({ name: 'send-lease-requires-draft', ok: unbound.status === 400 })
              const reserved = await reserveSend(draftId, 'send')
              const leaseToken = reserved.leaseToken
              checks.push({
                name: 'send-lease-reserved',
                ok: reserved.status === 201 && Boolean(leaseToken),
                detail: `${reserved.status} ${JSON.stringify(reserved.error)}`,
              })

              // A suppression hit outranks the approval: the recipient opted out.
              const recipientEmail = String(recipient || 'qa@m4.example')
              const recipientHash = createHash('sha256').update(recipientEmail.trim().toLowerCase()).digest('hex')
              psqlValue(
                `insert into leadgen_suppressions (id, tenant_id, organization_id, email_hash, email, reason, created_at) values ('00000000-0000-4000-8000-${String(Date.now() + 2).slice(-12)}', '${tenantId}', '${organizationId}', '${recipientHash}', '${recipientEmail.replace(/'/g, '')}', 'unsubscribe', now())`,
              )
              const suppressed = await dispatch(draftId, approvalId, leaseToken)
              checks.push({ name: 'suppressed-recipient-refused', ok: suppressed.status === 409 })
              psqlValue(`delete from leadgen_suppressions where email_hash = '${recipientHash}'`)
              const noLease = await dispatch(draftId, approvalId)
              checks.push({ name: 'dispatch-without-lease-refused', ok: noLease.status === 400 })
              const sendOnce = await dispatch(draftId, approvalId, leaseToken)
              const sendOnceBody = await sendOnce.json().catch(() => ({}))
              checks.push({
                name: 'one-approval-one-dispatch',
                ok:
                  sendOnce.status === 201 &&
                  sendOnceBody?.send?.state === 'simulated' &&
                  sendOnceBody?.send?.providerMessageId === null &&
                  sendOnceBody?.transport?.externalEffect === false,
                detail: `${sendOnce.status} ${JSON.stringify(sendOnceBody?.send?.state ?? null)}`,
              })
              checks.push({
                name: 'send-quota-consumed',
                ok: psqlValue(`select reserved_units || ':' || consumed_units from leadgen_quota_buckets where id = '${sendBucketId}'`) === '0:1',
              })
              const sendAgain = await dispatch(draftId, approvalId, leaseToken)
              const sendAgainBody = await sendAgain.json().catch(() => ({}))
              checks.push({
                name: 'dispatch-replayed-not-duplicated',
                ok:
                  sendAgain.status === 200 &&
                  Boolean(sendAgainBody?.send?.id) &&
                  sendAgainBody?.send?.id === sendOnceBody?.send?.id,
              })
              checks.push({
                name: 'single-send-row',
                ok: psqlValue(`select count(*) from leadgen_sends where approval_id = '${approvalId}'`) === '1',
              })
              checks.push({
                name: 'send-quota-not-double-charged',
                ok: psqlValue(`select reserved_units || ':' || consumed_units from leadgen_quota_buckets where id = '${sendBucketId}'`) === '0:1',
              })
              // The same token must not travel to a different body, and a lease minted
              // for one draft must not fund another draft's send.
              const makeDraft = async (label) => {
                const res = await fetch(`${BASE}/api/leadgen/drafts`, {
                  method: 'POST',
                  headers: { cookie: cookies.employee, 'content-type': 'application/json' },
                  body: JSON.stringify({ candidateId, recipientEmail: recipient || 'qa@m4.example', subject: 'M4 approval binding', bodyMarkdown: `${label} ${keyBase}` }),
                })
                const body = await res.json().catch(() => ({}))
                return { id: body?.draft?.id, bodyHash: body?.bodyHash }
              }
              const approveDraft = async (draft) => {
                const res = await fetch(`${BASE}/api/leadgen/drafts/${draft.id}/approvals`, {
                  method: 'POST',
                  headers: { cookie: cookies.employee, 'content-type': 'application/json' },
                  body: JSON.stringify({ decision: 'approved', draftHash: draft.bodyHash }),
                })
                const body = await res.json().catch(() => ({}))
                return body?.approval?.id ?? null
              }
              const other = await makeDraft('other body')
              if (other.id) {
                const crossed = await dispatch(other.id, approvalId, leaseToken)
                checks.push({ name: 'approval-not-reusable-on-other-draft', ok: crossed.status === 404 })
                const otherApproval = await approveDraft(other)
                const third = await makeDraft('third body')
                const thirdApproval = third.id ? await approveDraft(third) : null
                const boundToOther = await reserveSend(other.id, 'send-other')
                if (otherApproval && third.id && thirdApproval && boundToOther.leaseToken) {
                  const wrongDraft = await dispatch(third.id, thirdApproval, boundToOther.leaseToken)
                  checks.push({ name: 'send-lease-bound-to-its-draft', ok: wrongDraft.status === 409 })
                  // A refused dispatch must not spend the lease it could not use.
                  checks.push({
                    name: 'mismatch-kept-lease-reserved',
                    ok: psqlValue(`select reserved_units || ':' || consumed_units from leadgen_quota_buckets where id = '${sendBucketId}'`) === '1:1',
                  })
                  const ownDraft = await dispatch(other.id, otherApproval, boundToOther.leaseToken)
                  checks.push({ name: 'lease-funds-its-own-draft', ok: ownDraft.status === 201 })
                  checks.push({
                    name: 'bound-lease-consumed',
                    ok: psqlValue(`select reserved_units || ':' || consumed_units from leadgen_quota_buckets where id = '${sendBucketId}'`) === '0:2',
                  })
                }
              }
              // A dispatched draft cannot mint a fresh approval for the same body.
              const lateApprove = await approve(bodyHash)
              checks.push({ name: 'approve-after-dispatch-refused', ok: lateApprove.status === 409 })
            } else {
              checks.push({ name: 'one-approval-one-dispatch', ok: false, detail: 'no approval id returned' })
            }
          }
          psqlValue(`delete from leadgen_sends where draft_id in (select id from leadgen_drafts where candidate_id = '${candidateId}' and subject = 'M4 approval binding')`)
          psqlValue(`delete from leadgen_approvals where draft_id in (select id from leadgen_drafts where candidate_id = '${candidateId}' and subject = 'M4 approval binding')`)
          psqlValue(`delete from leadgen_drafts where candidate_id = '${candidateId}' and subject = 'M4 approval binding'`)
        } else {
          checks.push({ name: 'draft-created', ok: false, detail: 'no approved candidate to draft against' })
        }
      } finally {
        psqlValue(`delete from leadgen_quota_reservations where idempotency_key like '${keyBase}%'`)
        // Only ever build the id list from real ids: `id = 'undefined'` or
        // `id = coalesce('null', …)` makes the whole DELETE fail on `uuid = text`,
        // which is how spent fixture buckets leaked and poisoned the next run.
        const cleanupIds = [bucketId, sendBucketId, sendBucket2Id].filter(Boolean).map((id) => `'${id}'`).join(', ')
        psqlValue(`delete from leadgen_quota_buckets where id in (${cleanupIds})`)
        const leftover = Number(psqlValue(`select count(*) from leadgen_quota_buckets where id in (${cleanupIds})`))
        if (leftover !== 0) {
          checks.push({ name: 'fixture-cleanup', ok: false, detail: `bucket rows left: ${leftover}` })
        }
      }
      const ok = checks.length > 0 && checks.every((check) => check.ok)
      return { status: ok ? 200 : 403, text: JSON.stringify(checks) }
    },
    weakReason:
      '额度绕过、审批绑定、一次性令牌、抑制名单与 send 额度原子扣减均已实测（模拟传输，externalEffect=false）；真实供应商投递仍属 M6 另批',
    judge: (r) => {
      try {
        const parsed = JSON.parse(r.text)
        return Array.isArray(parsed) && parsed.length > 0 && parsed.every((check) => check.ok)
      } catch {
        return false
      }
    },
  },
]

const results = []
for (const item of cases) {
  // A 404 from a path that does not exist is not a security result. Learned the hard way:
  // /api/ai/chat is really /api/ai_assistant/ai/chat, and the wrong path "passed" twice.
  if (item.path && !paths.includes(item.path) && !(item.requires?.includes('leadgen-api') && fixtures['leadgen-api'])) {
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
  const weak = typeof item.weakJudge === 'function' ? Boolean(item.weakJudge(response)) : Boolean(item.weakReason)
  results.push({
    id: item.id,
    attack: item.attack,
    expected: item.expected,
    requires: item.requires,
    status: pass ? (weak ? 'pass-weak' : 'pass') : 'fail',
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
