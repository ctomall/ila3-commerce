#!/usr/bin/env node
/**
 * P6 application-upgrade verification (read-only except a held flock).
 *
 * Proves, against the release that is actually installed on this host:
 *   1. artifact integrity — every file in `release-manifest.json` still hashes
 *      to the recorded sha256, the build is present, the runtime matches;
 *   2. upgrade lock — while another process holds the deploy flock, the same
 *      entry point every deploy uses exits 75 `locked-out`; after release it
 *      runs again, and no deploy run record was created by the blocked attempt;
 *   3. rollback target — `crm-rollback.mjs` dry run accepts the previous
 *      release directory (no symlink swap, no restart; nothing is applied);
 *   4. OTA entry — the superadmin System Update status API reports the running
 *      slot and the latest origin/main candidate.
 *
 * This is an application upgrade check only: it does not claim zero downtime,
 * does not touch the database, and does not perform a phone/OTA firmware
 * update. Application rollback and data restore are different operations and
 * are reported separately.
 *
 * Usage: node scripts/p6-ota-verify.mjs [--out <file>]
 */
import crypto from 'node:crypto'
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
const RELEASE_ROOT = process.env.P6_RELEASE_ROOT ?? '/home/pro/releases/mercato'
const CURRENT = path.join(RELEASE_ROOT, 'current')
const PREVIOUS = path.join(RELEASE_ROOT, 'previous')
const LOCK_PATH = '/home/pro/.local/state/ila3-deploy/deploy.lock'
const LOCK_HOLD_PID_FILE = '/tmp/p6-lock-hold.pid'
const STATE_DIR = '/home/pro/.local/state/ila3-deploy/runs'
const STAMP = new Date().toISOString().replace(/[:.]/g, '')
const OUT = path.resolve(argOf('--out', path.join(repo, 'docs/deployment', `p6-ota-verify-${STAMP}.json`)))
const CREDS = process.env.P6_CREDS_FILE ?? '/home/pro/.ila3-admin-credentials'
const BASE = process.env.P6_BASE_URL ?? 'http://127.0.0.1:3000'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function sha256(file) {
  const hash = crypto.createHash('sha256')
  const fd = fs.openSync(file, 'r')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  try {
    for (;;) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null)
      if (read <= 0) break
      hash.update(buffer.subarray(0, read))
    }
  } finally {
    fs.closeSync(fd)
  }
  return hash.digest('hex')
}

/** Which release the service is actually serving, from the symlink + records. */
function runningRelease() {
  const target = fs.readlinkSync(CURRENT)
  const dir = path.resolve(path.dirname(CURRENT), target)
  const release = JSON.parse(fs.readFileSync(path.join(dir, 'release.json'), 'utf8'))
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'release-manifest.json'), 'utf8'))
  return { dir, release, manifest }
}

async function login(account) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      host: 'mercato.ila3.top',
      'x-forwarded-proto': 'https',
    },
    body: new URLSearchParams(account),
    redirect: 'manual',
  })
  if (response.status !== 200) throw new Error(`login failed with ${response.status}`)
  return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
}

