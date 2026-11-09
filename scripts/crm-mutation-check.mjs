#!/usr/bin/env node
/**
 * Mutation gate: prove the rule-layer tests can actually fail.
 *
 * An independent review ran 14 mutations against `src/lib/leadgen` and 7 of them stayed
 * green, including deleting the approval's draft-hash binding and swapping
 * `Math.min` for `Math.max` in the quota headroom. Those assertions are fixed now, but
 * "the tests bite" was still a claim made by hand, once, in a chat message. This script
 * makes it repeatable: apply each mutation, run the owning test file, and fail the gate
 * if the suite stays green.
 *
 * Safety: every mutation is applied to the real file and restored from an in-memory copy
 * in a `finally`, then verified by SHA-256. A crash mid-run restores from the on-disk
 * backup written before the first mutation, and `process.on('exit')` restores too, so the
 * working tree is not left mutated.
 *
 * Usage: node scripts/crm-mutation-check.mjs [--verbose]
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const VERBOSE = process.argv.includes('--verbose')
const ROOT = process.cwd()
const BACKUP_DIR = path.join(ROOT, '.mercato', 'mutation-backup')

const LEADGEN_TESTS = 'src/lib/leadgen/__tests__'

/**
 * Each entry names the exact text to replace and the test file that must go red.
 * `why` is what the mutation removes — if the suite survives, that behaviour is
 * untested, which is the whole point of the gate.
 */
const MUTATIONS = [
  {
    id: 'approval-recipient-binding',
    file: 'src/lib/leadgen/outreach.ts',
    find: "} else if (expectedRecipient && approval.recipientHash !== expectedRecipient) {",
    replace: '} else if (false) {',
    test: `${LEADGEN_TESTS}/outreach.test.ts`,
    why: '审批绑定收件人',
  },
  {
    id: 'approval-body-binding',
    file: 'src/lib/leadgen/outreach.ts',
    find: "if (approval.draftHash !== draft.bodyHash) reasons.push('正文已变化：审批失效，必须重批')",
    replace: '// mutation: body binding removed',
    test: `${LEADGEN_TESTS}/outreach.test.ts`,
    why: '正文变化使审批失效',
  },
  {
    id: 'unsendable-draft-state',
    file: 'src/lib/leadgen/outreach.ts',
    find: "if (draft.state === 'ready') reasons.push('草稿未经批准（只是「就绪」），不能发送')",
    replace: '// mutation: ready drafts allowed',
    test: `${LEADGEN_TESTS}/outreach.test.ts`,
    why: 'ready 草稿不得发送',
  },
  {
    id: 'pipeline-verified-email-binding',
    file: 'src/lib/leadgen/pipeline.ts',
    find: "if (verifiedEmail && draftRecipient && verifiedEmail !== draftRecipient) {",
    replace: 'if (false) {',
    test: `${LEADGEN_TESTS}/pipeline.test.ts`,
    why: '草稿收件人必须等于已验证邮箱',
  },
  {
    id: 'pipeline-human-review-gate',
    file: 'src/lib/leadgen/pipeline.ts',
    find: "if (input.reviewDecision !== 'approve') {",
    replace: 'if (false) {',
    test: `${LEADGEN_TESTS}/pipeline.test.ts`,
    why: 'needs_review 必须人工批准',
  },
  {
    id: 'pipeline-reachability-short-circuit',
    file: 'src/lib/leadgen/pipeline.ts',
    find: "if (!reach.reachable) {",
    replace: 'if (false) {',
    test: `${LEADGEN_TESTS}/pipeline.test.ts`,
    why: '不可达收件人不得进入发送门',
  },
  {
    id: 'verification-email-evidence',
    file: 'src/lib/leadgen/verification.ts',
    find: "if (!emailEvidenced) reasons.push('邮箱不在证据里：可能是推断出来的，需人工确认')",
    replace: '// mutation: an unevidenced address no longer needs review',
    test: `${LEADGEN_TESTS}/verification.test.ts`,
    why: '邮箱必须出现在证据里（否则视为推断）',
  },
]

