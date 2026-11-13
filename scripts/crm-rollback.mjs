#!/usr/bin/env node
/**
 * Roll a release back to a release directory that is already on disk.
 *
 * The engine switch drill showed why this matters: clearing `OM_AI_ENGINE` sends the
 * chat entry back to the packaged path, which needs an OpenCode endpoint this
 * deployment does not run, so the "flag" rollback cannot serve traffic. A release
 * directory from an earlier deploy can: it has its own `.mercato/next` build and
 * `release.json`, so a rollback is a symlink swap plus a restart — no artifact
 * download, no rebuild.
 *
 * Default is a dry run: it only checks that the target is deployable. `--apply` stops
 * the auto-deploy timer, swaps `current`/`previous`, restarts the app, waits for
 * healthz and starts the timer again.
 *
 * Caveat the script prints instead of hiding: while `origin/main` is ahead of the
 * rolled-back release, the auto-deploy timer will ship the newer commit at its next
 * tick. Holding a rollback therefore means stopping the timer, which is a deliberate
 * operational decision, not something this script does silently.
 *
 * Usage:
 *   node scripts/crm-rollback.mjs                       # dry run, target = previous
 *   node scripts/crm-rollback.mjs --to 41d04fa --apply   # roll back and restart
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const RELEASES = '/home/pro/releases/mercato'
const SERVICE = process.env.ROLLBACK_SERVICE ?? 'ila3-auto-deploy-app.service'
const TIMER = process.env.ROLLBACK_TIMER ?? 'ila3-auto-deploy.timer'
const HEALTH = process.env.ROLLBACK_HEALTH ?? 'http://127.0.0.1:3000/api/healthz'
const APPLY = process.argv.includes('--apply')
const toIndex = process.argv.indexOf('--to')
const TARGET = toIndex === -1 ? 'previous' : process.argv[toIndex + 1]

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', timeout: 180_000 }).trim()
}

function resolveTarget() {
  const link = path.join(RELEASES, TARGET)
  if (TARGET === 'previous') {
    try {
      const resolved = fs.realpathSync(link)
      return { sha: path.basename(resolved), dir: resolved, via: 'previous symlink' }
    } catch {
      return null
    }
  }
  const matches = fs.readdirSync(RELEASES).filter((name) => name !== 'current' && name !== 'previous' && name.startsWith(TARGET))
  if (matches.length !== 1) return null
  const dir = path.join(RELEASES, matches[0])
  return { sha: matches[0], dir, via: 'sha prefix' }
}

const target = resolveTarget()
const currentDir = (() => {
  try {
    return fs.realpathSync(path.join(RELEASES, 'current'))
  } catch {
    return null
  }
})()

const problems = []
if (!target) problems.push(`target "${TARGET}" does not resolve to exactly one release directory`)
if (target && !fs.existsSync(path.join(target.dir, '.mercato/next/BUILD_ID'))) problems.push('target has no built .mercato/next')
if (target && !fs.existsSync(path.join(target.dir, 'release.json'))) problems.push('target has no release.json')
if (target) {
  try {
    const declared = JSON.parse(fs.readFileSync(path.join(target.dir, 'release.json'), 'utf8')).sha
    if (declared !== target.sha) problems.push(`release.json sha ${declared} does not match directory ${target.sha}`)
  } catch (error) {
    problems.push(`release.json unreadable: ${String(error?.message ?? error).slice(0, 120)}`)
  }
}
if (currentDir === target?.dir) problems.push('target is already the current release')

const plan = {
  at: new Date().toISOString(),
  apply: APPLY,
  target: target ? { sha: target.sha, dir: target.dir, via: target.via } : { requested: TARGET },
  current: currentDir ? path.basename(currentDir) : null,
  service: SERVICE,
  timer: TIMER,
  problems,
}
plan.ok = problems.length === 0

if (!plan.ok || !APPLY) {
  console.log(JSON.stringify({ ...plan, note: plan.ok ? 'dry run only; pass --apply to execute' : 'target is not deployable' }, null, 2))
  process.exit(plan.ok ? 0 : 1)
}

const steps = []
function step(name, fn) {
  try {
    fn()
    steps.push({ step: name, ok: true })
  } catch (error) {
    steps.push({ step: name, ok: false, error: String(error?.message ?? error).slice(0, 200) })
    throw error
  }
}

try {
  step('stop-timer', () => sh('sudo', ['-n', 'systemctl', 'stop', TIMER]))
  step('swap-symlinks', () => {
    const tmp = `${path.join(RELEASES, 'current')}.rollback-link`
    fs.rmSync(tmp, { force: true })
    fs.symlinkSync(target.dir, tmp)
    fs.renameSync(tmp, path.join(RELEASES, 'current'))
    fs.rmSync(path.join(RELEASES, 'previous'), { force: true })
    if (currentDir) fs.symlinkSync(currentDir, path.join(RELEASES, 'previous'))
  })
  step('restart-service', () => sh('sudo', ['-n', 'systemctl', 'restart', SERVICE]))
  let healthMs = null
  const startedAt = Date.now()
  while (Date.now() - startedAt < 120_000) {
    try {
      const res = execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '4', HEALTH], { encoding: 'utf8' }).trim()
      if (res === '200') {
        healthMs = Date.now() - startedAt
        break
      }
    } catch {
      // service still starting
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3_000)
  }
  steps.push({ step: 'healthz', ok: healthMs !== null, ms: healthMs })
  step('start-timer', () => sh('sudo', ['-n', 'systemctl', 'start', TIMER]))
  plan.steps = steps
  plan.healthMs = healthMs
  plan.ok = healthMs !== null && steps.every((entry) => entry.ok)

  const mainSha = (() => {
    try {
      return sh('git', ['-C', '/home/pro/apps/mercato', 'rev-parse', '--short', 'origin/main'])
    } catch {
      return null
    }
  })()
  if (mainSha && !target.sha.startsWith(mainSha)) {
    plan.note = `origin/main (${mainSha}) is ahead of the rolled-back release; the auto-deploy timer will ship it at the next tick unless the timer is stopped`
  }
} catch {
  plan.steps = steps
  plan.ok = false
}

const outDir = path.join('/home/pro/apps/mercato', 'docs/crm-platform/dsh-integration/evidence')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, `rollback-${plan.at.replace(/[:.]/g, '-')}.json`), `${JSON.stringify(plan, null, 1)}\n`)
console.log(JSON.stringify(plan, null, 2))
process.exit(plan.ok ? 0 : 1)
