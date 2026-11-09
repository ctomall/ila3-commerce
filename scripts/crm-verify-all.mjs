#!/usr/bin/env node
/**
 * One command that reports what is actually proven right now.
 *
 * Each gate is a separate script; running them by hand makes it easy to quote the ones
 * that pass and forget the ones that were never run. This runs them in order and prints a
 * single table with PASS / FAIL / SKIP, recording the first failing line so the summary
 * can never be greener than the detail.
 *
 * "SKIP" is used for the slow or environment-dependent gates (browser regression, full
 * typecheck) unless --full is passed — and a skipped gate is never counted as a pass.
 *
 * Usage:
 *   node scripts/crm-verify-all.mjs            # fast set
 *   node scripts/crm-verify-all.mjs --full     # adds typecheck + ui-regression + contrast
 *   node scripts/crm-verify-all.mjs --out docs/crm-platform/verify
 *   node scripts/crm-verify-all.mjs --full --require-no-skip --require-clean
 *                                              # release-grade: a skip or a dirty tree fails
 *
 * The report records the working-tree state on every run, and every PASS row carries the
 * gate's own summary line. A row that said "通过" with no observation was a claim, not
 * evidence.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const FULL = process.argv.includes('--full')
// --only <id>[,<id>] runs a subset; useful when iterating on a single gate.
// A gate that was skipped proves nothing. For a release-grade run, say so out loud.
const REQUIRE_NO_SKIP = process.argv.includes('--require-no-skip')
// A run against a dirty tree can only prove "the working copy passed", not "this commit
// passed". Report the state always; refuse it only when a release-grade run asks.
const REQUIRE_CLEAN = process.argv.includes('--require-clean')
const onlyFlag = process.argv.indexOf('--only')
const ONLY = onlyFlag === -1 ? null : new Set((process.argv[onlyFlag + 1] || '').split(',').map((s) => s.trim()).filter(Boolean))
const outFlag = process.argv.indexOf('--out')
const OUT = path.resolve(outFlag === -1 ? 'docs/crm-platform/verify' : process.argv[outFlag + 1])

const GATES = [
  // First on purpose: every browser-facing gate below talks to a running server, and a
  // server older than the source makes all of them verify yesterday's code.
  { id: 'build-freshness', cmd: 'node scripts/crm-build-freshness.mjs', why: '运行中的服务对应当前源码且进程晚于构建' },
  { id: 'patches', cmd: 'node scripts/verify-patches.mjs', why: '受管补丁逐个 marker 在位' },
  { id: 'patch-budget', cmd: 'node scripts/check-patch-budget.mjs', why: '补丁条目不超预算' },
  { id: 'unit', cmd: 'yarn test --silent', why: '单元测试（含负向对照过的规则层）', evidence: /^Tests:\s.*\bpassed\b/ },
  { id: 'quote-regression', cmd: 'node scripts/crm-quote-regression.mjs', why: '既有报价/订单修复未回归', evidence: /\[quote-regression\] \d+\/\d+ passed/ },
  { id: 'security-probe', cmd: 'node scripts/crm-security-probe.mjs', why: '授权行为与基线一致、零写入', evidence: /\[probe\] \d+\/\d+ as expected/ },
  // M4's isolation contract has a derivation layer that can be proven without a live DSH
  // runtime: does every employee get a toolset equal to what the runtime reports, can a
  // child only narrow, are two employees' session/artifact/memory/browser roots disjoint,
  // and does revocation fail closed. The runtime half stays unproven and is labelled here.
  { id: 'dsh-profile', cmd: 'npx tsx scripts/crm-dsh-profile-check.ts', why: '每员工 profile 派生+落盘：工具集=运行时、子集不变宽、目录 0700 且跨 OS 用户读被拒、撤权失败关闭（DSH 运行时隔离仍未验）', evidence: /\[dsh-profile\] RESULT:/ },
  // M4-5's three authorization classes, computed from the generated tool registry rather
  // than described in a table. A new bulk tool becomes high_privilege the moment it is
  // added, and fails until someone acknowledges it by name.
  { id: 'tool-policy', cmd: 'npx tsx scripts/crm-tool-policy-check.ts', why: '工具分三类（每用户/实例全局/高权限）：高权限逐个认领、声明与注册表双向一致（运行时是否真拒仍未验）', evidence: /\[tool-policy\] RESULT:/ },
  { id: 'm4-harness', cmd: 'node scripts/crm-m4-harness.mjs', why: 'M4 对抗用例：可执行部分无 fail（blocked/invalid 是覆盖缺口，不计入通过）', evidence: /\[m4\] pass \d+/ },
  // The leadgen OpenAPI draft lints itself (features, idempotency, 429/409, no body
  // identity) and checks it does not collide with a live path. It existed and passed;
  // nobody ran it, so the draft could have drifted from its own rules silently.
  { id: 'contract', cmd: 'node scripts/crm-contract-check.mjs', why: 'leadgen 契约满足自身规则且不与线上路径碰撞' },
  // --check turns the recorded baseline into an assertion. Without it this gate ran the
  // recorder: it refreshed appendix/nav-*.json and could not fail on an entry count or a
  // duplicate title, so the M1 acceptance criterion was enforced by nobody.
  { id: 'nav-baseline', cmd: 'node scripts/crm-nav-baseline.mjs --check', why: '入口数与冻结基线一致、重名 0' },
  // The structural checker existed and exited 1 on issues, but was never in the gate set.
  { id: 'nav-structure', cmd: 'node scripts/nav-check.mjs', why: '导航数据本身无问题（重名 href/空标签/孤儿分组）' },
  // Five stock pages are orphaned from their parent upstream; the five are pinned in
  // appendix/nav-nesting.json, and this fails when a sixth appears OR when one is fixed
  // without updating the baseline.
  { id: 'nav-nesting', cmd: 'node scripts/crm-nav-nesting-check.mjs --check', why: '未嵌套入口与白名单一致（多一条或修好一条都红）' },
  { id: 'tokens', cmd: 'node scripts/check-token-layers.mjs --strict', why: '设计令牌没有非语义用法' },
  { id: 'i18n-hardcoded', cmd: 'yarn i18n:check-hardcoded', why: '硬编码文案扫描 0 error（advisory 命中单独计数，不当作已清零）', evidence: /\[i18n:check-hardcoded\]/ },
  { id: 'typecheck', cmd: 'yarn typecheck', why: '类型检查（tsc 成功时无输出）', full: true },
  { id: 'lint', cmd: 'yarn lint', why: 'ESLint（0 error 才算过）', full: true },
  { id: 'contrast', cmd: 'node scripts/check-contrast.mjs', why: '对比度 AA + 样本数下限', full: true, evidence: /\[contrast\] \d+\/\d+ within AA/ },
  { id: 'ui-regression', cmd: 'node scripts/ui-regression.mjs', why: '界面回归 18 条', full: true, evidence: /^\d+\/\d+ passed$/ },
  // The prototype six pages, asserted in a browser instead of admired in a screenshot.
  // Before this gate existed `.ai/qa` had zero specs and `yarn test:integration` exited 1
  // with "No tests found" — a route nothing could fail.
  { id: 'integration', cmd: 'yarn test:integration', why: 'M3 原型六页浏览器验收（真实断言）', full: true, evidence: /^\s*\d+ passed/ },
  // A review-branch gate: it materialises the pending leadgen migrations out of
  // feat/leadgen-schema-final and drills them against the current production schema
  // (apply -> drift vs snapshot -> rollback -> re-apply) in a throwaway database.
  // Exit code 78 means "no pending migration to prove" and is reported as SKIP.
  // Proves the rule-layer tests can fail. An independent review found 7 of 14 mutations
  // survived; the assertions are fixed, and this keeps them honest instead of trusting
  // a hand-run experiment from a chat message.
  // M8 asks for a restore drill. It was a hand-run experiment once; now every full run
  // dumps production, restores the archive into a throwaway database and compares.
  { id: 'restore-drill', cmd: 'node scripts/crm-restore-drill.mjs', why: '备份可恢复且结构与内容都一致（比对器每次先自证会红）', full: true, evidence: /^PASS\s+summary/ },
  { id: 'mutation', cmd: 'node scripts/crm-mutation-check.mjs', why: '规则层测试真的会红（变异击杀）', full: true, evidence: /\[mutation\] killed \d+/ },
  { id: 'migration-drill', cmd: 'node scripts/crm-migration-drill-gate.mjs', why: '待应用迁移在隔离库上可 up/回滚/复现', full: true, skipCode: 78, evidence: /^INFO 演练来源/ },
]

// A subset run cannot be release-grade evidence: the gates that did not run are the ones
// nobody looked at. Refuse the combination instead of producing a report that says
// "PASS n · FAIL 0 · SKIP 0" for one gate (audit finding A-P1-1).
if (ONLY && (REQUIRE_CLEAN || REQUIRE_NO_SKIP)) {
  console.error('[crm-verify] --only 不能与 --require-clean / --require-no-skip 同用：子集运行不是发布级证据')
  console.error(`[crm-verify] 只跑了 ${[...ONLY].join(', ')}，其余 ${22 - ONLY.size} 道门没有运行`)
  process.exit(1)
}

// A typo in --only used to run zero gates and exit 0 — the greenest possible lie.
if (ONLY && !GATES.some((gate) => ONLY.has(gate.id))) {
  console.error(`[crm-verify] --only 没有匹配任何门：${[...ONLY].join(', ')}`)
  console.error(`[crm-verify] 可用：${GATES.map((g) => g.id).join(', ')}`)
  process.exit(1)
}

/**
 * What did this gate actually observe?
 *
 * A PASS row with an empty note is a claim with no content: the report says a gate
 * passed but not one fact from inside it. Every gate leaves its own summary on stdout,
 * so keep the most informative line. A gate may declare `evidence: /re/` to name the
 * line that carries the number it is asserting; otherwise take the last line that is
 * not the `RESULT:` sentinel.
 */
