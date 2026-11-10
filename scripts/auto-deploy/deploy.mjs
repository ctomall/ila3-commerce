/**
 * Isolated deploy executor.
 *
 * Both entry points use the same flock:
 *   node scripts/auto-deploy/deploy.mjs --auto     # timer
 *   node scripts/auto-deploy/deploy.mjs --manual   # operator
 *
 * Sequence: flock -> CI gate -> isolated release build -> candidate health on a
 * spare port -> atomic symlink switch -> post-switch health -> rollback on failure.
 * A dirty development worktree is recorded, never used as a build source.
 */
import fs from 'node:fs'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {ACTIVE_FILE, CURRENT_LINK, LOCK_PATH, LOGS_DIR, PREVIOUS_LINK, RELEASE_ROOT, STATE_DIR, atomicSymlink, enforceFlock, ensureDirs, makeRunId, nowIso, persistRun, pruneReleases, killTree, pidAlive, readJson, readLink, resolveSha, runStreaming, sleep, tailLines, waitExit, worktreeDirty, writeJsonAtomic, releaseInUse} from './lib.mjs'
import {runGate} from './ci-gate.mjs'
import {buildRelease, verifyRelease} from './release.mjs'
import {installFromArtifact} from './artifact.mjs'
import {checkRelease, checkRunning} from './health.mjs'
import {preflightMigrations} from './migration-preflight.mjs'
import {waitForDrain} from './worker-drain.mjs'
import {carryoverQueues} from './queue-carryover.mjs'

const DEFAULT_SERVICE = process.env.ILA3_DEPLOY_SERVICE || 'ila3-auto-deploy-app.service'
const PRODUCTION_PORT = 3000

/**
 * Where a release directory comes from:
 *  - explicit --from-artifact -> CI package
 *  - explicit --build-locally  -> local release.mjs build
 *  - drill / synthetic target   -> keep the pre-artifact behaviour
 *  - everything else            -> CI package (production default)
 */
export function shouldUseArtifactPath(args) {
  return Boolean(args.fromArtifact || (!args.buildLocally && !args.drill && !args.releaseDir))
}

function parseArgs(argv) {
  const args = {
    mode: 'manual',
    drill: false,
    skipCiGate: false,
    pidMode: false,
    targetPort: Number(process.env.ILA3_TARGET_PORT || 3000),
    candidatePort: Number(process.env.ILA3_CANDIDATE_PORT || 3100),
    candidateCheckPort: null,
    timeoutMs: Number(process.env.ILA3_HEALTH_TIMEOUT_MS || 120000),
    releaseDir: null,
    sha: null,
    injectPostSwitchFailure: false,
    fromArtifact: false,
    buildLocally: false,
    artifactFile: null,
    artifactUrl: null,
    artifactSha256: null,
    artifactRunId: null,
    artifactRepo: null,
    installDir: null,
    artifactTimeoutMs: Number(process.env.ILA3_ARTIFACT_TIMEOUT_MS || 900000),
    allowProduction: false,
    allowFirstDeploy: false,
    allowReplaceMercato: false,
    service: DEFAULT_SERVICE,
    json: false,
    force: false,
    skipMigrationPreflight: false,
    allowDestructiveMigrations: false,
    drainTimeoutMs: Number(process.env.ILA3_DRAIN_TIMEOUT_MS || 20000),
  }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = () => argv[++i]
    if (flag === '--auto') args.mode = 'auto'
    else if (flag === '--manual') args.mode = 'manual'
    else if (flag === '--drill') args.drill = true
    else if (flag === '--skip-ci-gate') args.skipCiGate = true
    else if (flag === '--pid-mode') args.pidMode = true
    else if (flag === '--target-port') args.targetPort = Number(value())
    else if (flag === '--candidate-port') args.candidatePort = Number(value())
    else if (flag === '--candidate-check-port') args.candidateCheckPort = Number(value())
    else if (flag === '--timeout') args.timeoutMs = Number(value())
    else if (flag === '--release-dir') args.releaseDir = value()
    else if (flag === '--sha') args.sha = value()
    else if (flag === '--inject-post-switch-failure') args.injectPostSwitchFailure = true
    else if (flag === '--from-artifact') args.fromArtifact = true
    else if (flag === '--build-locally') args.buildLocally = true
    else if (flag === '--artifact-file') args.artifactFile = value()
    else if (flag === '--artifact-url') args.artifactUrl = value()
    else if (flag === '--artifact-sha256') args.artifactSha256 = value()
    else if (flag === '--artifact-run-id') args.artifactRunId = value()
    else if (flag === '--artifact-repo') args.artifactRepo = value()
    else if (flag === '--install-dir') args.installDir = value()
    else if (flag === '--artifact-timeout') args.artifactTimeoutMs = Number(value())
    else if (flag === '--allow-production') args.allowProduction = true
    else if (flag === '--allow-first-deploy') args.allowFirstDeploy = true
    else if (flag === '--allow-replace-mercato') args.allowReplaceMercato = true
    else if (flag === '--service') args.service = value()
    else if (flag === '--skip-migration-preflight') args.skipMigrationPreflight = true
    else if (flag === '--allow-destructive-migrations') args.allowDestructiveMigrations = true
    else if (flag === '--drain-timeout-ms') args.drainTimeoutMs = Number(value())
    else if (flag === '--force') args.force = true
    else if (flag === '--json') args.json = true
    else if (flag === '--help' || flag === '-h') args.help = true
    else throw new Error(`unknown argument ${flag}`)
  }
  args.candidateCheckPort = args.candidateCheckPort ?? args.candidatePort
  return args
}

