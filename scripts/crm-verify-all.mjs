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
const outFlag = process.argv.indexOf('--out')
const OUT = path.resolve(outFlag === -1 ? 'docs/crm-platform/verify' : process.argv[outFlag + 1])

const GATES = [
  { id: 'patches', cmd: 'node scripts/verify-patches.mjs', why: '受管补丁逐个 marker 在位' },
  { id: 'patch-budget', cmd: 'node scripts/check-patch-budget.mjs', why: '补丁条目不超预算' },
  { id: 'unit', cmd: 'yarn test --silent', why: '单元测试（含负向对照过的规则层）' },
  { id: 'quote-regression', cmd: 'node scripts/crm-quote-regression.mjs', why: '既有报价/订单修复未回归' },
  { id: 'security-probe', cmd: 'node scripts/crm-security-probe.mjs', why: '授权行为与基线一致、零写入' },
  { id: 'm4-harness', cmd: 'node scripts/crm-m4-harness.mjs', why: 'M4 对抗用例（阻塞项单独报）' },
  { id: 'nav-baseline', cmd: 'node scripts/crm-nav-baseline.mjs', why: '入口数不变、重名 0' },
  { id: 'tokens', cmd: 'node scripts/check-token-layers.mjs --strict', why: '设计令牌没有非语义用法' },
  { id: 'i18n-hardcoded', cmd: 'yarn i18n:check-hardcoded', why: '没有绕过 i18n 的硬编码文案' },
  { id: 'typecheck', cmd: 'yarn typecheck', why: '类型检查', full: true },
  { id: 'lint', cmd: 'yarn lint', why: 'ESLint（0 error 才算过）', full: true },
  { id: 'contrast', cmd: 'node scripts/check-contrast.mjs', why: '对比度 AA + 样本数下限', full: true },
  { id: 'ui-regression', cmd: 'node scripts/ui-regression.mjs', why: '界面回归 18 条', full: true },
]

const results = []
for (const gate of GATES) {
  if (gate.full && !FULL) {
    results.push({ ...gate, status: 'SKIP', duration: 0, note: '需要 --full' })
    continue
  }
  const started = Date.now()
  const run = spawnSync('bash', ['-lc', gate.cmd], { encoding: 'utf8', cwd: process.cwd(), timeout: 900000 })
  const duration = Math.round((Date.now() - started) / 1000)
  const output = `${run.stdout || ''}\n${run.stderr || ''}`
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
  skip.length ? `> 跳过 ${skip.length} 项**不计入通过**；要全量证据请加 \`--full\`。` : '> 本次无跳过项。',
  fail.length ? '> 有失败项，先修再谈交付。' : '',
]
fs.writeFileSync(file, lines.join('\n') + '\n')

console.log(`\n[crm-verify] PASS ${pass.length} · FAIL ${fail.length} · SKIP ${skip.length}`)
console.log(`[crm-verify] wrote ${path.relative(process.cwd(), file)}`)
process.exit(fail.length === 0 ? 0 : 1)

function head() {
  const run = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' })
  return (run.stdout || '').trim() || 'unknown'
}
