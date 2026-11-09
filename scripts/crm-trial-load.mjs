#!/usr/bin/env node
/**
 * Trial load measurement — the two modes in 09-trial.md §2, kept apart on purpose.
 *
 * The trial plan says the two numbers must never be merged: "3 concurrent users" and
 * "3 concurrent DSH runs" are different loads, and one number cannot stand for both.
 *
 *   --mode sessions   Runnable now. Holds N real logins, drives a small mix of pages and
 *                     APIs, and reports latency percentiles, error rate, and the server's
 *                     own CPU/RSS delta over the window.
 *   --mode runs       NOT runnable. A DSH research run needs the leadgen tables (not
 *                     migrated) and a per-employee DSH runtime (does not exist). This mode
 *                     refuses instead of reporting a number for something it did not do.
 *
 * Honesty rules baked in:
 *   - The box's load average is measured before and after; a run on a machine that is
 *     already saturated is refused unless --force, because its latency numbers would be
 *     about the other workloads.
 *   - The measurement is the *server process*, not the machine: MemoryCurrent and
 *     CPUUsageNSec come from systemd for the unit that serves the app.
 *   - A report states what it did not test (real user mix, write traffic, DSH runs).
 *
 * Usage:
 *   node scripts/crm-trial-load.mjs --mode sessions --users 3 --seconds 30
 *   node scripts/crm-trial-load.mjs --mode runs          # prints BLOCKED and exits 78
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { credentials, loginWithRetry } from './lib/session.mjs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}
const MODE = arg('mode', 'sessions')
const USERS = Number(arg('users', '3'))
const SECONDS = Number(arg('seconds', '30'))
const INTERVAL = Number(arg('interval', '750'))
const MAX_LOAD = Number(arg('max-load', '4'))
const FORCE = process.argv.includes('--force')
const BASE = arg('base', 'http://127.0.0.1:3000')
const UNIT = arg('unit', 'mercato')
const OUT = path.resolve(arg('out', 'docs/crm-platform/verify'))

/** Pages and APIs a trial user would actually touch, in a fixed rotation. */
const TARGETS = [
  { name: '后台首页 HTML', path: '/backend', kind: 'page' },
  { name: '公司列表 API', path: '/api/customers/companies?limit=1', kind: 'api' },
  { name: '助手工具清单 API', path: '/api/ai_assistant/tools', kind: 'api' },
]

function loadAverage() {
  return Number(fs.readFileSync('/proc/loadavg', 'utf8').split(' ')[0])
}

