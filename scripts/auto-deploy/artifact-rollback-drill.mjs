/**
 * Drill: an artifact-installed release that dies right after the symlink switch
 * must be rolled back to the previous release, and the previous release must be
 * serving again.
 *
 * Why an isolated root: the drill switches `current`, restarts the target on a
 * spare port and injects a kill, so it must never point at the production
 * release root (ILA3_RELEASE_ROOT is redirected before lib.mjs is imported).
 *
 * The two releases are synthetic fixtures with a fake Next binary; what this
 * proves is the executor's artifact-path switch/health/rollback logic, not that
 * a real Next build restarts (production deploys prove that separately).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {spawn, spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'mercato-artifact-rollback-'))
const REAL_STATE = process.env.ILA3_STATE_DIR || '/home/pro/.local/state/ila3-deploy'
const REAL_LOGS = path.join(REAL_STATE, 'logs')
const REAL_DRILLS = path.join(REAL_STATE, 'drills')
const DRILL_STATE = path.join(BASE, 'state')
const DRILL_RELEASES = path.join(BASE, 'releases')
const APP_DIR = process.env.ILA3_APP_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

fs.mkdirSync(DRILL_RELEASES, {recursive: true})
fs.mkdirSync(DRILL_STATE, {recursive: true})
fs.mkdirSync(REAL_LOGS, {recursive: true})
fs.mkdirSync(REAL_DRILLS, {recursive: true})
process.env.ILA3_RELEASE_ROOT = DRILL_RELEASES
process.env.ILA3_STATE_DIR = DRILL_STATE
process.env.ILA3_APP_DIR = APP_DIR

const lib = await import('./lib.mjs')
const artifact = await import('./artifact.mjs')
const health = await import('./health.mjs')

const DEPLOY = path.join(APP_DIR, 'scripts', 'auto-deploy', 'deploy.mjs')
const NEW_SHA = lib.resolveSha('HEAD')
const OLD_SHA = lib.resolveSha('HEAD~1')
const DRILL_ID = lib.makeRunId(NEW_SHA, 'artifact-rollback-drill')
const LOG = path.join(REAL_LOGS, `${DRILL_ID}.log`)
const TARGET_PORT = 3210
const CANDIDATE_PORT = 3110

function logLine(line) {
  fs.appendFileSync(LOG, `${line}\n`)
}

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), {recursive: true})
  fs.writeFileSync(file, contents)
}

/** A Next-shaped entry point: honours `start -p PORT -H HOST` and serves the health routes. */
const FAKE_NEXT = `// CommonJS on purpose: the file has no .mjs extension, so Node loads it as CJS.
const http = require('node:http')
const argv = process.argv.slice(2)
const portIndex = argv.indexOf('-p')
const port = Number(argv[portIndex + 1] || process.env.PORT || 3000)
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (url.pathname === '/login') { res.statusCode = 200; res.end('login'); return }
  if (url.pathname === '/backend') {
    res.statusCode = 302
    res.setHeader('location', '/login?redirect=/backend')
    res.end()
    return
  }
  res.statusCode = 200
  res.end('ok')
}).listen(port, '127.0.0.1')
`

function makeRelease(root, sha, {name}) {
  fs.rmSync(root, {recursive: true, force: true})
  // One package name for both releases so the generated lockfile stays valid, and
  // let yarn write the lockfile itself: `yarn install --immutable` at install time
  // rejects a hand-written one (YN0028) the moment yarn's format moves.
  write(path.join(root, 'package.json'), JSON.stringify({name: 'drill-release', version: '0.0.0'}))
  write(path.join(root, '.yarnrc.yml'), 'nodeLinker: node-modules\n')
  const install = spawnSync('yarn', ['install'], {cwd: root, encoding: 'utf8', timeout: 120000})
  if (!fs.existsSync(path.join(root, 'yarn.lock'))) {
    throw new Error(`fixture yarn.lock not generated: ${(install.stderr || install.stdout || '').slice(-400)}`)
  }
  write(path.join(root, '.mercato', 'build-info.json'), JSON.stringify({status: 'ok', commit: sha.slice(0, 8), version: '0.0.0'}))
  write(path.join(root, '.mercato', 'next', 'BUILD_ID'), 'drill-build\n')
  write(path.join(root, '.mercato', 'generated', 'modules.generated.ts'), '// generated\n')
  write(path.join(root, 'release.json'), JSON.stringify({schema: 1, status: 'ok', sha, shortSha: sha.slice(0, 8)}))
  const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
  write(nextBin, FAKE_NEXT)
  fs.chmodSync(nextBin, 0o755)
  return root
}

