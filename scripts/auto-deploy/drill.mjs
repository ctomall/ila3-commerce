/**
 * Failure-injection drills for the isolated deploy executor.
 *
 * Drill A: candidate health points at a wrong port -> executor refuses the
 *          switch, cleans the candidate, and leaves the running target healthy.
 * Drill B: the newly switched release is killed immediately after the symlink
 *          swap -> executor rolls back to the previous release and verifies it.
 *
 * Both drills run on non-production ports (3200 / 3100) and never touch 3000.
 */
import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {
  ACTIVE_FILE,
  CURRENT_LINK,
  DRILLS_DIR,
  LOGS_DIR,
  RELEASE_ROOT,
  STATE_DIR,
  atomicSymlink,
  ensureDirs,
  httpGet,
  killTree,
  makeRunId,
  nowIso,
  pidAlive,
  readJson,
  resolveSha,
  runStreaming,
  sleep,
  waitExit,
  writeJsonAtomic,
} from './lib.mjs'
import {buildRelease} from './release.mjs'
import {checkRelease, checkRunning} from './health.mjs'

const DEPLOY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'deploy.mjs')

async function stopRecordedActive() {
  const active = readJson(ACTIVE_FILE)
  if (!active?.pid) return {stopped: false}
  if (pidAlive(active.pid)) {
    killTree(active.pid, 'SIGTERM')
    if (!(await waitExit(active.pid, 10000))) killTree(active.pid, 'SIGKILL')
    await sleep(500)
  }
  try {
    fs.unlinkSync(ACTIVE_FILE)
  } catch {
    /* ignore */
  }
  return {stopped: true, pid: active.pid}
}

function runDeploy(args, logPath) {
  const result = spawnSync(process.execPath, [DEPLOY, ...args], {
    cwd: '/home/pro/apps/mercato',
    encoding: 'utf8',
    timeout: 900000,
    env: {...process.env},
  })
  const text = [
    `$ node scripts/auto-deploy/deploy.mjs ${args.join(' ')}`,
    `exit=${result.status} signal=${result.signal || ''}`,
    '--- stdout ---',
    result.stdout || '',
    '--- stderr ---',
    result.stderr || '',
  ].join('\n')
  fs.appendFileSync(logPath, `\n${text}\n`)
  return {status: result.status, signal: result.signal, stdout: result.stdout || '', stderr: result.stderr || '', text}
}