/**
 * Free the candidate port if a previous attempt left a server on it.
 *
 * `checkRelease` kills its own child, but the child it spawns is `yarn start`, and the
 * `next-server` grandchild can outlive it. On 2026-11-09 that left a next-server on 3100
 * after a refusal, and the *next* run's candidate check failed for a reason that had
 * nothing to do with the release under test. A refusal must leave the machine as it found
 * it, so the port is checked and cleared on every exit path.
 */
function freePortIfOccupied(port, echo = false) {
  const out = spawnSync('ss', ['-ltnp'], {encoding: 'utf8'})
  const line = (out.stdout || '').split('\n').find((l) => l.includes(`:${port} `))
  if (!line) return {freed: false, pid: null}
  const match = line.match(/pid=(\d+)/)
  if (!match) return {freed: false, pid: null}
  const pid = Number(match[1])
  try {
    killTree(pid, 'SIGTERM')
  } catch {
    return {freed: false, pid}
  }
  if (echo) console.log(`[deploy] freed candidate port ${port} from pid ${pid}`)
  return {freed: true, pid}
}

function refusal(code, detail) {
  return Object.assign(new Error(code), {code, detail})
}

async function systemctl(args, {echo = false, timeoutMs = 120000} = {}) {
  // `sudo -n` because the executor runs as `pro` and the release-slot unit is a system
  // unit. Without it the first cutover switched the symlink, failed to restart the app
  // ("Access denied ... requires interactive authentication"), then failed to roll back
  // for the same reason — and production was down until it was started by hand.
  return runStreaming({
    cmd: 'sudo',
    args: ['-n', 'systemctl', ...args],
    cwd: '/',
    timeoutMs,
    echo,
    label: `systemctl-${args[0]}`,
    logPath: null,
  })
}

function resolveOldRelease(link) {
  const raw = readLink(link)
  if (!raw) return null
  const target = path.isAbsolute(raw) ? raw : path.resolve(RELEASE_ROOT, raw)
  if (!fs.existsSync(target)) return {target, missing: true}
  const manifest = readJson(path.join(target, 'release.json'))
  const stamp = readJson(path.join(target, '.mercato', 'build-info.json'))
  return {
    target,
    missing: false,
    sha: manifest?.sha || stamp?.commit || null,
    source: manifest?.source?.method || 'unknown',
  }
}

