#!/usr/bin/env node
/**
 * End-to-end drill for the CI artifact install path (heavy: packages a real
 * release, ~2.4 GB).
 *
 *   node scripts/auto-deploy/artifact-e2e.mjs
 *
 * It does what CI does (package-release.mjs over a real built release), zips the
 * two files the way GitHub does, then runs deploy.mjs --from-artifact against an
 * isolated RELEASE_ROOT/STATE_DIR:
 *
 *   package -> zip -> digest -> safe extract -> per-file verify
 *     -> yarn install --immutable -> candidate 3100 -> switch -> post-health
 *
 * The seed release is a hardlink copy of the real `previous` release, so no
 * production symlink is touched and no Next build runs anywhere in this drill.
 */
import fs from 'node:fs'
import path from 'node:path'
import {spawn} from 'node:child_process'

const REAL_STATE = process.env.ILA3_STATE_DIR || '/home/pro/.local/state/ila3-deploy'
const REAL_RELEASES = process.env.ILA3_RELEASE_ROOT || '/home/pro/releases/mercato'
// On disk, not /tmp: the package + extract + node_modules peak is several GB and
// /tmp is a 16 GB tmpfs on this host.
fs.mkdirSync(REAL_STATE, {recursive: true})
const BASE = fs.mkdtempSync(path.join(REAL_STATE, 'artifact-e2e-'))
const REAL_DRILLS = path.join(REAL_STATE, 'drills')
const REAL_LOGS = path.join(REAL_STATE, 'logs')
const APP_DIR = process.env.ILA3_APP_DIR || '/home/pro/apps/mercato'
const DRILL_STATE = path.join(BASE, 'state')
const DRILL_RELEASES = path.join(BASE, 'releases')
for (const dir of [DRILL_STATE, DRILL_RELEASES, REAL_DRILLS, REAL_LOGS]) fs.mkdirSync(dir, {recursive: true})

process.env.ILA3_STATE_DIR = DRILL_STATE
process.env.ILA3_RELEASE_ROOT = DRILL_RELEASES
process.env.ILA3_APP_DIR = APP_DIR

const lib = await import('./lib.mjs')
const artifact = await import('./artifact.mjs')
const health = await import('./health.mjs')

const DEPLOY = path.join(APP_DIR, 'scripts', 'auto-deploy', 'deploy.mjs')
const PACKAGE = path.join(APP_DIR, 'scripts', 'auto-deploy', 'package-release.mjs')
const TARGET_PORT = 3200
const CANDIDATE_PORT = 3100

function logLine(line) {
  fs.appendFileSync(LOG, `${line}\n`)
}

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const LOG = path.join(REAL_LOGS, `artifact-e2e-${Date.now()}.log`)
let activeSeedPid = null

function writeFile(file, contents) {
  fs.mkdirSync(path.dirname(file), {recursive: true})
  fs.writeFileSync(file, contents)
}

async function waitForLogin(port, timeoutMs = 10000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const probe = await lib.httpGet(`http://127.0.0.1:${port}/login`, {timeoutMs: 1000})
    if (probe.ok && probe.status === 200) return true
    await lib.sleep(200)
  }
  return false
}

function currentReleaseDir() {
  const link = path.join(REAL_RELEASES, 'current')
  const raw = fs.readlinkSync(link)
  return path.isAbsolute(raw) ? raw : path.resolve(path.dirname(link), raw)
}

function previousReleaseDir() {
  const link = path.join(REAL_RELEASES, 'previous')
  const raw = fs.readlinkSync(link)
  return path.isAbsolute(raw) ? raw : path.resolve(path.dirname(link), raw)
}