async function packageRelease(root, name) {
  const outDir = path.join(BASE, 'packages', name)
  await artifact.createReleasePackage({
    sourceRoot: root,
    includePaths: [
      'package.json',
      'yarn.lock',
      '.yarnrc.yml',
      'release.json',
      '.mercato/build-info.json',
      '.mercato/generated',
      '.mercato/next',
      'node_modules/next/dist/bin/next',
    ],
    outDir,
    meta: {
      repository: 'ctomall/ila3-commerce',
      workflowRunId: 42,
      workflow: {path: artifact.ARTIFACT_WORKFLOW, name: 'build-artifact'},
      commit: NEW_SHA,
      ref: 'refs/heads/main',
      nodeMajor: Number(process.versions.node.split('.')[0]),
      platform: process.platform,
      arch: process.arch,
      checks: ['typecheck', 'unit', 'build'],
    },
  })
  const zipFile = artifact.createArtifactZip({dir: outDir, zipFile: path.join(BASE, 'zips', `${name}.zip`)})
  return {zipFile, sha256: lib.sha256File(zipFile)}
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = http.createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })
}

function runDeploy(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [DEPLOY, ...args], {
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
    const timer = setTimeout(() => lib.killTree(child.pid, 'SIGKILL'), 180000)
    child.on('close', (status, signal) => {
      clearTimeout(timer)
      const text = [
        `$ node scripts/auto-deploy/deploy.mjs ${args.join(' ')}`,
        `exit=${status} signal=${signal || ''}`,
        '--- stdout ---',
        stdout,
        '--- stderr ---',
        stderr,
      ].join('\n')
      logLine(`\n${text}`)
      resolve({status, stdout, stderr})
    })
  })
}