const EVIDENCE_NOISE = /^(npm notice|npm warn|npm ERR|\(Use `node|Node\.js v|\s*at\s)/
function evidenceLine(output, gate) {
  const lines = output
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !EVIDENCE_NOISE.test(line))
  if (gate.evidence instanceof RegExp) {
    const hit = lines.find((line) => gate.evidence.test(line))
    if (hit) return hit
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!/^RESULT:\s*(PASS|FAIL)\b/i.test(lines[i])) return lines[i]
  }
  return lines.at(-1) ?? '（命令无输出，退出码 0）'
}

/** The working tree is part of the evidence: a dirty run proves a copy, not a commit. */
function worktreeState() {
  const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
  if (status.status !== 0) return { known: false, entries: [], error: (status.stderr || '').trim().slice(0, 200) }
  const entries = (status.stdout || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line !== '')
  return { known: true, entries, error: null }
}
const worktree = worktreeState()

const results = []
for (const gate of GATES) {
  if (ONLY && !ONLY.has(gate.id)) continue
  if (gate.full && !FULL) {
    results.push({ ...gate, status: 'SKIP', duration: 0, note: '需要 --full' })
    continue
  }
  const started = Date.now()
  const run = spawnSync('bash', ['-lc', gate.cmd], { encoding: 'utf8', cwd: process.cwd(), timeout: 900000 })
  const duration = Math.round((Date.now() - started) / 1000)
  const output = `${run.stdout || ''}\n${run.stderr || ''}`
  if (gate.skipCode !== undefined && run.status === gate.skipCode) {
    const reason = output.split('\n').find((line) => /^SKIP/.test(line.trim())) || '无待验证对象'
    results.push({ ...gate, status: 'SKIP', duration, code: run.status, note: reason.trim().slice(0, 160) })
    console.log(`SKIP ${gate.id.padEnd(16)} ${duration}s`)
    continue
  }
  // Exit code alone is not evidence: a gate that prints `RESULT: FAIL` and forgets to exit
  // non-zero would be reported as a pass. The house convention is that terminal line.
  const terminalFail = /^RESULT:\s*FAIL\b/im.test(output)
  const ok = run.status === 0 && !terminalFail
  const firstBad = output
    .split('\n')
    .find((line) => /FAIL|错误|error|失败|needs review|not found/i.test(line) && line.trim())
  results.push({
    ...gate,
    status: ok ? 'PASS' : 'FAIL',
    duration,
    code: run.status,
    note: ok
      ? evidenceLine(output, gate).slice(0, 160)
      : terminalFail && run.status === 0
        ? '脚本打印了 RESULT: FAIL 却以 0 退出'
        : (firstBad || output.trim().split('\n').slice(-2).join(' ')).slice(0, 160),
  })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${gate.id.padEnd(16)} ${duration}s`)
}