/**
 * Retention: keep only the releases `current` and `previous` point at.
 *
 * Each release is a full ~4.2G copy, so leaving the timer unbounded is what put
 * the root volume at 96% (8 releases in 5 hours, only one of them live).
 */
function pruneOrphans() {
  try {
    const pruned = pruneReleases()
    return {
      removed: pruned.removed.map((entry) => entry.name),
      freedBytes: pruned.freedBytes,
      kept: pruned.skipped.map((entry) => entry.name),
      skippedInUse: pruned.skipped.filter((entry) => entry.reason !== 'current-or-previous'),
    }
  } catch (error) {
    return {error: String(error?.message || error)}
  }
}

async function startActive({releaseDir, port, sha, timeoutMs, logPath}) {
  const result = await checkRelease({releaseDir, port, sha, timeoutMs, keep: true, logPath})
  if (!result.ok) {
    if (result.pid) {
      try {
        process.kill(-result.pid, 'SIGTERM')
      } catch {
        /* ignore */
      }
    }
    throw refusal('post-switch-unhealthy', result)
  }
  writeJsonAtomic(ACTIVE_FILE, {
    pid: result.pid,
    port,
    releaseDir,
    sha,
    startedAt: nowIso(),
    log: result.log,
    checks: result.checks,
  })
  return result
}

async function stopActive() {
  const active = readJson(ACTIVE_FILE)
  if (!active?.pid) {
    try {
      fs.unlinkSync(ACTIVE_FILE)
    } catch {
      /* no active record */
    }
    return {stopped: false, reason: 'no active record'}
  }
  if (pidAlive(active.pid)) {
    try {
      process.kill(-active.pid, 'SIGTERM')
    } catch {
      try {
        process.kill(active.pid, 'SIGTERM')
      } catch {
        /* ignore */
      }
    }
    if (!(await waitExit(active.pid, 10000))) {
      try {
        process.kill(-active.pid, 'SIGKILL')
      } catch {
        try {
          process.kill(active.pid, 'SIGKILL')
        } catch {
          /* ignore */
        }
      }
      await waitExit(active.pid, 3000)
    }
  }
  try {
    fs.unlinkSync(ACTIVE_FILE)
  } catch {
    /* ignore */
  }
  return {stopped: true, pid: active.pid, port: active.port, releaseDir: active.releaseDir}
}

