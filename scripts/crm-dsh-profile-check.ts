#!/usr/bin/env npx tsx
/**
 * Per-employee DSH profile gate.
 *
 * Proves the derivation layer of the M4 isolation contract against the *live* runtime
 * rather than against a fixture invented for the test: the tool list a session can really
 * call, the identity `context_whoami` really resolves, and the profiles two real employees
 * would get.
 *
 * What this gate proves:
 *   1. the derived toolset equals what the runtime reports for that user — the profile
 *      does not invent a tool and does not drop one;
 *   2. a child request for a tool outside the parent is dropped and reported, and the
 *      widening guard sees nothing to flag when the child only narrows;
 *   3. when a parent really is missing a tool the child holds, the guard names it;
 *   4. two employees get different keys and share no session/artifact/memory/browser root,
 *      and no employee id appears in any path;
 *   5. revocation fails closed.
 *
 * What it does NOT prove: that DSH honours these roots, that the filesystem permissions
 * under them are separated, or that a runtime child agent cannot reach a tool the profile
 * omits. Those need the per-employee runtime, which does not exist yet.
 *
 * Usage: npx tsx scripts/crm-dsh-profile-check.ts [--base http://127.0.0.1:3000]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { credentials, loginWithRetry } from './lib/session.mjs'
import {
  deriveProfile,
  materializeProfile,
  revoke,
  sharedRoots,
  wideningAttempt,
  type EmployeeProfileInput,
} from '../src/lib/dsh/profile'

const BASE = process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'http://127.0.0.1:3000'
const INJECTED = 'crm.__injected_escalation__'

const failures: string[] = []
const pass = (name: string, detail: string) => console.log(`PASS  ${name.padEnd(28)} ${detail}`)
const fail = (name: string, detail: string) => {
  failures.push(`${name}: ${detail}`)
  console.log(`FAIL  ${name.padEnd(28)} ${detail}`)
}
const check = (name: string, ok: boolean, detail: string) => (ok ? pass(name, detail) : fail(name, detail))

const creds = credentials()
const roles = ['employee', 'admin'].filter((role) => creds.has(role))
if (roles.length < 2) {
  console.log(`FAIL  fixtures                   需要两个可登录角色，当前只有 ${roles.join(', ') || '无'}`)
  console.log('\nRESULT: FAIL')
  process.exit(1)
}

type Identity = { userId: string; tenantId: string; organizationId: string }

async function sessionFor(role: string): Promise<{ cookie: string; tools: string[]; identity: Identity }> {
  const cookie = await loginWithRetry(BASE, creds.get(role), { role })
  const listRes = await fetch(`${BASE}/api/ai_assistant/tools`, { headers: { cookie } })
  if (!listRes.ok) throw new Error(`${role}: GET /api/ai_assistant/tools -> ${listRes.status}`)
  const list = (await listRes.json()) as { tools?: Array<{ name?: string }> }
  const tools = (list.tools ?? []).map((tool) => tool?.name).filter((name): name is string => typeof name === 'string')
  const whoRes = await fetch(`${BASE}/api/ai_assistant/tools/execute`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ toolName: 'context_whoami', args: {} }),
  })
  if (!whoRes.ok) throw new Error(`${role}: context_whoami -> ${whoRes.status}`)
  const who = (await whoRes.json()) as { result?: Identity }
  const identity = who.result
  if (!identity?.userId || !identity.tenantId || !identity.organizationId) {
    throw new Error(`${role}: context_whoami returned no usable identity: ${JSON.stringify(who).slice(0, 200)}`)
  }
  return { cookie, tools, identity }
}

const sessions: Record<string, { tools: string[]; identity: Identity }> = {}
for (const role of roles) sessions[role] = await sessionFor(role)
const [a, b] = roles
console.log(`[dsh-profile] ${roles.map((role) => `${role} ${sessions[role].tools.length} tools`).join(' · ')}`)

function inputFor(role: string, overrides: Partial<EmployeeProfileInput> = {}): EmployeeProfileInput {
  const { tools, identity } = sessions[role]
  return {
    userId: identity.userId,
    tenantId: identity.tenantId,
    organizationId: identity.organizationId,
    assistantId: 'crm.lead_researcher',
    policyVersion: 'pv-1',
    grantedTools: tools,
    assistantTools: tools,
    ...overrides,
  }
}

// 1. the derivation agrees with the runtime, per role
for (const role of roles) {
  const profile = deriveProfile(inputFor(role))
  const expected = [...sessions[role].tools].sort()
  check(
    `tools==runtime:${role}`,
    JSON.stringify(profile.tools) === JSON.stringify(expected),
    `${profile.tools.length} 个工具与运行时一致，丢弃 ${profile.dropped.length} 个`,
  )
}

// 1b. a ceiling that is strictly smaller than the grant must actually cut the list
// (before this, grantedTools and assistantTools were the same array, so the intersection
// was an identity check and could not tell a working filter from a no-op: A-P2-10)
{
  const granted = sessions[a].tools
  const ceiling = granted.slice(0, Math.min(10, granted.length))
  const narrowed = deriveProfile(inputFor(a, { assistantTools: ceiling }))
  check(
    'ceiling-truncates',
    narrowed.tools.length === ceiling.length &&
      narrowed.tools.every((tool) => ceiling.includes(tool)) &&
      narrowed.dropped.filter((entry) => entry.reason === 'not-in-assistant-ceiling').length ===
        granted.length - ceiling.length,
    `助手上限取 ${ceiling.length} 个 → 工具集剩 ${narrowed.tools.length} 个，另 ${granted.length - ceiling.length} 个记为不在上限内`,
  )
}

// 2. a child may narrow, and a request outside the parent is dropped and reported
const parent = deriveProfile(inputFor(a))
const child = deriveProfile(inputFor(a, { requestedTools: [...sessions[a].tools, INJECTED] }))
check('child-narrows', JSON.stringify(child.tools) === JSON.stringify(parent.tools), `子集 ${child.tools.length} = 父集 ${parent.tools.length}`)
check(
  'child-injected-dropped',
  child.dropped.some((d) => d.tool === INJECTED),
  `注入的 ${INJECTED} 被丢弃并记录原因：${child.dropped.find((d) => d.tool === INJECTED)?.reason ?? '未记录'}`,
)
check('child-no-widening', wideningAttempt(parent, child).length === 0, 'narrowing child 未触发提权告警')

// 3. the guard does fire when a child really holds something the parent lacks
const trimmedParent = deriveProfile(inputFor(a, { assistantTools: [], grantedTools: [] }))
const escalated = deriveProfile(inputFor(a))
const widening = wideningAttempt(trimmedParent, escalated)
check('guard-detects-widening', widening.length === sessions[a].tools.length && widening.length > 0, `父集空时子集全部被点名（${widening.length} 个）`)

// 4. two employees: different keys, disjoint roots, no ids in paths
const profileA = deriveProfile(inputFor(a))
const profileB = deriveProfile(inputFor(b))
check('profiles-differ', profileA.profileKey !== profileB.profileKey, `${a} ${profileA.profileKey.slice(0, 8)} ≠ ${b} ${profileB.profileKey.slice(0, 8)}`)
check('roots-disjoint', sharedRoots(profileA, profileB).length === 0, '4 个根目录无重叠')
const leaked = [...Object.values(profileA.roots), ...Object.values(profileB.roots)].filter(
  (root) => root.includes(profileA.userId) || root.includes(profileB.userId),
)
check('no-ids-in-paths', leaked.length === 0, '路径里不含任一方 userId')

// 5. the profile really exists on disk, with modes that do not rely on trust
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-profile-gate-'))
// mkdtemp creates 0700, which would deny the stranger at the root and make every denial
// below unattributable. Make the root traversable (0711) so the only thing standing
// between the stranger and the profile is the profile's own mode.
fs.chmodSync(tempRoot, 0o711)
const own = process.env.USER ?? execFileSync('id', ['-un'], { encoding: 'utf8' }).trim()
const stranger = 'postgres'
const canRead = (user: string, target: string): { ok: boolean; detail: string; denied: boolean } => {
  try {
    execFileSync('sudo', ['-n', '-u', user, 'cat', target], { stdio: 'pipe' })
    return { ok: true, detail: 'readable', denied: false }
  } catch (error) {
    const stderr = String((error as { stderr?: Buffer }).stderr ?? '')
    return {
      ok: false,
      detail: stderr.split('\n').find((line) => line.trim())?.trim().slice(0, 90) ?? 'failed',
      // "denied" must mean EACCES, not "path does not exist" or "sudo is not configured".
      denied: /permission denied/i.test(stderr),
    }
  }
}
try {
  const writtenA = materializeProfile(profileA, tempRoot)
  const writtenB = materializeProfile(profileB, tempRoot)
  const modes = ['session', 'artifacts', 'browser', `memory/${profileA.policyVersion}`].map((suffix) => ({
    suffix,
    mode: fs.statSync(path.join(writtenA.profileDir, suffix)).mode & 0o777,
  }))
  const metadataMode = fs.statSync(writtenA.metadataPath).mode & 0o777
  check(
    'roots-on-disk-0700',
    modes.every((entry) => entry.mode === 0o700) && metadataMode === 0o600,
    `${modes.length} 个目录 ${modes.map((entry) => entry.mode.toString(8)).join('/')}、元数据 ${metadataMode.toString(8)}`,
  )

  // Without a working cross-user probe this check would "pass" because sudo failed, which
  // is the exact false green this project keeps hunting. Prove the probe works first.
  const probe = canRead(stranger, '/etc/hostname')
  if (!probe.ok) {
    fail('cross-user-probe-usable', `无法用 ${stranger} 读世界可读文件，跨用户结论不成立：${probe.detail}`)
  } else {
    // Positive control at the SAME level as the denial: the control sits inside
    // `profiles/` (0711), one level above the employee directory (0700). If the stranger
    // can read the control but not the profile, the denial is attributable to the
    // employee directory — which is the boundary meant to hold. Putting the control one
    // level higher proved nothing (audit finding A-P2-9).
    const control = path.join(tempRoot, 'profiles', 'control.txt')
    fs.writeFileSync(control, 'control\n', { mode: 0o644 })
    const controlRead = canRead(stranger, control)
    check('probe-reads-same-level', controlRead.ok, `${stranger} 能读 profiles/ 下的 0644 控制文件：${controlRead.detail}`)

    const self = canRead(own, writtenA.metadataPath)
    check('owner-can-read-own', self.ok, `${own} 读自己的 profile：${self.detail}`)
    for (const [label, written] of [
      [a, writtenA],
      [b, writtenB],
    ] as const) {
      const meta = canRead(stranger, written.metadataPath)
      const dir = canRead(stranger, path.join(written.profileDir, 'session'))
      check(
        `stranger-denied:${label}`,
        !meta.ok && meta.denied && !dir.ok && dir.denied,
        `${stranger} 读 ${label} 的 profile.json / session：${meta.ok || dir.ok ? '居然读到了' : 'Permission denied'}`,
      )
    }
  }
  check(
    'two-dirs-on-disk',
    fs
      .readdirSync(path.join(tempRoot, 'profiles'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).length === 2 && writtenA.profileDir !== writtenB.profileDir,
    `磁盘上两个独立目录：${path.basename(writtenA.profileDir).slice(0, 8)} ≠ ${path.basename(writtenB.profileDir).slice(0, 8)}`,
  )
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}

// 6. revocation fails closed
const revoked = revoke(profileA)
check('revoke-fails-closed', revoked.tools.length === 0 && revoked.revoked && revoked.userId === profileA.userId, '工具清零、标记 revoked、身份保留')

console.log(
  `\n[dsh-profile] ${failures.length === 0 ? 'RESULT: PASS' : 'RESULT: FAIL'} — ${roles.length} 个角色、${
    sessions[a].tools.length + sessions[b].tools.length
  } 个工具；工具集=运行时、子集不变宽、目录 0700、${stranger} 读不到、撤权清零`,
)
if (failures.length > 0) for (const failure of failures) console.log(`  ✗ ${failure}`)
process.exit(failures.length === 0 ? 0 : 1)