const pass = results.filter((r) => r.status === 'PASS')
const fail = results.filter((r) => r.status === 'FAIL')
const skip = results.filter((r) => r.status === 'SKIP')

fs.mkdirSync(OUT, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const file = path.join(OUT, `verify-${stamp}.md`)
// "Cannot tell" is not "clean": a release-grade run must not pass because git was absent.
const GATE_OUTPUT = /^docs\/crm-platform\/(verify|poc|regression)\//
const FLAGS = process.argv.slice(2).filter((arg) => arg.startsWith('--')).join(' ')
const treeUnknown = !worktree.known
const treeDirty = (worktree.known && worktree.entries.length > 0) || (treeUnknown && REQUIRE_CLEAN)
const treeLabel = !worktree.known && REQUIRE_CLEAN
  ? `**无法判断**（--require-clean 下视为不干净：${worktree.error}）`
  : worktree.known
  ? treeDirty
    ? `**脏**（${worktree.entries.length} 项未提交：${worktree.entries.slice(0, 6).join(' / ')}${worktree.entries.length > 6 ? ' …' : ''}）`
    : '干净'
  : `未知（git status 失败：${worktree.error}）`

// The gates themselves write tracked files (matrices, drill reports). A start-only
// snapshot would let the report say "clean" about a tree this run then dirtied, and the
// next --require-clean run would fail on the previous run's output (audit A-P2-11).
const after = worktreeState()
const afterEntries = after.known ? after.entries : []
const pathOf = (entry) => entry.replace(/^\s*\S+\s+/, '')
const gateOutputs = afterEntries.filter((entry) => GATE_OUTPUT.test(pathOf(entry)))
const manual = afterEntries.filter((entry) => !GATE_OUTPUT.test(pathOf(entry)))
const releaseGrade = REQUIRE_CLEAN && REQUIRE_NO_SKIP && !ONLY
// A run that never claimed release grade cannot pass as one. Printing PASS here made the
// summary disagree with the header line that says 发布级：否 (caught by re-reading the
// report straight after writing it).
const releaseOk =
  fail.length === 0 &&
  !(REQUIRE_NO_SKIP && skip.length > 0) &&
  !(REQUIRE_CLEAN && (treeDirty || manual.length > 0))
const releaseVerdict = releaseGrade ? (releaseOk ? 'PASS' : 'FAIL') : '不适用（非发布级运行）'

const lines = [
  ONLY ? '# 子集验证结果（不是全量）' : '# 全量验证结果',
  '',
  `时间：${new Date().toISOString()} · 模式：${FULL ? '--full' : '快速集'} · 提交：\`${head()}\``,
  // A subset run proves a subset. Without this line the report reads exactly like a full
  // one — same table, same "全部通过" — and gets quoted as if the other gates had run.
  ONLY ? `范围：**仅 ${[...ONLY].sort().join(', ')}**（${results.filter((r) => r.status !== 'SKIP').length}/${GATES.length} 道门，不是全量）` : `范围：全部 ${GATES.length} 道门`,
  `参数：\`${FLAGS || '（无）'}\` · 发布级：${releaseGrade ? '**是**（--require-clean + --require-no-skip）' : '否（缺 --require-clean/--require-no-skip 或为子集运行）'}`,
  `工作树（开始时）：${treeLabel}`,
  `工作树（结束时）：本次运行改动了 ${afterEntries.length} 项，其中门产物 ${gateOutputs.length} 项${
    manual.length > 0 ? `，**其他改动 ${manual.length} 项**（${manual.slice(0, 4).join(' / ')}）` : '，无其他改动'
  }`,
  '',
  `PASS ${pass.length} · FAIL ${fail.length} · SKIP ${skip.length} · 发布级门禁：${releaseVerdict}`,
  '',
  '| 门禁 | 状态 | 耗时 | 说明 |',
  '|---|---|---|---|',
  ...results.map((r) => `| \`${r.id}\` | ${r.status === 'PASS' ? '通过' : r.status === 'FAIL' ? '**失败**' : '跳过'} | ${r.duration}s | ${r.why}${r.note ? ` — ${String(r.note).replace(/\|/g, '/')}` : ''} |`),
  '',
  skip.length
    ? FULL
      ? `> 跳过 ${skip.length} 项**不计入通过**（已带 \`--full\`，跳过原因是环境/对象缺失，不是没加参数）。`
      : `> 跳过 ${skip.length} 项**不计入通过**；要全量证据请加 \`--full\`。`
    : '> 本次无跳过项。',
  fail.length ? '> 有失败项，先修再谈交付。' : '',
  REQUIRE_CLEAN && treeDirty
    ? `> \`--require-clean\`：工作树有 ${worktree.entries.length} 项未提交改动，本次结果只证明这份副产物，不作为提交级证据。`
    : '',
]
fs.writeFileSync(file, lines.join('\n') + '\n')

console.log(`\n[crm-verify] PASS ${pass.length} · FAIL ${fail.length} · SKIP ${skip.length}`)
console.log(`[crm-verify] 工作树：${treeLabel.replace(/\*\*/g, '')}`)
if (REQUIRE_NO_SKIP && skip.length > 0) {
  console.log(`[crm-verify] --require-no-skip: ${skip.length} 项被跳过，视为失败`)
  for (const row of skip) console.log(`  SKIP ${row.id}: ${row.note || ''}`)
}
if (REQUIRE_CLEAN && treeDirty) {
  console.log(`[crm-verify] --require-clean: 工作树脏（${worktree.entries.length} 项），结果不算提交级证据`)
  for (const entry of worktree.entries.slice(0, 10)) console.log(`  ${entry}`)
}
console.log(`[crm-verify] wrote ${path.relative(process.cwd(), file)}`)
if (REQUIRE_CLEAN && manual.length > 0) {
  console.log(`[crm-verify] --require-clean: 本次运行改动了 ${manual.length} 个非门产物文件，结果不算提交级证据`)
  for (const entry of manual.slice(0, 10)) console.log(`  ${entry}`)
}
console.log(`[crm-verify] 发布级门禁：${releaseVerdict}`)
process.exit(releaseOk ? 0 : 1)

function head() {
  const run = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' })
  return (run.stdout || '').trim() || 'unknown'
}
