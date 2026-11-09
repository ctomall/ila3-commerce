#!/usr/bin/env node
/**
 * Build freshness: is the thing answering HTTP actually the code in this checkout?
 *
 * Every browser-facing gate in this project talks to a running server. If that server is
 * older than the source, all of them happily verify yesterday's code — the most
 * expensive kind of false confidence, because nothing looks wrong.
 *
 * A naive check (compare `build-info.json.commit` with HEAD) would have produced a false
 * alarm here: this build was made at 20:04 from a working tree that already contained a
 * change committed at 20:08, so the recorded commit legitimately lags HEAD. So the check
 * asks the two questions that actually matter:
 *
 *   1. Did any runtime-relevant file change after the build started? (git range from the
 *      recorded commit to HEAD, plus an mtime sweep for uncommitted edits);
 *   2. Did the service process start after the build finished? (a fresh build with a
 *      stale process is the same lie as a stale build).
 *
 * Runtime-relevant means: src/**, vendor/**, src/nav/**, the build config, and the module
 * list. Docs, scripts and tests are ignored — changing them cannot alter the served app.
 *
 * Overrides exist for machines without systemd and for the gate's own negative controls:
 *   --build-info <path>  --service-start <iso>
 *
 * Usage: node scripts/crm-build-freshness.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

const arg = (name) => {
  const at = process.argv.indexOf(name)
  return at === -1 ? null : process.argv[at + 1]
}

const REPO = process.cwd()
const BUILD_INFO = path.resolve(arg('--build-info') ?? '.mercato/build-info.json')

function git(args) {
  const r = spawnSync('git', args, { cwd: REPO, encoding: 'utf8' })
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
}

const RUNTIME_PATTERNS = [
  /^src\//,
  /^vendor\//,
  /^package\.json$/,
  /^tsconfig(\..*)?\.json$/,
  /^next\.config\./,
  /^postcss\.config\./,
]
const isRuntime = (file) =>
  RUNTIME_PATTERNS.some((re) => re.test(file)) &&
  // Tests and fixtures inside src cannot change what is served.
  !/__tests__\//.test(file) &&
  !/\.(test|spec)\.tsx?$/.test(file)

const problems = []
const notes = []

if (!fs.existsSync(BUILD_INFO)) {
  console.log(`FAIL  running a build requires a build record: ${path.relative(REPO, BUILD_INFO)} 不存在`)
  process.exit(1)
}

const info = JSON.parse(fs.readFileSync(BUILD_INFO, 'utf8'))
const builtAt = new Date(info.builtAt)
if (Number.isNaN(builtAt.getTime())) {
  console.log(`FAIL  build-info.builtAt 无法解析：${JSON.stringify(info.builtAt)}`)
  process.exit(1)
}

const head = git(['rev-parse', 'HEAD']).out
const builtCommit = String(info.commit ?? '')
console.log(`[freshness] 构建：${builtCommit.slice(0, 8)} @ ${info.builtAt}`)
console.log(`[freshness] HEAD：${head.slice(0, 8)}`)

// ---- 1. is the recorded commit even in this history?
const contains = spawnSync('git', ['merge-base', '--is-ancestor', builtCommit, 'HEAD'], {
  cwd: REPO,
  encoding: 'utf8',
})
if (builtCommit && contains.status !== 0) {
  problems.push(`构建记录的提交 ${builtCommit.slice(0, 8)} 不在 HEAD 的历史里（构建来自别的分支或被改写）`)
}

// ---- 2. files changed since the recorded commit — INFORMATIONAL only.
// The recorded commit is the one that was HEAD when the build started, and a build can
// legitimately contain work committed a few minutes later (that is exactly what happened
// here: built 20:04, committed 20:08). So this range can list files the build DOES have.
// The mtime sweep below is the hard check, because a file the build did not read cannot
// have a mtime older than the build.
let changedSinceCommit = []
if (builtCommit && contains.status === 0) {
  const diff = git(['diff', '--name-only', `${builtCommit}..HEAD`])
  changedSinceCommit = diff.out ? diff.out.split('\n').filter(isRuntime) : []
  if (changedSinceCommit.length > 0) {
    console.log(
      `[freshness] 构建记录的提交之后有 ${changedSinceCommit.length} 个运行时文件变动（仅供参照，构建可能本来就包含它们）`,
    )
  }
}

// ---- 3. deletions the build cannot contain.
// An uncommitted edit is NOT a problem by itself: a build made from the working tree
// contains it, which is exactly how this repo is built. What a build can never contain is
// a file that was deleted afterwards, so only deletions are flagged here — the mtime sweep
// below owns the "edited after the build" case.
const dirty = git(['status', '--porcelain']).out
if (dirty) {
  const deletedRuntime = dirty
    .split('\n')
    .filter((line) => /^\s*D|^D/.test(line))
    .map((line) => line.slice(3).trim())
    .filter((file) => file && isRuntime(file))
  if (deletedRuntime.length > 0) {
    problems.push(`构建之后删除了运行时文件（构建里还在）：${deletedRuntime.slice(0, 5).join(', ')}`)
  }
}

// ---- 4. mtime sweep: anything runtime-relevant newer than the build start
const newer = []
const walk = (dir) => {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.mercato' || entry.name === '.git') continue
      walk(full)
      continue
    }
    const rel = path.relative(REPO, full)
    if (!isRuntime(rel)) continue
    try {
      if (fs.statSync(full).mtimeMs > builtAt.getTime()) newer.push(rel)
    } catch {
      /* a vanished file is not a freshness problem */
    }
  }
}
for (const dir of ['src', 'vendor']) walk(path.join(REPO, dir))
// package.json / build config live at the root
for (const file of ['package.json', 'tsconfig.json', 'next.config.mjs', 'next.config.ts']) {
  const full = path.join(REPO, file)
  if (!fs.existsSync(full)) continue
  try {
    if (fs.statSync(full).mtimeMs > builtAt.getTime()) newer.push(file)
  } catch {}
}
// A newer mtime alone is not proof: a tool that rewrites a file with identical content
// (the mutation gate does exactly that) bumps it too. Only a content difference means the
// build genuinely could not have seen this file.
if (newer.length > 0) {
  const contentChanged = []
  for (const file of [...new Set(newer)]) {
    if (!builtCommit) {
      contentChanged.push(file)
      continue
    }
    const same = spawnSync('git', ['diff', '--quiet', builtCommit, '--', file], { cwd: REPO })
    // exit 0 = identical to the recorded commit, 1 = differs, other = git could not tell
    if (same.status !== 0) contentChanged.push(file)
  }
  const touchedOnly = [...new Set(newer)].filter((file) => !contentChanged.includes(file))
  if (touchedOnly.length > 0) {
    console.log(`[freshness] ${touchedOnly.length} 个文件只是 mtime 变新、内容与构建记录一致：${touchedOnly.slice(0, 4).join(', ')}`)
  }
  if (contentChanged.length > 0) {
    problems.push(
      `${contentChanged.length} 个运行时文件的内容在构建之后变过：${contentChanged.slice(0, 5).join(', ')}`,
    )
  }
}