const sha = (text) => createHash('sha256').update(text).digest('hex')

/**
 * "The suite went red" must mean the suite RAN and failed.
 *
 * An earlier version treated any non-zero exit as a kill, so a missing `yarn`, a renamed
 * test file, a transform error or a timeout all counted as proof — seven mutations, seven
 * "killed", exit 0, with no test executed at all. An independent review constructed that
 * state by taking `yarn` off PATH. So: preflight the runner, then require the output to
 * look like a jest failure before calling it a kill.
 */
function runTest(testPath) {
  if (!fs.existsSync(path.join(ROOT, testPath))) {
    return { verdict: 'invalid', reason: `test file not found: ${testPath}` }
  }
  let out = ''
  try {
    out = execFileSync('yarn', ['test', '--silent', testPath], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 300_000,
      stdio: VERBOSE ? 'inherit' : 'pipe',
    })
    return { verdict: 'survived', reason: 'suite passed with the mutation applied' }
  } catch (error) {
    out = `${error.stdout ?? ''}${error.stderr ?? ''}`
    const message = String(error?.message ?? '')
    if (/ENOENT/.test(message) || /command not found/i.test(out)) {
      return { verdict: 'invalid', reason: 'the test runner is not available (ENOENT)' }
    }
    if (/Cannot find module|Transform failed|SyntaxError|TSError/i.test(out)) {
      return { verdict: 'invalid', reason: 'the mutation broke compilation, not a test assertion' }
    }
    if (/timed out|ETIMEDOUT/i.test(message)) {
      return { verdict: 'invalid', reason: 'the test run timed out' }
    }
    // Jest prints a "● " bullet per failing assertion and a Tests: summary.
    const looksLikeJestFailure = /●/.test(out) || /Tests:\s+\d+ failed/.test(out)
    if (!looksLikeJestFailure) {
      return { verdict: 'invalid', reason: `non-zero exit without a jest failure: ${out.trim().split('\n').slice(-1)[0]?.slice(0, 120)}` }
    }
    return { verdict: 'killed', reason: 'jest reported a failing assertion' }
  }
}

/** One runner at a time: two copies used to read each other's mutated source. */
function acquireLock() {
  const lockDir = path.join(ROOT, '.mercato', 'mutation.lock')
  fs.mkdirSync(path.dirname(lockDir), { recursive: true })
  try {
    fs.mkdirSync(lockDir)
  } catch {
    const stale = (() => {
      try {
        return Date.now() - fs.statSync(lockDir).mtimeMs > 15 * 60 * 1000
      } catch {
        return false
      }
    })()
    if (!stale) return false
    fs.rmSync(lockDir, { recursive: true, force: true })
    try {
      fs.mkdirSync(lockDir)
    } catch {
      return false
    }
  }
  return true
}

// file -> true; also used by the crash-recovery step above
const MUTATION_FILES = Object.fromEntries(MUTATIONS.map((m) => [m.file, true]))
const originals = new Map()
let mutationsApplied = 0

function restoreAll() {
  for (const [file, text] of originals) {
    const abs = path.join(ROOT, file)
    try {
      if (fs.existsSync(abs) && sha(fs.readFileSync(abs, 'utf8')) === sha(text)) continue
      fs.writeFileSync(abs, text)
    } catch {
      // A failure here is reported by the per-mutation hash check; never throw from exit.
    }
  }
  if (mutationsApplied > 0) process.stderr.write('[mutation] restored original sources\n')
}

process.on('exit', restoreAll)

