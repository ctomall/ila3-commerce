#!/usr/bin/env node
/**
 * P6 failure-recovery drill on the current deploy code, fully isolated.
 *
 * A release directory is hardlink-copied into an isolated release root, served
 * on spare ports, and the deploy executor is exercised in its own drill mode
 * with an isolated state dir and lock:
 *
 *   A. candidate health points at a wrong port -> the executor refuses the
 *      switch (exit 2, `candidate-unhealthy`), the running target stays healthy
 *      and `current` does not move.
 *   B. the freshly switched release is killed right after the symlink swap ->
 *      the executor rolls back to the previous release, verifies it and leaves
 *      `current` pointing at it again.
 *
 * The production release root, state dir, lock, symlink and service are never
 * touched; the drill only uses ILA3_RELEASE_ROOT / ILA3_STATE_DIR /
 * ILA3_LOCK_PATH overrides. The database is not touched. This verifies failure
 * recovery of the application upgrade path; it is not a data-restore drill.
 *
 * Usage: node scripts/p6-failure-drill.mjs [--out <file>]
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(__dirname, '..')
const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 || !process.argv[index + 1] ? fallback : process.argv[index + 1]
}
const STAMP = new Date().toISOString().replace(/[:.]/g, '')
const OUT = path.resolve(argOf('--out', path.join(repo, 'docs/deployment', `p6-failure-drill-${STAMP}.json`)))
const PROD_RELEASES = '/home/pro/releases/mercato'
const PROD_STATE = '/home/pro/.local/state/ila3-deploy'
const ISO_ROOT = path.join(PROD_RELEASES, `p6-failure-drill-${STAMP}`)
const ISO_STATE = `/home/pro/.local/state/p6-failure-drill-${STAMP}`
const TARGET_PORT = 3210
const CANDIDATE_PORT = 3110
const BAD_CHECK_PORT = 3118
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function prodCurrent() {
  try {
    return fs.readlinkSync(path.join(PROD_RELEASES, 'current'))
  } catch {
    return null
  }
}

async function waitHttp(url, deadlineMs) {
  const started = Date.now()
  for (;;) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3_000) })
      if (response.ok) return true
    } catch {
      // not yet
    }
    if (Date.now() - started > deadlineMs) return false
    await sleep(500)
  }
}

function runDeploy(args) {
  const env = {
    ...process.env,
    ILA3_RELEASE_ROOT: ISO_ROOT,
    ILA3_STATE_DIR: ISO_STATE,
    ILA3_LOCK_PATH: path.join(ISO_STATE, 'deploy.lock'),
  }
  try {
    const stdout = execFileSync(process.execPath, [path.join(repo, 'scripts/auto-deploy/deploy.mjs'), ...args], {
      cwd: repo,
      env,
      encoding: 'utf8',
      timeout: 300_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, stdout: stdout.slice(-4_000) }
  } catch (error) {
    return {
      status: typeof error.status === 'number' ? error.status : null,
      stdout: String(error.stdout ?? '').slice(-4_000),
      stderr: String(error.stderr ?? '').slice(-2_000),
    }
  }
}

function latestRun() {
  const file = path.join(ISO_STATE, 'latest.json')
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

async function main() {
  const evidence = { schema: 1, drill: 'p6-failure-drill', startedAt: new Date().toISOString(), checks: {} }
  const prodBefore = prodCurrent()
  let server = null
  try {
    const releaseDir = fs.realpathSync(path.join(PROD_RELEASES, 'current'))
    const sha = JSON.parse(fs.readFileSync(path.join(releaseDir, 'release.json'), 'utf8')).sha
    evidence.checks.source = { releaseDir, sha, prodCurrentBefore: prodBefore }
    fs.mkdirSync(ISO_STATE, { recursive: true })
    fs.mkdirSync(ISO_ROOT, { recursive: true })
    const seed = path.join(ISO_ROOT, 'seed')
    execFileSync('cp', ['-al', releaseDir, seed], { timeout: 300_000 })
    fs.symlinkSync(seed, path.join(ISO_ROOT, 'current'))
    fs.symlinkSync(seed, path.join(ISO_ROOT, 'previous'))

    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(TARGET_PORT)], {
      cwd: seed,
      env: { ...process.env, PORT: String(TARGET_PORT), OM_DIST_DIR: '.mercato/next', NODE_ENV: 'production' },
      stdio: 'ignore',
      detached: true,
    })
    const up = await waitHttp(`http://127.0.0.1:${TARGET_PORT}/start`, 120_000)
    evidence.checks.seed = { dir: seed, port: TARGET_PORT, healthy: up, pid: server.pid ?? null }
    if (!up) throw new Error('seed release did not start on the drill port')
    fs.writeFileSync(
      path.join(ISO_STATE, 'active.json'),
      `${JSON.stringify({ pid: server.pid, port: TARGET_PORT, releaseDir: seed, sha, startedAt: new Date().toISOString() }, null, 2)}\n`,
    )

    const baseArgs = [
      '--drill', '--skip-ci-gate', '--skip-migration-preflight', '--pid-mode',
      '--target-port', String(TARGET_PORT),
      '--candidate-port', String(CANDIDATE_PORT),
      '--sha', sha, '--release-dir', seed, '--manual', '--json',
    ]

    // A: wrong candidate health port -> refuse, target and current unchanged.
    const a = runDeploy([...baseArgs, '--candidate-check-port', String(BAD_CHECK_PORT), '--timeout', '15000'])
    const runA = latestRun()
    const currentAfterA = fs.readlinkSync(path.join(ISO_ROOT, 'current'))
    const targetHealthyA = await waitHttp(`http://127.0.0.1:${TARGET_PORT}/start`, 20_000)
    evidence.checks.drillA = {
      exitCode: a.status,
      result: runA?.result ?? null,
      errorCode: runA?.error?.code ?? null,
      currentUnchanged: path.resolve(currentAfterA) === path.resolve(seed),
      targetHealthy: targetHealthyA,
      runId: runA?.runId ?? null,
    }

    // B: kill the new target after the swap -> executor rolls back to seed.
    const b = runDeploy([...baseArgs, '--inject-post-switch-failure', '--timeout', '60000'])
    const runB = latestRun()
    const currentAfterB = fs.readlinkSync(path.join(ISO_ROOT, 'current'))
    const targetHealthyB = await waitHttp(`http://127.0.0.1:${TARGET_PORT}/start`, 30_000)
    evidence.checks.drillB = {
      exitCode: b.status,
      result: runB?.result ?? null,
      errorCode: runB?.error?.code ?? null,
      rollback: runB?.rollback ?? null,
      currentAfterB: path.resolve(currentAfterB),
      rolledBackToSeed: path.resolve(currentAfterB) === path.resolve(seed),
      targetHealthy: targetHealthyB,
      runId: runB?.runId ?? null,
    }

    evidence.checks.prodCurrentAfter = prodCurrent()
    evidence.checks.prodUntouched = evidence.checks.prodCurrentAfter === prodBefore

    const failures = []
    if (evidence.checks.drillA.exitCode !== 2) failures.push(`A exit ${evidence.checks.drillA.exitCode}`)
    if (evidence.checks.drillA.result !== 'refused') failures.push(`A result ${evidence.checks.drillA.result}`)
    if (evidence.checks.drillA.errorCode !== 'candidate-unhealthy') failures.push(`A code ${evidence.checks.drillA.errorCode}`)
    if (!evidence.checks.drillA.currentUnchanged) failures.push('A moved the current symlink')
    if (!evidence.checks.drillA.targetHealthy) failures.push('A left the target unhealthy')
    if (evidence.checks.drillB.exitCode !== 2) failures.push(`B exit ${evidence.checks.drillB.exitCode}`)
    if (evidence.checks.drillB.result !== 'rolled-back') failures.push(`B result ${evidence.checks.drillB.result}`)
    if (!evidence.checks.drillB.rollback?.healthy) failures.push('B rollback was not healthy')
    if (!evidence.checks.drillB.rolledBackToSeed) failures.push('B did not restore current to the previous release')
    if (!evidence.checks.drillB.targetHealthy) failures.push('B left the target unhealthy')
    if (!evidence.checks.prodUntouched) failures.push('production release symlink changed')
    evidence.failures = failures
  } catch (error) {
    evidence.failures = [String(error?.message ?? error)]
  } finally {
    if (server?.pid) {
      try {
        process.kill(-server.pid, 'SIGTERM')
      } catch {
        try {
          process.kill(server.pid, 'SIGTERM')
        } catch {
          /* ignore */
        }
      }
      await sleep(1_500)
      try {
        process.kill(-server.pid, 'SIGKILL')
      } catch {
        /* ignore */
      }
    }
    // Remove the isolated release root (hardlink copy + drill symlinks).
    try {
      fs.rmSync(ISO_ROOT, { recursive: true, force: true })
    } catch {
      evidence.checks.isoCleanup = 'failed'
    }
    evidence.finishedAt = new Date().toISOString()
    evidence.result = (evidence.failures ?? []).length === 0 ? 'passed' : 'failed'
    fs.mkdirSync(path.dirname(OUT), { recursive: true })
    fs.writeFileSync(OUT, `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(JSON.stringify({ result: evidence.result, failures: evidence.failures ?? [], evidence: OUT }))
  }
  if ((evidence.failures ?? []).length > 0) process.exitCode = 1
}

await main()
