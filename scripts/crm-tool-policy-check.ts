#!/usr/bin/env npx tsx
/**
 * Tool authorization inventory gate (M4-5).
 *
 * 05-security-poc §7 asks for three classes with a sample each and says a high-privilege
 * tool must not be exposed on a shared instance. `src/lib/dsh/tool-policy.ts` defines the
 * classes from registry metadata; this gate applies them to the tool registry the build
 * actually generated, and fails when the declaration file and the registry disagree.
 *
 * Why a gate rather than a table in a document: a new bulk tool becomes high_privilege the
 * moment it is added, and nothing would notice. Here it fails until someone acknowledges
 * it by name and writes down why it is acceptable at all.
 *
 * What it does NOT prove: that the runtime refuses these tools on a shared instance. The
 * decision function is unit-tested; wiring it into the ai-assistant runtime is part of the
 * DSH bridge, which does not exist yet.
 */
import fs from 'node:fs'
import path from 'node:path'
import { checkPlatformDeclarations, summarize, type PlatformToolDeclaration, type ToolDescriptor } from '../src/lib/dsh/tool-policy'
import { credentials, loginWithRetry } from './lib/session.mjs'

const ROOT = process.cwd()
const DECLARATION = path.join(ROOT, 'docs/crm-platform/appendix/tool-policy.json')
const REGISTRY = path.join(ROOT, '.mercato/generated/ai-tools.generated.ts')