if (!acquireLock()) {
  console.error('[mutation] RESULT: FAIL — 另一个变异门正在运行（.mercato/mutation.lock），拒绝并发执行')
  process.exit(1)
}
// A previous run killed mid-mutation (SIGKILL cannot be caught) leaves mutated source and a
// backup nobody reads. Restore first, and say so: silently deleting the backup, which is
// what this used to do, turns the next run into "INVALID anchor" against corrupted source.
if (fs.existsSync(BACKUP_DIR)) {
  const recovered = []
  for (const name of fs.readdirSync(BACKUP_DIR)) {
    const target = Object.keys(MUTATION_FILES).find((file) => path.basename(file) === name)
    if (!target) continue
    fs.writeFileSync(path.join(ROOT, target), fs.readFileSync(path.join(BACKUP_DIR, name)))
    recovered.push(target)
  }
  if (recovered.length > 0) {
    console.log(`[mutation] 检测到上次运行中断，已从备份恢复 ${recovered.length} 个文件：${recovered.join(', ')}`)
  }
  fs.rmSync(BACKUP_DIR, { recursive: true, force: true })
}
fs.mkdirSync(BACKUP_DIR, { recursive: true })

const results = []
let failed = 0

for (const mutation of MUTATIONS) {
  const abs = path.join(ROOT, mutation.file)
  if (!originals.has(mutation.file)) {
    const original = fs.readFileSync(abs, 'utf8')
    originals.set(mutation.file, original)
    fs.writeFileSync(path.join(BACKUP_DIR, path.basename(mutation.file)), original)
  }
  const original = originals.get(mutation.file)

  if (!original.includes(mutation.find)) {
    // An anchor that no longer matches means the gate is checking nothing.
    results.push({ ...mutation, status: 'invalid', detail: 'anchor text not found in the source' })
    console.log(`INVALID ${mutation.id} — 锚点已不存在，门在空转`)
    failed += 1
    continue
  }

  // Preserve the original mtime across the mutation: rewriting the file and restoring
  // identical content still bumps mtime, and the build-freshness gate reads mtime. Without
  // this the two gates fight each other and the freshness gate reports a stale build
  // after every mutation run.
  const mtimeBefore = fs.statSync(abs).mtime
  const mutated = original.replace(mutation.find, mutation.replace)
  fs.writeFileSync(abs, mutated)
  mutationsApplied += 1

  let outcome
  try {
    outcome = runTest(mutation.test)
  } finally {
    fs.writeFileSync(abs, original)
    try {
      fs.utimesSync(abs, mtimeBefore, mtimeBefore)
    } catch {
      /* mtime restoration is hygiene, not correctness */
    }
  }

  const restoredOkay = sha(fs.readFileSync(abs, 'utf8')) === sha(original)
  if (!restoredOkay) {
    results.push({ ...mutation, status: 'invalid', detail: 'source did not restore byte-for-byte' })
    console.log(`INVALID ${mutation.id} — 还原后内容不一致，已中止`)
    failed += 1
    break
  }

  if (outcome.verdict === 'killed') {
    results.push({ ...mutation, status: 'killed', detail: outcome.reason })
    console.log(`KILLED  ${mutation.id} — ${mutation.why} 被测试钉住`)
  } else if (outcome.verdict === 'survived') {
    results.push({ ...mutation, status: 'survived', detail: outcome.reason })
    console.log(`SURVIVED ${mutation.id} — ${mutation.why} **没有任何测试发现**`)
    failed += 1
  } else {
    results.push({ ...mutation, status: 'invalid', detail: outcome.reason })
    console.log(`INVALID ${mutation.id} — ${outcome.reason}`)
    failed += 1
  }
}

restoreAll()
fs.rmSync(BACKUP_DIR, { recursive: true, force: true })
fs.rmSync(path.join(ROOT, '.mercato', 'mutation.lock'), { recursive: true, force: true })

const killed = results.filter((r) => r.status === 'killed').length
const survived = results.filter((r) => r.status === 'survived').length
const invalid = results.filter((r) => r.status === 'invalid').length
console.log(
  `\n[mutation] killed ${killed} · survived ${survived} · invalid ${invalid} · total ${results.length}`,
)
if (survived > 0 || invalid > 0) {
  console.log('[mutation] RESULT: FAIL — 存活的变异说明那条行为没有测试保护')
  process.exit(1)
}
console.log('[mutation] RESULT: PASS — 每个变异都被至少一个测试抓到')