function unitMetric(prop) {
  const out = spawnSync('systemctl', ['show', UNIT, '-p', prop, '--value'], { encoding: 'utf8' })
  if (out.status !== 0) return null
  const raw = (out.stdout || '').trim()
  if (raw === '' || raw === '[not set]') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

const percentile = (values, p) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

if (MODE !== 'sessions') {
  console.log('[trial-load] BLOCKED：并行 Run 口径需要 leadgen 表（迁移未批准）+ 每员工 DSH 运行时（不存在）')
  console.log('[trial-load] 这一口径不许用"在线人数"的数代替——09-trial.md §2 明确要求分开报')
  console.log('[trial-load] 待两项就绪后重跑：node scripts/crm-trial-load.mjs --mode runs')
  process.exit(78)
}

if (!Number.isInteger(USERS) || USERS < 1 || USERS > 10) {
  console.error(`[trial-load] --users 必须是 1..10 的整数（收到 ${JSON.stringify(arg('users'))}）`)
  process.exit(2)
}
if (!Number.isFinite(SECONDS) || SECONDS < 5 || SECONDS > 600) {
  console.error(`[trial-load] --seconds 必须是 5..600（收到 ${JSON.stringify(arg('seconds'))}）`)
  process.exit(2)
}

const loadBefore = loadAverage()
if (loadBefore > MAX_LOAD && !FORCE) {
  console.log(`[trial-load] REFUSED：机器 load=${loadBefore.toFixed(2)} > --max-load=${MAX_LOAD}，此时测出的延迟是别的工作负载`)
  console.log('[trial-load] 换一台安静的机器，或显式加 --force 并在报告里注明')
  process.exit(3)
}

const creds = credentials()
const roles = ['employee', 'admin', 'superadmin'].filter((role) => creds.has(role))
if (roles.length === 0) {
  console.error('[trial-load] 没有任何可用登录凭据（/home/pro/.ila3-admin-credentials）')
  process.exit(2)
}

// One session per simulated user, cycling the available roles. These are existing
// privileged accounts, not trial salespeople — the report says so rather than implying a
// role mix the trial will have.
const sessions = []
for (let i = 0; i < USERS; i++) {
  const role = roles[i % roles.length]
  const cookie = await loginWithRetry(BASE, creds.get(role), { role })
  sessions.push({ role, cookie })
}

const memBefore = unitMetric('MemoryCurrent')
const cpuBefore = unitMetric('CPUUsageNSec')
const startedAt = new Date()
const latencies = new Map(TARGETS.map((target) => [target.name, []]))
const failures = []
const deadline = Date.now() + SECONDS * 1000
let requests = 0

let cursor = 0
while (Date.now() < deadline) {
  const session = sessions[cursor % sessions.length]
  const target = TARGETS[cursor % TARGETS.length]
  cursor += 1
  const started = performance.now()
  try {
    const response = await fetch(`${BASE}${target.path}`, {
      headers: { cookie: session.cookie, accept: target.kind === 'api' ? 'application/json' : 'text/html' },
      redirect: 'manual',
    })
    const body = await response.text()
    const elapsed = performance.now() - started
    latencies.get(target.name).push(elapsed)
    requests += 1
    // A login page is not the page: a redirected session would otherwise look like a fast
    // 200 and drag the percentiles down.
    if (response.status >= 400 || (target.kind === 'page' && !body.includes('__next'))) {
      failures.push(`${target.name} -> ${response.status} (${body.length} bytes)`)
    }
  } catch (error) {
    failures.push(`${target.name} -> ${error?.message ?? error}`)
  }
  await new Promise((resolve) => setTimeout(resolve, INTERVAL))
}

const memAfter = unitMetric('MemoryCurrent')
const cpuAfter = unitMetric('CPUUsageNSec')
const loadAfter = loadAverage()
const elapsedSeconds = (Date.now() - startedAt.getTime()) / 1000
const cpuPercent = cpuBefore !== null && cpuAfter !== null ? ((cpuAfter - cpuBefore) / 1e9 / elapsedSeconds) * 100 : null
const rssDeltaMb = memBefore !== null && memAfter !== null ? (memAfter - memBefore) / 1024 / 1024 : null
const errorRate = requests === 0 ? 1 : failures.length / (requests + failures.length)

const rows = TARGETS.map((target) => {
  const values = latencies.get(target.name)
  return {
    name: target.name,
    n: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    max: values.length ? Math.max(...values) : null,
  }
})

const fmt = (value, digits = 0) => (value === null || value === undefined ? '—' : Number(value).toFixed(digits))
const failed = errorRate > 0.01

fs.mkdirSync(OUT, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const reportPath = path.join(OUT, `trial-load-${stamp}.md`)
const lines = [
  `# 试用压测 · sessions 口径 — ${startedAt.toISOString()}`,
  '',
  `用户数：${USERS}（角色 ${sessions.map((s) => s.role).join(' / ')}，均为现有账号，**不是**试用的 2 业务员 + 1 主管）`,
  `时长：${fmt(elapsedSeconds, 1)} s · 请求间隔 ${INTERVAL} ms · 目标：${TARGETS.length} 个页面/接口轮转`,
  `机器 load：开始 ${fmt(loadBefore, 2)} → 结束 ${fmt(loadAfter, 2)}${loadBefore > MAX_LOAD ? '（**超过阈值仍以 --force 运行，延迟数据受其他负载影响**）' : ''}`,
  '',
  '| 目标 | 请求数 | p50 ms | p95 ms | max ms |',
  '| --- | --- | --- | --- | --- |',
  ...rows.map((row) => `| ${row.name} | ${row.n} | ${fmt(row.p50)} | ${fmt(row.p95)} | ${fmt(row.max)} |`),
  '',
  '| 服务端占用（systemd 单元） | 值 |',
  '| --- | --- |',
  `| 请求总数 | ${requests} |`,
  `| 失败 / 错误率 | ${failures.length} / ${fmt(errorRate * 100, 2)}% |`,
  `| CPU 占用（窗口内平均） | ${cpuPercent === null ? '不可读' : `${fmt(cpuPercent, 1)}%`} |`,
  `| 内存增量（RSS） | ${rssDeltaMb === null ? '不可读' : `${fmt(rssDeltaMb, 1)} MB`} |`,
  '',
  failed
    ? `**结果：FAIL** — 错误率 ${fmt(errorRate * 100, 2)}% 超过 1%，先查失败原因：${failures.slice(0, 3).join(' | ')}`
    : `**结果：PASS**（仅本口径）— ${requests} 个请求错误率 ${fmt(errorRate * 100, 2)}%`,
  '',
  '## 这一份**没有**证明的',
  '',
  '- **并行 Run 口径**：需要 leadgen 表（迁移未批准）与每员工 DSH 运行时（不存在），本次未测，不许用上面的数字代替。',
  '- 真实用户行为：这里是 3 个固定页面/接口的轮转，不是业务员点开客户、跑研究、审草稿的真实序列。',
  '- 写操作与长任务：全程只读 GET；审批、入库、发送都不在本次负载里。',
  '- 角色配比：现有账号权限远宽于试用账号，权限检查的耗时可能偏低。',
  '- 冷启动：第一次请求会触发服务端预热，RSS 增量里含预热带宽；连续跑第二次才是"稳定态"数字，两份报告要一起看。',
  '- 单机单进程：没有多实例、没有负载均衡，也没有数据库调优。',
  '',
]
fs.writeFileSync(reportPath, lines.join('\n'))

console.log(`[trial-load] ${USERS} 用户 / ${fmt(elapsedSeconds, 1)} s / ${requests} 请求 / 错误率 ${fmt(errorRate * 100, 2)}%`)
for (const row of rows) console.log(`  ${row.name.padEnd(18)} n=${row.n} p50=${fmt(row.p50)}ms p95=${fmt(row.p95)}ms`)
console.log(`[trial-load] 服务端 CPU ${cpuPercent === null ? '不可读' : `${fmt(cpuPercent, 1)}%`} · RSS 增量 ${rssDeltaMb === null ? '不可读' : `${fmt(rssDeltaMb, 1)} MB`}`)
console.log(`[trial-load] wrote ${path.relative(process.cwd(), reportPath)}`)
console.log(failed ? '[trial-load] RESULT: FAIL' : '[trial-load] RESULT: PASS')
process.exit(failed ? 1 : 0)