async function runNode(script, args, {timeoutMs = 1500000, label = path.basename(script)} = {}) {
  const started = Date.now()
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: APP_DIR,
      env: {...process.env, ILA3_STATE_DIR: DRILL_STATE, ILA3_RELEASE_ROOT: DRILL_RELEASES, ILA3_APP_DIR: APP_DIR},
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    const timer = setTimeout(() => lib.killTree(child.pid, 'SIGKILL'), timeoutMs)
    child.on('close', (status, signal) => {
      clearTimeout(timer)
      logLine(`\n$ node ${path.relative(APP_DIR, script)} ${args.join(' ')}\nexit=${status} signal=${signal || ''} ms=${Date.now() - started}`)
      if (stdout.trim()) logLine(`--- stdout ---\n${stdout.trim()}`)
      if (stderr.trim()) logLine(`--- stderr ---\n${stderr.trim()}`)
      resolve({status, stdout, stderr, ms: Date.now() - started})
    })
  })
}

async function main() {
  const releaseDir = path.resolve(argValue('--release', currentReleaseDir()))
  const releaseManifest = JSON.parse(fs.readFileSync(path.join(releaseDir, 'release.json'), 'utf8'))
  const githubRunId = argValue('--github-run-id', null)
  const sha = argValue('--sha', releaseManifest.sha)
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error(`bad sha ${sha}`)
  const seedDirSource = path.resolve(argValue('--seed-release', previousReleaseDir()))
  const seedManifest = JSON.parse(fs.readFileSync(path.join(seedDirSource, 'release.json'), 'utf8'))
  if (seedManifest.sha === sha) throw new Error('seed release equals target release; pick another --seed-release')

  const summary = {
    schema: 1,
    drillRunId: lib.makeRunId(sha, 'artifact-e2e'),
    sha,
    seedSha: seedManifest.sha,
    startedAt: lib.nowIso(),
    packageSource: githubRunId ? null : releaseDir,
    githubRunId: githubRunId ? Number(githubRunId) : null,
    seedSource: seedDirSource,
    isolatedRoot: {releases: DRILL_RELEASES, state: DRILL_STATE},
    log: LOG,
    steps: {},
    result: null,
    passed: false,
  }
  logLine(`[artifact-e2e] sha=${sha} seed=${seedManifest.sha} base=${BASE}`)

  // 1. Either package locally exactly the way the workflow does, or (with
  // --github-run-id) pull the real artifact that workflow run uploaded.
  let zipFile = null
  let zipSha = null
  if (githubRunId) {
    if (sha === releaseManifest.sha) throw new Error('--github-run-id requires --sha <commit of that run>')
    summary.steps.github = {runId: Number(githubRunId), artifactName: artifact.artifactName(sha), expectedSha: sha}
    logLine(`[artifact-e2e] github mode: run=${githubRunId} sha=${sha}`)
  } else {
    const packageDir = path.join(BASE, 'package')
    const packed = await runNode(PACKAGE, [
      '--source',
      releaseDir,
      '--out',
      packageDir,
      '--repository',
      'ctomall/ila3-commerce',
      '--run-id',
      '42609377937',
      '--commit',
      sha,
      '--checks',
      'typecheck,unit,build',
      '--json',
    ])
    if (packed.status !== 0) throw new Error(`package-release failed: ${packed.stderr || packed.stdout}`)
    const packageSummary = JSON.parse(packed.stdout.slice(packed.stdout.indexOf('{')))
    summary.steps.package = {
      ok: true,
      ms: packed.ms,
      archive: packageSummary.archive,
      manifest: packageSummary.manifest,
    }
    zipFile = artifact.createArtifactZip({
      dir: packageDir,
      zipFile: path.join(BASE, 'mercato-release.zip'),
    })
    zipSha = lib.sha256File(zipFile)
    summary.steps.zip = {file: zipFile, bytes: fs.statSync(zipFile).size, sha256: zipSha}
  }

  // 2. Seed: a tiny HTTP stand-in with a valid build stamp. It only exists so the
  // switch/rollback target is a real directory+symlink pair; the artifact release
  // still has to pass the full candidate and post-switch health checks for real.
  const seedDir = path.join(DRILL_RELEASES, `seed-${seedManifest.sha}`)
  fs.rmSync(seedDir, {recursive: true, force: true})
  writeFile(path.join(seedDir, 'package.json'), JSON.stringify({name: 'seed', version: '0.0.0'}))
  writeFile(path.join(seedDir, 'release.json'), JSON.stringify({schema: 1, status: 'ok', sha: seedManifest.sha}))
  writeFile(path.join(seedDir, '.mercato', 'build-info.json'), JSON.stringify({status: 'ok', commit: seedManifest.sha.slice(0, 8)}))
  writeFile(path.join(seedDir, '.mercato', 'next', 'BUILD_ID'), 'seed-build\n')
  lib.atomicSymlink(seedDir, path.join(DRILL_RELEASES, 'current'))
  lib.atomicSymlink(seedDir, path.join(DRILL_RELEASES, 'previous'))

  const seedServerFile = path.join(BASE, 'seed-server.mjs')
  writeFile(
    seedServerFile,
    `import http from 'node:http'
const port = Number(process.argv[2])
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (url.pathname === '/login') { res.statusCode = 200; res.end('login'); return }
  if (url.pathname === '/backend') { res.statusCode = 302; res.setHeader('location', '/login?redirect=/backend'); res.end(); return }
  res.statusCode = 200
  res.end('ok')
}).listen(port, '127.0.0.1')
`,
  )
  const seedProcess = spawn(process.execPath, [seedServerFile, String(TARGET_PORT)], {stdio: 'ignore', detached: true})
  seedProcess.unref()
  activeSeedPid = seedProcess.pid
  const seedReady = await waitForLogin(TARGET_PORT, 15000)
  if (!seedReady) throw new Error('seed stand-in did not start on 3200')
  lib.writeJsonAtomic(lib.ACTIVE_FILE, {
    pid: seedProcess.pid,
    port: TARGET_PORT,
    releaseDir: seedDir,
    sha: seedManifest.sha,
    startedAt: lib.nowIso(),
    e2eSeed: true,
  })
  summary.steps.seed = {dir: seedDir, sha: seedManifest.sha, pid: seedProcess.pid, kind: 'http-standin'}

  // 3. Deploy the artifact into the isolated root.
  const deployArgs = [
    '--drill',
    '--skip-ci-gate',
    '--pid-mode',
    '--from-artifact',
    '--artifact-run-id',
    githubRunId ? String(githubRunId) : '42609377937',
    '--install-dir',
    path.join(DRILL_RELEASES, sha),
    '--target-port',
    String(TARGET_PORT),
    '--candidate-port',
    String(CANDIDATE_PORT),
    '--timeout',
    '180000',
    '--artifact-timeout',
    '1200000',
    '--sha',
    sha,
    '--manual',
    '--json',
  ]
  if (!githubRunId) deployArgs.push('--artifact-file', zipFile, '--artifact-sha256', zipSha)
  const deploy = await runNode(DEPLOY, deployArgs, {timeoutMs: 1500000, label: 'deploy-from-artifact'})
  const latest = JSON.parse(fs.readFileSync(path.join(DRILL_STATE, 'latest.json'), 'utf8'))
  const installed = path.join(DRILL_RELEASES, sha)
  const installedRelease = fs.existsSync(path.join(installed, 'release.json'))
    ? JSON.parse(fs.readFileSync(path.join(installed, 'release.json'), 'utf8'))
    : null
  const currentRaw = fs.readlinkSync(path.join(DRILL_RELEASES, 'current'))
  const current = path.resolve(currentRaw)
  const targetHealth = await health.checkRunning({port: TARGET_PORT, releaseDir: installed, sha, timeoutMs: 60000})

  summary.steps.deploy = {
    exitCode: deploy.status,
    ms: deploy.ms,
    result: latest.result,
    error: latest.error ?? null,
    installer: latest.release?.installer ?? null,
    releaseSource: latest.release?.source ?? null,
    candidate: latest.candidate
      ? {ok: latest.candidate.ok, port: latest.candidate.port, checks: latest.candidate.checks, log: latest.candidate.log}
      : null,
    postSwitch: latest.postSwitch ?? null,
    rollback: latest.rollback ?? null,
    current,
    currentIsArtifactRelease: current === installed,
    installedRelease: installedRelease
      ? {
          sha: installedRelease.sha,
          source: installedRelease.source,
          commands: installedRelease.commands,
          artifact: installedRelease.artifact,
          buildInfo: installedRelease.buildInfo,
          envFiles: installedRelease.envFiles?.map((entry) => entry.name) ?? [],
        }
      : null,
    targetHealthy: targetHealth.ok,
    targetChecks: targetHealth.checks,
  }

  const nextInstalled = fs.existsSync(path.join(installed, 'node_modules', 'next', 'dist', 'bin', 'next'))
  const noBuildOutput = !fs.existsSync(path.join(installed, '.next'))
  summary.result = {
    deployed: latest.result === 'deployed' && deploy.status === 0,
    installer: latest.release?.installer,
    sourceMethod: installedRelease?.source?.method,
    currentIsArtifactRelease: current === installed,
    targetHealthy: targetHealth.ok,
    nextInstalled,
    noLocalBuildOutput: noBuildOutput,
  }
  summary.passed =
    summary.result.deployed &&
    summary.result.installer === 'ci-artifact' &&
    summary.result.sourceMethod === 'ci-artifact' &&
    summary.result.currentIsArtifactRelease === true &&
    summary.result.targetHealthy === true &&
    summary.result.nextInstalled === true

  // 4. Cleanup the isolated drill (never production).
  try {
    const active = lib.readJson(lib.ACTIVE_FILE)
    if (active?.pid) {
      lib.killTree(active.pid, 'SIGTERM')
      await lib.sleep(1000)
      if (lib.pidAlive(active.pid)) lib.killTree(active.pid, 'SIGKILL')
    }
  } catch {
    /* best effort */
  }
  summary.cleanup = {stopped: true, baseRemoved: true}
  summary.finishedAt = lib.nowIso()

  const evidenceDir = path.join(REAL_DRILLS, summary.drillRunId)
  fs.mkdirSync(evidenceDir, {recursive: true})
  for (const sub of ['runs', 'failed', 'logs']) {
    const source = path.join(DRILL_STATE, sub)
    if (!fs.existsSync(source)) continue
    for (const name of fs.readdirSync(source)) {
      fs.copyFileSync(path.join(source, name), path.join(evidenceDir, `${sub}-${name}`))
    }
  }
  lib.writeJsonAtomic(path.join(REAL_DRILLS, 'artifact-e2e-latest.json'), summary)
  lib.writeJsonAtomic(path.join(REAL_DRILLS, `${summary.drillRunId}.json`), summary)
  logLine(`\n[artifact-e2e] passed=${summary.passed} ${JSON.stringify(summary.result)}`)
  console.log(JSON.stringify(summary, null, 2))
  fs.rmSync(BASE, {recursive: true, force: true})
  process.exit(summary.passed ? 0 : 3)
}

main().catch((error) => {
  console.error(`[artifact-e2e] fatal: ${error?.stack || error}`)
  logLine(`[artifact-e2e] fatal: ${error?.stack || error}`)
  try {
    const active = JSON.parse(fs.readFileSync(path.join(DRILL_STATE, 'active.json'), 'utf8'))
    if (active?.pid) lib.killTree(active.pid, 'SIGKILL')
  } catch {
    /* ignore */
  }
  if (activeSeedPid) {
    try {
      lib.killTree(activeSeedPid, 'SIGKILL')
    } catch {
      /* ignore */
    }
  }
  console.error(`[artifact-e2e] work dir kept for inspection: ${BASE}`)
  process.exit(3)
})