async function main() {
  ensureDirs()
  const sha = resolveSha(process.argv.includes('--sha') ? process.argv[process.argv.indexOf('--sha') + 1] : 'HEAD')
  const drillRunId = makeRunId(sha, 'drill')
  const logPath = path.join(LOGS_DIR, `${drillRunId}.log`)
  const summary = {
    schema: 1,
    drillRunId,
    sha,
    startedAt: nowIso(),
    finishedAt: null,
    targetPort: 3200,
    candidatePort: 3100,
    drills: {},
    cleanup: null,
    log: logPath,
  }

  const release = await buildRelease({sha})
  summary.releaseDir = release.dir

  const seedDir = path.join(RELEASE_ROOT, `seed-${drillRunId}`)
  if (fs.existsSync(seedDir)) fs.rmSync(seedDir, {recursive: true, force: true})
  const copy = await runStreaming({
    cmd: 'cp',
    args: ['-al', release.dir, seedDir],
    cwd: RELEASE_ROOT,
    timeoutMs: 180000,
    logPath,
    label: 'seed-copy',
    echo: true,
  })
  if (copy.status !== 0) throw new Error(`seed copy failed: ${copy.tail}`)

  await stopRecordedActive()
  const portProbe = await httpGet('http://127.0.0.1:3200/login', {timeoutMs: 2000})
  if (portProbe.ok) throw new Error('port 3200 already answers; refusing to run drills over an unknown server')

  atomicSymlink(seedDir, CURRENT_LINK)
  const seedHealth = await checkRelease({
    releaseDir: seedDir,
    port: 3200,
    sha,
    timeoutMs: 120000,
    keep: true,
    logPath: path.join(LOGS_DIR, `${drillRunId}-seed.log`),
  })
  if (!seedHealth.ok) {
    await stopRecordedActive()
    throw new Error(`seed target unhealthy: ${JSON.stringify(seedHealth.checks)}`)
  }
  writeJsonAtomic(ACTIVE_FILE, {
    pid: seedHealth.pid,
    port: 3200,
    releaseDir: seedDir,
    sha,
    startedAt: nowIso(),
    log: seedHealth.log,
    drillSeed: true,
  })
  summary.seed = {dir: seedDir, pid: seedHealth.pid, health: seedHealth.checks}

  // Drill A: wrong health-check port. Candidate starts on 3100, health probes 3198.
  const drillA = runDeploy(
    [
      '--drill',
      '--skip-ci-gate',
      '--pid-mode',
      '--target-port',
      '3200',
      '--candidate-port',
      '3100',
      '--candidate-check-port',
      '3198',
      '--timeout',
      '15000',
      '--sha',
      sha,
      '--manual',
      '--json',
    ],
    logPath,
  )
  const latestA = readJson(path.join(STATE_DIR, 'latest.json'))
  const currentAfterA = fs.readlinkSync(CURRENT_LINK)
  const targetAfterA = await checkRunning({port: 3200, releaseDir: seedDir, sha, timeoutMs: 15000})
  summary.drills.a = {
    exitCode: drillA.status,
    result: latestA?.result ?? null,
    errorCode: latestA?.error?.code ?? null,
    candidate: latestA?.candidate ?? null,
    currentAfter: currentAfterA,
    currentUnchanged: path.resolve(currentAfterA) === path.resolve(seedDir),
    targetHealthy: targetAfterA.ok,
    targetChecks: targetAfterA.checks,
    record: latestA ? path.join(STATE_DIR, 'runs', `${latestA.runId}.json`) : null,
  }

  // Drill B: switch to HEAD, then kill the new target before post-switch health.
  const drillB = runDeploy(
    [
      '--drill',
      '--skip-ci-gate',
      '--pid-mode',
      '--target-port',
      '3200',
      '--candidate-port',
      '3100',
      '--inject-post-switch-failure',
      '--timeout',
      '60000',
      '--sha',
      sha,
      '--manual',
      '--json',
    ],
    logPath,
  )
  const latestB = readJson(path.join(STATE_DIR, 'latest.json'))
  const currentAfterB = fs.readlinkSync(CURRENT_LINK)
  const targetAfterB = await checkRunning({port: 3200, releaseDir: seedDir, sha, timeoutMs: 15000})
  summary.drills.b = {
    exitCode: drillB.status,
    result: latestB?.result ?? null,
    errorCode: latestB?.error?.code ?? null,
    injectedFailure: latestB?.injectedFailure ?? null,
    rollback: latestB?.rollback ?? null,
    currentAfter: currentAfterB,
    rolledBackToSeed: path.resolve(currentAfterB) === path.resolve(seedDir),
    targetHealthy: targetAfterB.ok,
    targetChecks: targetAfterB.checks,
    record: latestB ? path.join(STATE_DIR, 'runs', `${latestB.runId}.json`) : null,
  }

  // Restore state: current -> real HEAD release, stop the drill server, drop seed.
  atomicSymlink(release.dir, CURRENT_LINK)
  const stopped = await stopRecordedActive()
  fs.rmSync(seedDir, {recursive: true, force: true})
  summary.cleanup = {current: release.dir, stopped, seedRemoved: !fs.existsSync(seedDir)}

  summary.passed =
    summary.drills.a.exitCode === 2 &&
    summary.drills.a.result === 'refused' &&
    summary.drills.a.errorCode === 'candidate-unhealthy' &&
    summary.drills.a.currentUnchanged &&
    summary.drills.a.targetHealthy &&
    summary.drills.b.exitCode === 2 &&
    summary.drills.b.result === 'rolled-back' &&
    summary.drills.b.rollback?.healthy === true &&
    summary.drills.b.rolledBackToSeed &&
    summary.drills.b.targetHealthy
  summary.finishedAt = nowIso()

  writeJsonAtomic(path.join(DRILLS_DIR, `${drillRunId}.json`), summary)
  writeJsonAtomic(path.join(DRILLS_DIR, 'latest.json'), summary)
  writeJsonAtomic(path.join('/home/pro/apps/mercato/.mercato/auto-deploy', 'drills.json'), summary)
  console.log(JSON.stringify(summary, null, 2))
  process.exit(summary.passed ? 0 : 3)
}

main().catch(async (error) => {
  console.error(`[drill] fatal: ${error?.stack || error}`)
  try {
    await stopRecordedActive()
  } catch {
    /* ignore */
  }
  process.exit(3)
})
