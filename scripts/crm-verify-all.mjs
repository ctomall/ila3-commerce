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
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const FULL = process.argv.includes('--full')
// --only <id>[,<id>] runs a subset; useful when iterating on a single gate.
// A gate that was skipped proves nothing. For a release-grade run, say so out loud.
const REQUIRE_NO_SKIP = process.argv.includes('--require-no-skip')
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
  { id: 'unit', cmd: 'yarn test --silent', why: '单元测试（含负向对照过的规则层）' },
  { id: 'quote-regression', cmd: 'node scripts/crm-quote-regression.mjs', why: '既有报价/订单修复未回归' },
  { id: 'security-probe', cmd: 'node scripts/crm-security-probe.mjs', why: '授权行为与基线一致、零写入' },
  { id: 'm4-harness', cmd: 'node scripts/crm-m4-harness.mjs', why: 'M4 对抗用例（阻塞项单独报）' },
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
  { id: 'i18n-hardcoded', cmd: 'yarn i18n:check-hardcoded', why: '没有绕过 i18n 的硬编码文案' },
  { id: 'typecheck', cmd: 'yarn typecheck', why: '类型检查', full: true },
  { id: 'lint', cmd: 'yarn lint', why: 'ESLint（0 error 才算过）', full: true },
  { id: 'contrast', cmd: 'node scripts/check-contrast.mjs', why: '对比度 AA + 样本数下限', full: true },
  { id: 'ui-regression', cmd: 'node scripts/ui-regression.mjs', why: '界面回归 18 条', full: true },
  // The prototype six pages, asserted in a browser instead of admired in a screenshot.
  // Before this gate existed `.ai/qa` had zero specs and `yarn test:integration` exited 1
  // with "No tests found" — a route nothing could fail.
  { id: 'integration', cmd: 'yarn test:integration', why: 'M3 原型六页浏览器验收（真实断言）', full: true },
  // A review-branch gate: it materialises the pending leadgen migrations out of
  // feat/leadgen-schema-final and drills them against the current production schema
  // (apply -> drift vs snapshot -> rollback -> re-apply) in a throwaway database.
  // Exit code 78 means "no pending migration to prove" and is reported as SKIP.
  // Proves the rule-layer tests can fail. An independent review found 7 of 14 mutations
  // survived; the assertions are fixed, and this keeps them honest instead of trusting
  // a hand-run experiment from a chat message.
  // M8 asks for a restore drill. It was a hand-run experiment once; now every full run
  // dumps production, restores the archive into a throwaway database and compares.
  { id: 'restore-drill', cmd: 'node scripts/crm-restore-drill.mjs', why: '备份可恢复且恢复后表数/行数一致', full: true },
  { id: 'mutation', cmd: 'node scripts/crm-mutation-check.mjs', why: '规则层测试真的会红（变异击杀）', full: true },
  { id: 'migration-drill', cmd: 'node scripts/crm-migration-drill-gate.mjs', why: '待应用迁移在隔离库上可 up/回滚/复现', full: true, skipCode: 78 },
]

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
  const ok = run.status === 0
  const firstBad = output
    .split('\n')
    .find((line) => /FAIL|错误|error|失败|needs review|not found/i.test(line) && line.trim())
  results.push({
    ...gate,
    status: ok ? 'PASS' : 'FAIL',
    duration,
    code: run.status,
    note: ok ? '' : (firstBad || output.trim().split('\n').slice(-2).join(' ')).slice(0, 160),
  })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${gate.id.padEnd(16)} ${duration}s`)
}

const pass = results.filter((r) => r.status === 'PASS')
const fail = results.filter((r) => r.status === 'FAIL')
const skip = results.filter((r) => r.status === 'SKIP')

fs.mkdirSync(OUT, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const file = path.join(OUT, `verify-${stamp}.md`)
const lines = [
  '# 全量验证结果',
  '',
  `时间：${new Date().toISOString()} · 模式：${FULL ? '--full' : '快速集'} · 提交：\`${head()}\``,
  '',
  `PASS ${pass.length} · FAIL ${fail.length} · SKIP ${skip.length}`,
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
]
fs.writeFileSync(file, lines.join('\n') + '\n')

console.log(`\n[crm-verify] PASS ${pass.length} · FAIL ${fail.length} · SKIP ${skip.length}`)
if (REQUIRE_NO_SKIP && skip.length > 0) {
  console.log(`[crm-verify] --require-no-skip: ${skip.length} 项被跳过，视为失败`)
  for (const row of skip) console.log(`  SKIP ${row.id}: ${row.note || ''}`)
}
console.log(`[crm-verify] wrote ${path.relative(process.cwd(), file)}`)
process.exit(fail.length === 0 && !(REQUIRE_NO_SKIP && skip.length > 0) ? 0 : 1)

function head() {
  const run = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' })
  return (run.stdout || '').trim() || 'unknown'
}