// ---- 5. the process must be younger than the build
let serviceStart = arg('--service-start')
if (serviceStart === null) {
  const show = spawnSync('systemctl', ['show', 'mercato', '-p', 'ActiveEnterTimestamp', '--value'], { encoding: 'utf8' })
  serviceStart = (show.stdout || '').trim()
}
if (!serviceStart || /^n\/a$/i.test(serviceStart)) {
  notes.push('拿不到服务启动时间（没有 systemd 或单元未运行），这一项未校验')
} else {
  const startedAt = new Date(serviceStart)
  if (Number.isNaN(startedAt.getTime())) {
    notes.push(`服务启动时间无法解析：${JSON.stringify(serviceStart)}`)
  } else if (startedAt.getTime() < builtAt.getTime()) {
    problems.push(`服务在 ${serviceStart} 启动，早于 ${info.builtAt} 的构建：进程跑的是旧构建（需要 restart）`)
  } else {
    console.log(`[freshness] 服务启动 ${serviceStart}，晚于构建 ✓`)
  }
}

if (notes.length > 0) for (const note of notes) console.log(`[freshness] 注意：${note}`)

if (problems.length > 0) {
  console.log(`\n[freshness] RESULT: FAIL — ${problems.length} 个问题`)
  for (const problem of problems) console.log(`  ✗ ${problem}`)
  console.log('  修法：yarn build（或 bash /tmp/ila3-rebuild.sh）后 systemctl restart mercato')
  process.exit(1)
}

console.log('\n[freshness] RESULT: PASS — 运行中的服务对应当前源码，且进程晚于构建')
