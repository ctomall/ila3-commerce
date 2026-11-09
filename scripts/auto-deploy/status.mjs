/**
 * Read-only status for the isolated deploy stack.
 * Safe to run at any time; never mutates a release or a unit.
 */
import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {
  ACTIVE_FILE,
  CHECKER_STATE_DIR,
  CURRENT_LINK,
  DRILLS_DIR,
  STATE_DIR,
  ensureDirs,
  httpGet,
  readJson,
  readLink,
} from './lib.mjs'

function systemctl(args) {
  const result = spawnSync('systemctl', args, {encoding: 'utf8', timeout: 15000})
  return {status: result.status, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim()}
}

async function main() {
  ensureDirs()
  const currentRaw = readLink(CURRENT_LINK)
  const current = currentRaw ? (path.isAbsolute(currentRaw) ? currentRaw : path.resolve(path.dirname(CURRENT_LINK), currentRaw)) : null
  const manifest = current ? readJson(path.join(current, 'release.json')) : null
  const active = readJson(ACTIVE_FILE)
  const latestRun = readJson(path.join(STATE_DIR, 'latest.json'))
  const gate = readJson(path.join(STATE_DIR, 'gates', 'latest.json'))
  const drills = readJson(path.join(DRILLS_DIR, 'latest.json'))
  const checker = readJson(path.join(CHECKER_STATE_DIR, 'status.json'))
  const timerEnabled = systemctl(['is-enabled', 'ila3-auto-deploy.timer'])
  const timerActive = systemctl(['is-active', 'ila3-auto-deploy.timer'])
  const checkTimerEnabled = systemctl(['is-enabled', 'ila3-auto-deploy-check.timer'])
  const checkTimerActive = systemctl(['is-active', 'ila3-auto-deploy-check.timer'])

  const production = {
    login: await httpGet('http://127.0.0.1:3000/login', {timeoutMs: 5000}),
    backend: await httpGet('http://127.0.0.1:3000/backend', {timeoutMs: 5000}),
  }

  const status = {
    checkedAt: new Date().toISOString(),
    mode: {
      isolatedExecutor: 'installed-scripts-only',
      autoDeployTimer: timerEnabled.stdout || 'not-installed',
      autoDeployTimerActive: timerActive.stdout || 'unknown',
      readOnlyCheckerTimer: checkTimerEnabled.stdout || 'not-installed',
      readOnlyCheckerTimerActive: checkTimerActive.stdout || 'unknown',
      note: 'The read-only checker timer is NOT the auto-deploy executor.',
    },
    current,
    currentManifest: manifest
      ? {sha: manifest.sha, status: manifest.status, createdAt: manifest.createdAt, artifactHuman: manifest.artifact?.totalHuman}
      : null,
    activeProcess: active ?? null,
    latestRun: latestRun
      ? {
          runId: latestRun.runId,
          result: latestRun.result,
          sha: latestRun.sha,
          startedAt: latestRun.startedAt,
          finishedAt: latestRun.finishedAt,
          error: latestRun.error ?? null,
          rollback: latestRun.rollback ?? null,
          record: path.join(STATE_DIR, 'runs', `${latestRun.runId}.json`),
        }
      : null,
    ciGate: gate
      ? {sha: gate.sha, decision: gate.decision, reason: gate.reason, checkedAt: gate.checkedAt}
      : null,
    drills: drills
      ? {
          drillRunId: drills.drillRunId,
          passed: drills.passed,
          a: drills.drills?.a ? {result: drills.drills.a.result, targetHealthy: drills.drills.a.targetHealthy, currentUnchanged: drills.drills.a.currentUnchanged} : null,
          b: drills.drills?.b
            ? {result: drills.drills.b.result, rolledBackToSeed: drills.drills.b.rolledBackToSeed, targetHealthy: drills.drills.b.targetHealthy}
            : null,
          record: path.join(DRILLS_DIR, `${drills.drillRunId}.json`),
        }
      : null,
    readOnlyChecker: checker
      ? {status: checker.status, checkedAt: checker.checkedAt, localCommit: checker.localCommit, targetCommit: checker.targetCommit ?? null}
      : null,
    production3000: {
      loginStatus: production.login.status,
      backendStatus: production.backend.status,
      backendLocation: production.backend.location,
    },
  }

  console.log(JSON.stringify(status, null, 2))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`[status] fatal: ${error?.stack || error}`)
    process.exit(3)
  })
}