async function main() {
  const rawArgs = process.argv.slice(2)
  const autoEntry = rawArgs.includes('--auto')
  process.env.ILA3_DEPLOY_ENTRY = autoEntry ? 'auto' : 'manual'
  enforceFlock(fileURLToPath(import.meta.url), rawArgs)

  ensureDirs()
  const args = parseArgs(rawArgs)
  if (args.help) {
    console.log(
      'usage: node scripts/auto-deploy/deploy.mjs (--auto|--manual) [--sha SHA] [--from-artifact|--build-locally] [--artifact-run-id N] [--drill --pid-mode --target-port 3200 ...]',
    )
    process.exit(0)
  }

  if (args.targetPort === args.candidatePort) throw new Error('--target-port and --candidate-port must differ')
  if (args.drill) {
    if (!args.pidMode) throw new Error('--drill requires --pid-mode')
    if (args.targetPort === PRODUCTION_PORT) throw new Error('drills must not target production port 3000')
  }
  if (args.skipCiGate && !args.drill) throw new Error('--skip-ci-gate is only allowed with --drill')
  if (args.skipMigrationPreflight && !args.drill) throw new Error('--skip-migration-preflight is only allowed with --drill')
  if (args.allowDestructiveMigrations && !args.drill) throw new Error('--allow-destructive-migrations is only allowed with --drill')
  if (!Number.isFinite(args.drainTimeoutMs) || args.drainTimeoutMs < 0) throw new Error('--drain-timeout-ms must be a non-negative number')
  if (args.fromArtifact && args.buildLocally) throw new Error('--from-artifact and --build-locally are mutually exclusive')
  if (args.artifactFile && args.artifactUrl) throw new Error('--artifact-file and --artifact-url are mutually exclusive')
  for (const flag of ['artifactFile', 'artifactUrl', 'installDir', 'artifactRepo']) {
    if (args[flag] && !args.drill) throw new Error(`--${flag.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} is only allowed with --drill`)
  }
  if (args.artifactSha256 && !/^[a-f0-9]{64}$/.test(args.artifactSha256)) throw new Error('--artifact-sha256 must be 64 lowercase hex')
  if (args.artifactRunId && !/^\d+$/.test(String(args.artifactRunId))) throw new Error('--artifact-run-id must be numeric')
  if ((args.artifactFile || args.artifactUrl) && (!args.artifactSha256 || !args.artifactRunId)) {
    throw new Error('drill artifact sources require --artifact-sha256 and --artifact-run-id')
  }
  // Default path: production pulls the CI package. Local builds are an explicit
  // fallback (`--build-locally`), and drills keep their previous behaviour unless
  // they ask for the artifact path.
  args.useArtifact = shouldUseArtifactPath(args)
  if (args.injectPostSwitchFailure && !args.drill) throw new Error('--inject-post-switch-failure is only allowed with --drill')
  if (args.releaseDir && !args.drill) throw new Error('--release-dir is only allowed with --drill')

  const isProduction = args.targetPort === PRODUCTION_PORT || !args.pidMode
  const record = {
    schema: 1,
    runId: null,
    entry: args.mode,
    drill: args.drill,
    production: isProduction,
    startedAt: nowIso(),
    finishedAt: null,
    result: 'running',
    sha: null,
    targetPort: args.targetPort,
    candidatePort: args.candidatePort,
    candidateCheckPort: args.candidateCheckPort,
    worktreeDirty: null,
    lock: {path: LOCK_PATH, pid: process.pid, acquiredAt: nowIso()},
    steps: [],
    evidence: {},
  }

  const step = async (name, fn) => {
    const startedAt = nowIso()
    try {
      const value = await fn()
      record.steps.push({name, ok: true, startedAt, finishedAt: nowIso()})
      return value
    } catch (error) {
      record.steps.push({name, ok: false, startedAt, finishedAt: nowIso(), detail: error?.message || String(error)})
      throw error
    }
  }

  let oldRelease = null
  let release = null
  let switched = false
  let gateResult = null

  const rollback = async (reason) => {
    if (!switched || !oldRelease || oldRelease.missing) {
      record.rollback = {attempted: false, reason: reason || 'nothing switched'}
      return false
    }
    const startedAt = nowIso()
    try {
      atomicSymlink(oldRelease.target, CURRENT_LINK)
      await stopActive()
      let health
      if (args.pidMode) {
        health = await startActive({
          releaseDir: oldRelease.target,
          port: args.targetPort,
          sha: oldRelease.sha,
          timeoutMs: args.timeoutMs,
          logPath: path.join(LOGS_DIR, `${record.runId}-rollback-target.log`),
        })
      } else {
        const restarted = await systemctl(['restart', args.service], {echo: true})
        const ok = restarted.status === 0
        health = ok
          ? await checkRunning({port: args.targetPort, releaseDir: oldRelease.target, sha: oldRelease.sha, timeoutMs: 60000})
          : {ok: false, checks: [{name: 'systemctl-restart', ok: false, detail: `exit=${restarted.status}`}]}
      }
      record.rollback = {
        attempted: true,
        at: startedAt,
        to: oldRelease.target,
        sha: oldRelease.sha,
        healthy: Boolean(health?.ok),
        checks: health?.checks ?? [],
      }
      return Boolean(health?.ok)
    } catch (error) {
      record.rollback = {
        attempted: true,
        at: startedAt,
        to: oldRelease.target,
        sha: oldRelease.sha,
        healthy: false,
        error: String(error?.message || error),
        detail: error?.detail ?? null,
      }
      return false
    }
  }

  try {
    const sha = await step('resolve-sha', async () => resolveSha(args.sha || 'HEAD'))
    record.sha = sha
    record.shortSha = sha.slice(0, 8)
    record.runId = makeRunId(sha, args.drill ? 'drill-deploy' : 'deploy')
    record.worktreeDirty = await step('worktree-audit', async () => worktreeDirty())
    record.evidence.record = path.join(STATE_DIR, 'runs', `${record.runId}.json`)

    if (args.skipCiGate) {
      record.ciGate = {decision: 'skipped', reason: 'drill-only --skip-ci-gate', allow: false}
      record.steps.push({name: 'ci-gate', ok: true, startedAt: nowIso(), finishedAt: nowIso(), detail: 'skipped for drill'})
    } else {
      gateResult = await step('ci-gate', async () => runGate({sha}))
      record.ciGate = {
        allow: Boolean(gateResult.allow),
        decision: gateResult.decision,
        reason: gateResult.reason,
        repo: gateResult.repo ?? null,
        runId: gateResult.matchedRun?.id ?? null,
        runPath: gateResult.matchedRun?.path ?? null,
        runUrl: gateResult.matchedRun?.url ?? null,
        evidence: path.join(STATE_DIR, 'gates', `${sha}.json`),
      }
      record.evidence.ciGate = record.ciGate.evidence
      if (!gateResult.allow) throw refusal('ci-gate-denied', gateResult)
    }

    release = await step('release', async () => {
      if (args.releaseDir) {
        const dir = path.resolve(args.releaseDir)
        const manifest = readJson(path.join(dir, 'release.json'))
        return {reused: true, dir, manifest, synthetic: true}
      }
      if (args.useArtifact) {
        const runId = args.artifactRunId ?? gateResult?.matchedRun?.id ?? null
        if (!runId) {
          throw refusal(
            'artifact-run-missing',
            'no successful CI workflow run id available for this SHA; pass --artifact-run-id or use --build-locally',
          )
        }
        const source = args.artifactFile
          ? {kind: 'file', file: args.artifactFile, sha256: args.artifactSha256, runId}
          : args.artifactUrl
            ? {kind: 'url', url: args.artifactUrl, sha256: args.artifactSha256, runId}
            : {kind: 'github'}
        return installFromArtifact({
          sha,
          runId,
          repo: args.artifactRepo ?? gateResult?.repo ?? null,
          source,
          installDir: args.installDir,
          force: args.force,
          downloadTimeoutMs: args.artifactTimeoutMs,
          logPath: path.join(LOGS_DIR, `${record.runId}-artifact.log`),
        })
      }
      return buildRelease({sha, force: args.force})
    })
    record.release = {
      dir: release.dir,
      reused: release.reused,
      synthetic: Boolean(release.synthetic),
      installer: args.useArtifact ? 'ci-artifact' : args.releaseDir ? 'synthetic' : 'local-build',
      source: release.manifest?.source?.method ?? null,
      manifest: path.join(release.dir, 'release.json'),
      sha: release.manifest?.sha ?? sha,
      log: release.log ?? null,
    }
    record.evidence.releaseManifest = record.release.manifest

    if (!release.dir || !fs.existsSync(release.dir)) throw refusal('release-missing', release.dir)
    const verified = verifyRelease(release.dir, sha)
    if (!verified.ok) throw refusal('release-invalid', verified.reason)

    oldRelease = resolveOldRelease(CURRENT_LINK)
    record.previous = oldRelease

    // A sha that is already serving must not be redeployed. The timer fires every
    // 15 minutes; before this guard, every tick switched the symlink and ran
    // `systemctl restart`, so production restarted on each tick even with no new
    // commit (six restarts 13:34-14:52 on 2026-11-09). The live process is the
    // authority: the running app must report this release and this sha.
    if (
      oldRelease &&
      !oldRelease.missing &&
      oldRelease.sha === sha &&
      !args.drill &&
      !args.force
    ) {
      const live = await step('live-release-health', async () =>
        checkRunning({
          port: args.targetPort,
          releaseDir: release.dir,
          sha,
          timeoutMs: 30000,
        }),
      )
      // A pid whose cwd is inside the release proves the release is what the host
      // is actually running; /proc may be unreadable elsewhere, so record it but
      // do not make the guard depend on it.
      const livePid = releaseInUse(release.dir)
      record.liveHealth = {ok: live.ok, pid: livePid, checks: live.checks, port: args.targetPort}
      if (live.ok) {
        record.result = 'already-current'
        record.prune = pruneOrphans()
        return
      }
    }

    // Gate 1 — migration preflight: refuse a cutover whose NEW migrations are not
    // expand-safe. Compared against the release currently serving, so a long-lived
    // destructive migration is not re-judged on every deploy.
    if (!args.skipMigrationPreflight) {
      const preflight = await step('migration-preflight', async () =>
        preflightMigrations({
          releaseDir: release.dir,
          baselineDir: oldRelease && !oldRelease.missing ? oldRelease.target : null,
          allowDestructive: args.allowDestructiveMigrations,
        }),
      )
      record.migrationPreflight = preflight
      if (!preflight.ok) throw refusal('migration-preflight-failed', preflight)
    }

    // Gate 2 — worker drain: wait for the RUNNING release's local queues to have
    // no ready job before switching. Data lives under the old release's
    // .mercato/queue (QUEUE_BASE_DIR is cwd-relative in production), so draining
    // the new directory would always look empty. Leftovers are recorded, never
    // silently dropped.
    const drainDir = oldRelease && !oldRelease.missing ? oldRelease.target : null
    if (drainDir && fs.existsSync(drainDir)) {
      const drain = await step('worker-drain', async () =>
        waitForDrain({appDir: drainDir, timeoutMs: args.drainTimeoutMs}),
      )
      record.workerDrain = drain
    } else {
      record.workerDrain = {drained: true, reason: 'no previous release to drain'}
    }

    const candidateLog = path.join(LOGS_DIR, `${record.runId}-candidate.log`)
    const candidate = await step('candidate-health', async () =>
      checkRelease({
        releaseDir: release.dir,
        port: args.candidatePort,
        checkPort: args.candidateCheckPort,
        sha,
        timeoutMs: args.timeoutMs,
        keep: false,
        logPath: candidateLog,
      }),
    )
    record.candidate = {
      ok: candidate.ok,
      port: candidate.port,
      checkPort: candidate.checkPort,
      pid: candidate.pid,
      checks: candidate.checks,
      log: candidate.log,
      cleanedUp: Boolean(candidate.cleanedUp),
    }
    record.evidence.candidateLog = candidate.log
    if (!candidate.ok) throw refusal('candidate-unhealthy', candidate)

    if (!oldRelease || oldRelease.missing) {
      if (!args.allowFirstDeploy) throw refusal('no-current-release', oldRelease)
    }

    if (isProduction && !args.drill) {
      if (!(args.allowProduction && process.env.ILA3_ALLOW_PRODUCTION === '1')) {
        throw refusal(
          'production-switch-disabled',
          'production cutover requires --allow-production and ILA3_ALLOW_PRODUCTION=1; the auto-deploy gate has not been enabled',
        )
      }
      if (!args.pidMode) {
        const cat = await systemctl(['cat', args.service])
        if (cat.status !== 0) throw refusal('service-not-installed', args.service)
        const mercatoActive = await systemctl(['is-active', 'mercato.service'])
        if (mercatoActive.status === 0 && !args.allowReplaceMercato) {
          throw refusal(
            'production-slot-occupied',
            'mercato.service still owns port 3000; refusing to start a second production slot',
          )
        }
        if (args.allowReplaceMercato) {
          await systemctl(['stop', 'mercato.service'], {echo: true})
        }
      }
    }

    await step('switch', async () => {
      // Redeploying an already-live sha must not overwrite `previous` with that same
      // release, or the rollback target silently becomes the thing we just deployed.
      if (oldRelease && !oldRelease.missing && path.resolve(oldRelease.target) !== path.resolve(release.dir)) {
        atomicSymlink(oldRelease.target, PREVIOUS_LINK)
      }
      atomicSymlink(release.dir, CURRENT_LINK)
      switched = true

      await stopActive()
      if (args.pidMode) {
        await startActive({
          releaseDir: release.dir,
          port: args.targetPort,
          sha,
          timeoutMs: args.timeoutMs,
          logPath: path.join(LOGS_DIR, `${record.runId}-target.log`),
        })
      } else {
        const restarted = await systemctl(['restart', args.service], {echo: true})
        if (restarted.status !== 0) {
          throw refusal('service-restart-failed', `systemctl restart ${args.service} exit=${restarted.status}`)
        }
      }

      if (args.injectPostSwitchFailure) {
        record.injectedFailure = 'killed newly started target before post-switch health'
        await stopActive()
      }

      const post = await checkRunning({
        port: args.targetPort,
        releaseDir: release.dir,
        sha,
        timeoutMs: 60000,
      })
      record.postSwitch = {ok: post.ok, checks: post.checks, waitedMs: post.waitedMs}
      if (!post.ok) throw refusal('post-switch-unhealthy', post)
    })

    // Gate 2b — carryover: the new release starts with an empty queue directory
    // (QUEUE_BASE_DIR is cwd-relative), so jobs drained-but-unfinished in the old
    // release are moved now that the new one is healthy. Errors are recorded, not
    // thrown: a rollback is worse than stranded jobs that stay auditable in the
    // old release's sidecar.
    if (oldRelease && !oldRelease.missing && path.resolve(oldRelease.target) !== path.resolve(release.dir)) {
      const carry = await step('queue-carryover', async () =>
        carryoverQueues({
          fromAppDir: oldRelease.target,
          toAppDir: release.dir,
          runId: record.runId,
        }),
      )
      record.queueCarryover = carry
    }

    record.result = 'deployed'
    record.prune = pruneOrphans()
  } catch (error) {
    record.error = {code: error?.code || 'failed', message: error?.message || String(error), detail: error?.detail ?? null}

    if (switched) {
      const recovered = await rollback(record.error.code)
      record.result = recovered ? 'rolled-back' : 'rollback-failed'
    } else {
      // Artifact failures are refusals: they are detected before the symlink
      // switch, and the old release is left running untouched.
      const refusalCodes = new Set([
        'ci-gate-denied',
        'migration-preflight-failed',
        'candidate-unhealthy',
        'no-current-release',
        'production-switch-disabled',
        'production-slot-occupied',
        'service-not-installed',
        'release-missing',
        'release-invalid',
        'artifact-run-missing',
        'artifact-run-not-found',
        'artifact-run-sha-mismatch',
        'artifact-run-not-successful',
        'artifact-run-wrong-workflow',
        'artifact-not-found',
        'artifact-expired',
        'artifact-digest-missing',
        'artifact-digest-mismatch',
        'artifact-size-mismatch',
        'artifact-download-failed',
        'artifact-token-missing',
        'artifact-github-error',
        'artifact-repository-invalid',
        'artifact-sha-invalid',
        'artifact-source-invalid',
        'artifact-zip-invalid',
        'artifact-zip-incomplete',
        'artifact-zip-empty',
        'artifact-unsafe-path',
        'artifact-symlink-escape',
        'artifact-hardlink-rejected',
        'artifact-unsupported-file-type',
        'artifact-manifest-invalid',
        'artifact-manifest-mismatch',
        'artifact-content-digest-mismatch',
        'artifact-file-hash-mismatch',
        'artifact-type-mismatch',
        'artifact-symlink-target-mismatch',
        'artifact-missing-file',
        'artifact-extra-file',
        'artifact-build-stamp-mismatch',
        'artifact-install-failed',
        'artifact-install-incomplete',
        'artifact-release-invalid',
        'artifact-target-in-use',
        'insufficient-disk',
        'artifact-empty-package',
        'artifact-package-failed',
        'artifact-source-missing',
        'artifact-scan-failed',
        'artifact-extract-failed',
        'artifact-extract-timeout',
        'artifact-too-many-files',
      ])
      record.result = refusalCodes.has(record.error.code) ? 'refused' : 'failed'
      if (oldRelease && !oldRelease.missing && args.pidMode) {
        const target = await checkRunning({
          port: args.targetPort,
          releaseDir: oldRelease.target,
          sha: oldRelease.sha,
          timeoutMs: 10000,
        })
        record.targetUnchanged = {healthy: target.ok, checks: target.checks}
      }
      // A refused or failed build leaves an unreferenced release copy behind; reclaim
      // it here or repeated failures fill the volume even though no deploy succeeds.
      record.prune = pruneOrphans()
    }
  } finally {
    // A refusal must not leave a candidate server behind (see freePortIfOccupied).
    if (!switched) {
      const freed = freePortIfOccupied(args.candidatePort)
      if (freed.pid) record.candidatePortCleanup = freed
    }
    record.finishedAt = nowIso()
    if (!record.runId) record.runId = makeRunId(record.sha || 'unknown', 'deploy')
    const file = persistRun(record)
    record.evidence.record = file

    const summary = {
      runId: record.runId,
      result: record.result,
      sha: record.sha,
      entry: record.entry,
      drill: record.drill,
      production: record.production,
      targetPort: record.targetPort,
      candidatePort: record.candidatePort,
      worktreeDirty: record.worktreeDirty,
      ciGate: record.ciGate ?? null,
      release: record.release ?? null,
      installer: record.release?.installer ?? null,
      candidate: record.candidate ?? null,
      liveHealth: record.liveHealth ?? null,
      postSwitch: record.postSwitch ?? null,
      migrationPreflight: record.migrationPreflight ?? null,
      workerDrain: record.workerDrain ?? null,
      queueCarryover: record.queueCarryover ?? null,
      rollback: record.rollback ?? null,
      targetUnchanged: record.targetUnchanged ?? null,
      prune: record.prune ?? null,
      error: record.error ?? null,
      record: file,
    }
    if (args.json) console.log(JSON.stringify(summary, null, 2))
    else {
      console.log(`[deploy] runId=${record.runId}`)
      console.log(`[deploy] result=${record.result} sha=${record.sha} entry=${record.entry} drill=${record.drill}`)
      console.log(`[deploy] record=${file}`)
      if (record.error) console.log(`[deploy] error=${record.error.code}: ${record.error.message}`)
      if (record.rollback) console.log(`[deploy] rollback healthy=${record.rollback.healthy} to=${record.rollback.to}`)
      if (record.prune?.removed?.length) {
        const mib = Math.round((record.prune.freedBytes || 0) / 1024 / 1024)
        console.log(`[deploy] pruned=${record.prune.removed.length} freed=${mib}MiB`)
      }
    }

    const exitCode =
      record.result === 'deployed' || record.result === 'already-current'
        ? 0
        : record.result === 'refused' || record.result === 'rolled-back'
          ? 2
          : 3
    process.exit(exitCode)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`[deploy] fatal: ${error?.stack || error}`)
    process.exit(3)
  })
}