async function main() {
  const summary = {
    schema: 1,
    drillRunId: DRILL_ID,
    kind: 'artifact-rollback',
    oldSha: OLD_SHA,
    newSha: NEW_SHA,
    startedAt: lib.nowIso(),
    finishedAt: null,
    isolatedRoot: {releases: DRILL_RELEASES, state: DRILL_STATE},
    ports: {target: TARGET_PORT, candidate: CANDIDATE_PORT},
    log: LOG,
    scenario: {},
    cleanup: null,
  }
  logLine(`[artifact-rollback-drill] id=${DRILL_ID} old=${OLD_SHA.slice(0, 8)} new=${NEW_SHA.slice(0, 8)}`)
  for (const [label, port] of [['target', TARGET_PORT], ['candidate', CANDIDATE_PORT]]) {
    if (!(await portFree(port))) throw new Error(`${label} port ${port} is already in use`)
  }

  // Previous release: what a rollback must return to.
  const previous = makeRelease(path.join(DRILL_RELEASES, OLD_SHA), OLD_SHA, {name: 'previous'})
  lib.atomicSymlink(previous, path.join(DRILL_RELEASES, 'current'))
  const previousHealth = await health.checkRelease({
    releaseDir: previous,
    port: TARGET_PORT,
    sha: OLD_SHA,
    timeoutMs: 20000,
    keep: true,
    logPath: path.join(DRILL_STATE, 'logs', 'previous.log'),
  })
  if (!previousHealth.ok) throw new Error(`previous release did not start: ${JSON.stringify(previousHealth.checks)}`)
  summary.scenario.previous = {
    dir: previous,
    pid: previousHealth.pid,
    healthy: previousHealth.ok,
    checks: previousHealth.checks,
  }
  // Free the target port before the deploy: the deploy only stops a process it
  // recorded itself, and a leftover server would answer /login for the new
  // release and make the injected post-switch failure look healthy.
  try {
    lib.killTree(previousHealth.pid, 'SIGTERM')
  } catch {
    /* already gone */
  }
  for (let i = 0; i < 50; i += 1) {
    if (await portFree(TARGET_PORT)) break
    await lib.sleep(100)
  }
  if (!(await portFree(TARGET_PORT))) throw new Error(`target port ${TARGET_PORT} did not free up after stopping the previous release`)

  // New release: installed through the artifact path, then killed right after the switch.
  const source = makeRelease(path.join(BASE, 'source-new'), NEW_SHA, {name: 'new'})
  const pkg = await packageRelease(source, 'new-release')
  const deploy = await runDeploy([
    '--drill',
    '--skip-ci-gate',
    '--pid-mode',
    '--from-artifact',
    '--artifact-file',
    pkg.zipFile,
    '--artifact-sha256',
    pkg.sha256,
    '--artifact-run-id',
    '42',
    '--sha',
    NEW_SHA,
    '--target-port',
    String(TARGET_PORT),
    '--candidate-port',
    String(CANDIDATE_PORT),
    '--timeout',
    '15000',
    '--inject-post-switch-failure',
    '--manual',
    '--json',
  ])

  const latest = lib.readJson(path.join(DRILL_STATE, 'latest.json')) || {}
  const currentAfter = fs.readlinkSync(path.join(DRILL_RELEASES, 'current'))
  const afterHealth = await health.checkRunning({port: TARGET_PORT, releaseDir: previous, sha: OLD_SHA, timeoutMs: 10000})
  const installedDir = path.join(DRILL_RELEASES, NEW_SHA)

  summary.scenario.deploy = {
    exitCode: deploy.status,
    runId: latest.runId ?? null,
    result: latest.result ?? null,
    errorCode: latest.error?.code ?? null,
    injectedFailure: latest.injectedFailure ?? null,
    postSwitchOk: latest.postSwitch?.ok ?? null,
    rollback: latest.rollback ?? null,
    currentAfter,
    currentRestoredToPrevious: path.resolve(currentAfter) === path.resolve(previous),
    installedDirExists: fs.existsSync(installedDir),
    servingAfterRollback: {ok: afterHealth.ok, checks: afterHealth.checks},
    record: latest.runId ? path.join(DRILL_STATE, 'runs', `${latest.runId}.json`) : null,
  }

  // Stop whatever the drill left running (the restored previous release).
  try {
    lib.killTree(previousHealth.pid, 'SIGTERM')
  } catch {
    /* already gone */
  }
  const stale = lib.readJson(path.join(DRILL_STATE, 'active.json'))
  if (stale?.pid) {
    try {
      lib.killTree(stale.pid, 'SIGTERM')
    } catch {
      /* already gone */
    }
  }
  await lib.sleep(500)

  const s = summary.scenario
  summary.passed =
    s.deploy.exitCode === 2 &&
    s.deploy.result === 'rolled-back' &&
    s.deploy.injectedFailure === 'killed newly started target before post-switch health' &&
    s.deploy.postSwitchOk === false &&
    s.deploy.rollback?.attempted === true &&
    s.deploy.rollback?.healthy === true &&
    s.deploy.currentRestoredToPrevious === true &&
    s.deploy.servingAfterRollback.ok === true &&
    s.deploy.installedDirExists === true
  summary.finishedAt = lib.nowIso()

  // Keep the run record readable after the throwaway base is removed.
  const evidenceDir = path.join(REAL_DRILLS, DRILL_ID)
  fs.mkdirSync(evidenceDir, {recursive: true})
  for (const sub of ['runs', 'logs', 'gates']) {
    const dir = path.join(DRILL_STATE, sub)
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      fs.copyFileSync(path.join(dir, name), path.join(evidenceDir, `${sub}-${name}`))
    }
  }
  if (s.deploy.record && fs.existsSync(s.deploy.record)) {
    s.deploy.record = path.join(evidenceDir, `runs-${path.basename(s.deploy.record)}`)
  }

  lib.writeJsonAtomic(path.join(REAL_DRILLS, 'artifact-rollback-latest.json'), summary)
  lib.writeJsonAtomic(path.join(REAL_DRILLS, `${DRILL_ID}.json`), summary)
  console.log(JSON.stringify(summary, null, 2))
  fs.rmSync(BASE, {recursive: true, force: true})
  process.exit(summary.passed ? 0 : 3)
}

main().catch((error) => {
  console.error(`[artifact-rollback-drill] fatal: ${error?.stack || error}`)
  logLine(`[artifact-rollback-drill] fatal: ${error?.stack || error}`)
  fs.rmSync(BASE, {recursive: true, force: true})
  process.exit(3)
})