const failures: string[] = []
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(30)} ${detail}`)
  if (!ok) failures.push(`${name}: ${detail}`)
}

if (!fs.existsSync(REGISTRY)) {
  console.log(`FAIL  registry                       找不到 ${path.relative(ROOT, REGISTRY)}（先 yarn build）`)
  console.log('\nRESULT: FAIL')
  process.exit(1)
}

const declaration = JSON.parse(fs.readFileSync(DECLARATION, 'utf8')) as {
  instanceGlobal?: string[]
  highPrivilegeAcknowledged?: Array<{ name: string; reason?: string }>
  platformTools?: PlatformToolDeclaration[]
}
const instanceGlobal = declaration.instanceGlobal ?? []
const acknowledged = new Map((declaration.highPrivilegeAcknowledged ?? []).map((entry) => [entry.name, entry.reason ?? '']))

const registryModule = (await import(REGISTRY)) as { allAiTools?: ToolDescriptor[] }
const tools = (registryModule.allAiTools ?? []).map((tool) => ({
  name: tool.name,
  requiredFeatures: tool.requiredFeatures,
  isMutation: tool.isMutation,
  isDestructive: tool.isDestructive,
  isBulk: tool.isBulk,
}))
if (tools.length === 0) {
  console.log('FAIL  registry                       注册表是空的，分类没有对象')
  console.log('\nRESULT: FAIL')
  process.exit(1)
}

const summary = summarize(tools, instanceGlobal)

// 1. every computed high_privilege tool must be acknowledged by name
const unacknowledged = summary.classes.high_privilege.filter((name) => !acknowledged.has(name))
check(
  'high-privilege-acknowledged',
  unacknowledged.length === 0,
  unacknowledged.length === 0
    ? `${summary.counts.high_privilege} 个高权限工具都已被逐个认领`
    : `未认领：${unacknowledged.join(', ')} —— 在 appendix/tool-policy.json 里写明它为什么可以存在`,
)

// 2. an acknowledgement that no longer matches the registry is drift, not history
const stale = [...acknowledged.keys()].filter((name) => !summary.classes.high_privilege.includes(name))
check(
  'acknowledgements-current',
  stale.length === 0,
  stale.length === 0 ? '认领列表与注册表一致，无残留' : `已不是高权限（或已删除）却仍在认领：${stale.join(', ')}`,
)

// 3. declarations must point at real tools, and an instance-global tool must not be
//    silently promoted by the back door of a stale declaration
const names = new Set(tools.map((tool) => tool.name))
const ghost = instanceGlobal.filter((name) => !names.has(name))
check('instance-global-exist', ghost.length === 0, ghost.length === 0 ? `instance_global 声明 ${instanceGlobal.length} 个，均存在` : `声明了不存在的工具：${ghost.join(', ')}`)

// 4. a mutation tool must never be classified instance_global: instance-global tools are
//    refused outright, and a mutation tool has to stay subject to the approval flow
const mutationGlobal = tools.filter((tool) => tool.isMutation === true && instanceGlobal.includes(tool.name))
check(
  'mutation-not-instance-global',
  mutationGlobal.length === 0,
  mutationGlobal.length === 0 ? '没有写操作被声明为 instance_global' : `写操作不能声明为 instance_global：${mutationGlobal.map((t) => t.name).join(', ')}`,
)

// 5. the classes must actually be populated the way §7 describes: a sample each
check(
  'three-classes-present',
  summary.counts.per_user > 0 && summary.counts.high_privilege > 0,
  `per_user ${summary.counts.per_user} · instance_global ${summary.counts.instance_global} · high_privilege ${summary.counts.high_privilege}`,
)

// 5b. platform built-ins are part of the surface even though they are not in the module
// registry. The runtime serves 97 tools while the registry holds 94; leaving the difference
// unclassified hides whatever is in it — in practice `execute`, a sandbox that can call any
// documented API endpoint including writes.
const platform = declaration.platformTools ?? []
const platformCheck = checkPlatformDeclarations(platform)
check(
  'platform-tools-declared',
  platformCheck.ok,
  platformCheck.ok
    ? `${platform.length} 个平台内置工具已分类（${platform.map((tool) => `${tool.name}:${tool.class}`).join(', ')}）`
    : `平台内置工具声明有问题：${platformCheck.ok === false ? platformCheck.problems.map((p) => `${p.name}=${p.problem}`).join(', ') : ''}`,
)

// 5c. live drift: the running app's tool list must be fully accounted for. A tool the app
// serves but neither the registry nor the declaration knows is unclassified by definition.
const BASE = process.env.CRM_BASE_URL ?? 'http://127.0.0.1:3000'
try {
  const creds = credentials()
  const role = ['superadmin', 'admin', 'employee'].find((candidate) => creds.has(candidate)) as string | undefined
  if (!role) throw new Error('没有可用登录凭据')
  const cookie = await loginWithRetry(BASE, creds.get(role as never), { role })
  const response = await fetch(`${BASE}/api/ai_assistant/tools`, { headers: { cookie, accept: 'application/json' } })
  if (!response.ok) throw new Error(`GET /api/ai_assistant/tools -> ${response.status}`)
  const payload = (await response.json()) as { tools?: Array<{ name?: string }> }
  const live = (payload.tools ?? []).map((tool) => tool?.name).filter((name): name is string => typeof name === 'string')
  const known = new Set([...names, ...platform.map((tool) => tool.name), ...instanceGlobal])
  const unclassified = live.filter((name) => !known.has(name))
  check(
    'live-vs-inventory',
    live.length > 0 && unclassified.length === 0,
    live.length === 0
      ? '线上工具列表为空，无法核对'
      : unclassified.length === 0
        ? `线上 ${live.length} 个工具全部有分类（注册表 ${names.size} + 平台内置 ${platform.length}）`
        : `线上有未分类工具：${unclassified.join(', ')} —— 先声明它，再谈分类`,
  )
} catch (error) {
  check('live-vs-inventory', false, `无法核对线上工具清单：${error instanceof Error ? error.message : String(error)}`)
}

// 6. per-class samples, so a reader can see what the classes mean without opening the code
const samples = {
  per_user: summary.classes.per_user.slice(0, 2),
  instance_global: summary.classes.instance_global.slice(0, 2),
  high_privilege: summary.classes.high_privilege.slice(0, 3),
}
console.log(`[tool-policy] samples ${JSON.stringify(samples)}`)
// The inventory the gate actually checked is registry + platform built-ins; printing only
// the registry count would understate the surface it just claimed to cover.
const totals = {
  per_user: summary.counts.per_user + platform.filter((tool) => tool.class === 'per_user').length,
  instance_global: summary.counts.instance_global + platform.filter((tool) => tool.class === 'instance_global').length,
  high_privilege: summary.counts.high_privilege + platform.filter((tool) => tool.class === 'high_privilege').length,
}
console.log(
  `[tool-policy] ${failures.length === 0 ? 'RESULT: PASS' : 'RESULT: FAIL'} — 注册表 ${tools.length} + 平台内置 ${platform.length} = ${
    tools.length + platform.length
  } 个工具：per_user ${totals.per_user} / instance_global ${totals.instance_global} / high_privilege ${totals.high_privilege}`,
)
if (failures.length > 0) for (const failure of failures) console.log(`  ✗ ${failure}`)
process.exit(failures.length === 0 ? 0 : 1)