async function upgradeLockCheck() {
  const runsBefore = fs.existsSync(STATE_DIR) ? fs.readdirSync(STATE_DIR).length : 0
  const holder = spawn('flock', ['-n', LOCK_PATH, 'sleep', '6'], { stdio: 'ignore' })
  fs.writeFileSync(LOCK_HOLD_PID_FILE, String(holder.pid ?? ''))
  await sleep(1_200)
  const blocked = (() => {
    try {
      const output = execFileSync(process.execPath, [path.join(repo, 'scripts/auto-deploy/deploy.mjs'), '--help'], {
        encoding: 'utf8',
        timeout: 30_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      return { status: 0, output }
    } catch (error) {
      return {
        status: typeof error.status === 'number' ? error.status : null,
        stdout: String(error.stdout ?? ''),
        stderr: String(error.stderr ?? ''),
      }
    }
  })()
  await sleep(6_000)
  const afterRelease = (() => {
    try {
      const output = execFileSync(process.execPath, [path.join(repo, 'scripts/auto-deploy/deploy.mjs'), '--help'], {
        encoding: 'utf8',
        timeout: 30_000,
      })
      return { status: 0, output: output.slice(0, 200) }
    } catch (error) {
      return { status: typeof error.status === 'number' ? error.status : null, output: String(error.stdout ?? '') }
    }
  })()
  const runsAfter = fs.existsSync(STATE_DIR) ? fs.readdirSync(STATE_DIR).length : 0
  return {
    lockPath: LOCK_PATH,
    blocked,
    afterRelease,
    runRecordsBefore: runsBefore,
    runRecordsAfter: runsAfter,
  }
}

function rollbackDryRun() {
  try {
    const output = execFileSync(process.execPath, [path.join(repo, 'scripts/crm-rollback.mjs'), '--to', process.env.P6_ROLLBACK_TO ?? 'previous'], {
      encoding: 'utf8',
      timeout: 120_000,
    })
    return { status: 0, output: output.slice(0, 2_000) }
  } catch (error) {
    return { status: typeof error.status === 'number' ? error.status : null, output: String(error.stdout ?? '') + String(error.stderr ?? '') }
  }
}

async function main() {
  const evidence = { schema: 1, drill: 'p6-ota-verify', startedAt: new Date().toISOString(), checks: {} }
  let failure = null
  try {
    const running = runningRelease()
    evidence.checks.currentSymlink = running.dir
    evidence.checks.release = {
      sha: running.release.sha,
      version: running.release.version,
      source: running.release.source?.method ?? null,
      workflowRunId: running.release.source?.workflowRunId ?? null,
    }
    evidence.checks.manifest = {
      sha256: running.manifest.sha256,
      commit: running.manifest.commit,
      workflowRunId: running.manifest.workflowRunId,
      archiveSha256: running.manifest.archive?.sha256 ?? null,
      archiveBytes: running.manifest.archive?.bytes ?? null,
      files: Array.isArray(running.manifest.files) ? running.manifest.files.length : 0,
    }

    // 1. artifact integrity
    const mismatches = []
    const missing = []
    if (Array.isArray(running.manifest.files)) {
      for (const entry of running.manifest.files) {
        if (entry.type !== 'file') continue
        const file = path.join(running.dir, entry.path)
        if (!fs.existsSync(file)) {
          missing.push(entry.path)
          continue
        }
        const actual = sha256(file)
        if (actual !== entry.sha256) mismatches.push({ path: entry.path, expected: entry.sha256, actual })
      }
    }
    evidence.checks.integrity = {
      filesChecked: Array.isArray(running.manifest.files) ? running.manifest.files.filter((entry) => entry.type === 'file').length : 0,
      mismatches,
      missing,
      buildIdPresent: fs.existsSync(path.join(running.dir, '.mercato', 'next', 'BUILD_ID')),
      runtimeNodeMajor: Number(process.versions.node.split('.')[0]),
      manifestNodeMajor: running.manifest.runtime?.nodeMajor ?? null,
    }
    if (mismatches.length > 0) evidence.failures = [...(evidence.failures ?? []), `integrity: ${mismatches.length} hash mismatches`]
    if (missing.length > 0) evidence.failures = [...(evidence.failures ?? []), `integrity: ${missing.length} files missing`]
    if (!evidence.checks.integrity.buildIdPresent) evidence.failures = [...(evidence.failures ?? []), 'integrity: BUILD_ID missing']
    if (running.manifest.commit !== running.release.sha) evidence.failures = [...(evidence.failures ?? []), 'manifest commit != release sha']
    if (running.release.source?.workflowRunId !== running.manifest.workflowRunId) {
      evidence.failures = [...(evidence.failures ?? []), 'manifest workflow run != release source run']
    }

    // 2. upgrade lock
    evidence.checks.lock = await upgradeLockCheck()
    if (evidence.checks.lock.blocked.status !== 75) evidence.failures = [...(evidence.failures ?? []), `lock: blocked entry exited ${evidence.checks.lock.blocked.status}`]
    if (evidence.checks.lock.afterRelease.status !== 0) evidence.failures = [...(evidence.failures ?? []), `lock: entry did not recover (${evidence.checks.lock.afterRelease.status})`]
    if (evidence.checks.lock.runRecordsAfter !== evidence.checks.lock.runRecordsBefore) {
      evidence.failures = [...(evidence.failures ?? []), 'lock: blocked attempt created a deploy run record']
    }

    // 3. rollback target (dry run only)
    evidence.checks.rollbackDryRun = rollbackDryRun()
    evidence.checks.previousSymlink = fs.existsSync(PREVIOUS) ? fs.readlinkSync(PREVIOUS) : null
    if (evidence.checks.rollbackDryRun.status !== 0) evidence.failures = [...(evidence.failures ?? []), 'rollback: dry run rejected the previous release']
    evidence.checks.rollbackIsApplicationOnly = 'symlink swap + restart; no database action, new data kept'

    // 4. OTA entry (System Update status API)
    const rows = fs.readFileSync(CREDS, 'utf8').split('\n').map((line) => line.split(/\s+/))
    const account = rows.find((fields) => fields.includes('superadmin@acme.com'))
    if (!account) throw new Error('superadmin credential missing')
    const cookie = await login({ email: account[1], password: account[2] })
    const status = await fetch(`${BASE}/api/system_update/status`, {
      headers: { cookie, host: 'mercato.ila3.top', 'x-forwarded-proto': 'https' },
    })
    evidence.checks.otaEntryStatusHttp = status.status
    const statusBody = await status.json().catch(() => null)
    evidence.checks.otaEntry = statusBody
      ? {
          enabled: statusBody.enabled ?? null,
          canManage: statusBody.canManage ?? null,
          runningVersion: statusBody.repo?.runningVersion ?? null,
          runningCommit: statusBody.repo?.runningCommit ?? null,
          repoHead: statusBody.repo?.commit ?? null,
          branch: statusBody.repo?.branch ?? null,
          dirtyCount: statusBody.repo?.dirtyCount ?? null,
          relation: statusBody.deployment?.relation ?? null,
          candidate: statusBody.deployment?.candidate
            ? { found: statusBody.deployment.candidate.found, sha: statusBody.deployment.candidate.sha, gate: statusBody.deployment.candidate.ciGate ?? null }
            : null,
          latestRun: statusBody.deployment?.latest
            ? { runId: statusBody.deployment.latest.runId, result: statusBody.deployment.latest.result, sha: statusBody.deployment.latest.sha }
            : null,
        }
      : null
    if (status.status !== 200) evidence.failures = [...(evidence.failures ?? []), `ota entry: HTTP ${status.status}`]
    if (evidence.checks.otaEntry?.runningCommit !== running.release.sha.slice(0, 8)) {
      evidence.failures = [...(evidence.failures ?? []), 'ota entry: running commit does not match the installed release']
    }
  } catch (error) {
    failure = error
    evidence.failures = [...(evidence.failures ?? []), String(error?.message ?? error)]
  } finally {
    evidence.finishedAt = new Date().toISOString()
    evidence.result = (evidence.failures ?? []).length === 0 ? 'passed' : 'failed'
    fs.mkdirSync(path.dirname(OUT), { recursive: true })
    fs.writeFileSync(OUT, `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(JSON.stringify({ result: evidence.result, failures: evidence.failures ?? [], evidence: OUT }))
  }
  if ((evidence.failures ?? []).length > 0) process.exitCode = 1
}

await main()
