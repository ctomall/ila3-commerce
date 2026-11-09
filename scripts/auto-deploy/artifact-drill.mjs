#!/usr/bin/env node
/**
 * Failure drills for the CI-release-artifact path.
 *
 * Every scenario runs against throwaway fixtures and an isolated
 * RELEASE_ROOT/STATE_DIR; production `current` (and any real release directory)
 * is never touched. The last two scenarios run deploy.mjs end to end against a
 * fake seed server on port 3200, proving that a download failure refuses the
 * deploy and leaves the old target running.
 *
 *   node scripts/auto-deploy/artifact-drill.mjs
 *
 * Evidence: <state>/drills/artifact-latest.json + <state>/logs/<id>.log
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {spawn, spawnSync} from 'node:child_process'

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'mercato-artifact-drill-'))
const REAL_STATE = process.env.ILA3_STATE_DIR || '/home/pro/.local/state/ila3-deploy'
const REAL_LOGS = path.join(REAL_STATE, 'logs')
const REAL_DRILLS = path.join(REAL_STATE, 'drills')
const APP_DIR = process.env.ILA3_APP_DIR || '/home/pro/apps/mercato'
const DRILL_STATE = path.join(BASE, 'state')
const DRILL_RELEASES = path.join(BASE, 'releases')
fs.mkdirSync(DRILL_STATE, {recursive: true})
fs.mkdirSync(DRILL_RELEASES, {recursive: true})
fs.mkdirSync(REAL_LOGS, {recursive: true})
fs.mkdirSync(REAL_DRILLS, {recursive: true})

// Isolate every module constant before importing the deploy modules. The deploy
// child processes inherit the same overrides, so prune/lock/symlinks are local.
process.env.ILA3_STATE_DIR = DRILL_STATE
process.env.ILA3_RELEASE_ROOT = DRILL_RELEASES
process.env.ILA3_APP_DIR = APP_DIR

const artifact = await import('./artifact.mjs')
const lib = await import('./lib.mjs')
const health = await import('./health.mjs')

const DEPLOY = path.join(APP_DIR, 'scripts', 'auto-deploy', 'deploy.mjs')
const COMMIT = lib.resolveSha(process.argv.includes('--sha') ? process.argv[process.argv.indexOf('--sha') + 1] : 'HEAD')
const DRILL_ID = lib.makeRunId(COMMIT, 'artifact-drill')
const LOG = path.join(REAL_LOGS, `${DRILL_ID}.log`)
const CHECKER_DIR = path.join(APP_DIR, '.mercato', 'auto-deploy')
let activeSeed = null
const REPO = 'ctomall/ila3-commerce'
const NODE_MAJOR = Number(process.versions.node.split('.')[0])

function logLine(line) {
  fs.appendFileSync(LOG, `${line}\n`)
}

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), {recursive: true})
  fs.writeFileSync(file, contents)
}

function makeFixture(name, {runId = 111, commit = COMMIT} = {}) {
  const root = path.join(BASE, 'fixtures', name)
  fs.rmSync(root, {recursive: true, force: true})
  write(path.join(root, 'package.json'), JSON.stringify({name: 'drill-fixture', version: '1.0.0'}))
  write(path.join(root, 'yarn.lock'), '# drill fixture\n')
  write(path.join(root, '.yarnrc.yml'), 'nodeLinker: node-modules\n')
  write(path.join(root, '.mercato', 'build-info.json'), JSON.stringify({status: 'ok', commit: commit.slice(0, 8)}))
  write(path.join(root, '.mercato', 'next', 'BUILD_ID'), 'drill-build\n')
  write(path.join(root, '.mercato', 'next', 'server', 'chunk.js'), `// ${name}\n`)
  write(path.join(root, '.mercato', 'generated', 'modules.generated.ts'), '// generated\n')
  write(path.join(root, 'public', 'index.txt'), 'drill\n')
  return root
}

async function packageFixture(root, {name, runId = 111, commit = COMMIT}) {
  const outDir = path.join(BASE, 'packages', name)
  const result = await artifact.createReleasePackage({
    sourceRoot: root,
    includePaths: ['package.json', 'yarn.lock', '.yarnrc.yml', 'public', '.mercato/build-info.json', '.mercato/generated', '.mercato/next'],
    outDir,
    meta: {
      repository: REPO,
      workflowRunId: runId,
      workflow: {path: artifact.ARTIFACT_WORKFLOW, name: 'build-artifact'},
      commit,
      ref: 'refs/heads/main',
      nodeMajor: NODE_MAJOR,
      platform: process.platform,
      arch: process.arch,
      checks: ['typecheck', 'unit', 'build'],
    },
  })
  const zipFile = artifact.createArtifactZip({dir: outDir, zipFile: path.join(BASE, 'zips', `${name}.zip`)})
  return {result, zipFile, outDir}
}

function startServer(handler) {
  const server = http.createServer(handler)
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({server, port: server.address().port}))
  })
}

const SEED_SERVER = path.join(BASE, 'seed-server.mjs')
function writeSeedServer() {
  write(
    SEED_SERVER,
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

function seedRelease() {
  const dir = path.join(DRILL_RELEASES, `seed-${DRILL_ID}`)
  fs.rmSync(dir, {recursive: true, force: true})
  write(path.join(dir, 'package.json'), JSON.stringify({name: 'seed', version: '0.0.0'}))
  write(path.join(dir, 'release.json'), JSON.stringify({schema: 1, status: 'ok', sha: COMMIT, shortSha: COMMIT.slice(0, 8)}))
  write(path.join(dir, '.mercato', 'build-info.json'), JSON.stringify({status: 'ok', commit: COMMIT.slice(0, 8)}))
  write(path.join(dir, '.mercato', 'next', 'BUILD_ID'), 'seed-build\n')
  return dir
}

// Async on purpose: the download-failure scenarios serve their 404/hang responses
// from THIS process, so blocking the event loop with spawnSync would deadlock.
function runDeploy(args) {
  const started = Date.now()
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
    const timer = setTimeout(() => {
      lib.killTree(child.pid, 'SIGKILL')
    }, 180000)
    child.on('close', (status, signal) => {
      clearTimeout(timer)
      const text = [
        `$ node scripts/auto-deploy/deploy.mjs ${args.join(' ')}`,
        `exit=${status} signal=${signal || ''} ms=${Date.now() - started}`,
        '--- stdout ---',
        stdout,
        '--- stderr ---',
        stderr,
      ].join('\n')
      logLine(`\n${text}`)
      resolve({status, stdout, stderr, text})
    })
  })
}

async function directInstallScenario({name, fixture, expectedRunId, expectedSha, installName}) {
  const pkg = await packageFixture(fixture, {name: `${installName}-pkg`})
  const installDir = path.join(DRILL_RELEASES, installName)
  const startedAt = lib.nowIso()
  let error = null
  try {
    await artifact.installFromArtifact({
      sha: COMMIT,
      runId: expectedRunId,
      repo: REPO,
      source: {kind: 'file', file: pkg.zipFile, sha256: expectedSha(pkg), runId: expectedRunId},
      installDir,
      downloadTimeoutMs: 30000,
      installTimeoutMs: 120000,
      logPath: path.join(DRILL_STATE, 'logs', `${installName}.log`),
    })
  } catch (caught) {
    error = caught
  }
  const staging = fs
    .readdirSync(DRILL_RELEASES)
    .filter((entry) => entry.startsWith(`.staging-${COMMIT}`) || entry.startsWith(installName))
  return {
    name,
    startedAt,
    finishedAt: lib.nowIso(),
    errorCode: error?.code ?? null,
    message: error?.message ?? null,
    installDirCreated: fs.existsSync(installDir),
    stagingLeftovers: staging,
    refused: Boolean(error) && error.name === 'ArtifactError',
  }
}

async function main() {
  lib.ensureDirs()
  const summary = {
    schema: 1,
    drillRunId: DRILL_ID,
    sha: COMMIT,
    startedAt: lib.nowIso(),
    finishedAt: null,
    isolatedRoot: {releases: DRILL_RELEASES, state: DRILL_STATE},
    log: LOG,
    scenarios: {},
    cleanup: null,
  }
  logLine(`[artifact-drill] id=${DRILL_ID} sha=${COMMIT} base=${BASE}`)

  // --- 1. package sha256 mismatch ------------------------------------------------
  const digestFixture = makeFixture('digest')
  summary.scenarios.digest = await directInstallScenario({
    name: 'digest-mismatch',
    fixture: digestFixture,
    expectedRunId: 111,
    expectedSha: () => '0'.repeat(64),
    installName: 'digest-target',
  })

  // --- 2. manifest vs trusted run metadata --------------------------------------
  const metadataFixture = makeFixture('metadata')
  summary.scenarios.metadata = await directInstallScenario({
    name: 'manifest-run-mismatch',
    fixture: metadataFixture,
    expectedRunId: 222,
    expectedSha: (pkg) => lib.sha256File(pkg.zipFile),
    installName: 'metadata-target',
  })

  // --- 3. path traversal inside the tar -----------------------------------------
  const traversalFixture = makeFixture('traversal')
  const valid = await packageFixture(traversalFixture, {name: 'traversal-valid', runId: 111})
  const traversalSrc = path.join(BASE, 'traversal-src')
  write(path.join(traversalSrc, 'payload.txt'), 'x')
  const maliciousTar = path.join(BASE, 'malicious', 'release.tar.gz')
  fs.mkdirSync(path.dirname(maliciousTar), {recursive: true})
  const transformed = spawnSync('tar', ['-czf', maliciousTar, '--transform=s|^|../|', '-C', traversalSrc, 'payload.txt'], {
    encoding: 'utf8',
  })
  if (transformed.status !== 0) throw new Error(`cannot build traversal tar: ${transformed.stderr}`)
  const maliciousManifest = JSON.parse(fs.readFileSync(valid.result.manifestPath, 'utf8'))
  maliciousManifest.archive = {
    ...maliciousManifest.archive,
    sha256: lib.sha256File(maliciousTar),
    bytes: fs.statSync(maliciousTar).size,
  }
  const maliciousDir = path.join(BASE, 'malicious-pkg')
  fs.mkdirSync(maliciousDir, {recursive: true})
  fs.copyFileSync(maliciousTar, path.join(maliciousDir, artifact.ARCHIVE_NAME))
  fs.writeFileSync(path.join(maliciousDir, artifact.MANIFEST_NAME), `${JSON.stringify(maliciousManifest, null, 2)}\n`)
  const maliciousZip = artifact.createArtifactZip({dir: maliciousDir, zipFile: path.join(BASE, 'zips', 'traversal.zip')})
  let traversalError = null
  try {
    await artifact.installFromArtifact({
      sha: COMMIT,
      runId: 111,
      repo: REPO,
      source: {kind: 'file', file: maliciousZip, sha256: lib.sha256File(maliciousZip), runId: 111},
      installDir: path.join(DRILL_RELEASES, 'traversal-target'),
      logPath: path.join(DRILL_STATE, 'logs', 'traversal.log'),
    })
  } catch (caught) {
    traversalError = caught
  }
  summary.scenarios.traversal = {
    name: 'path-traversal',
    errorCode: traversalError?.code ?? null,
    message: traversalError?.message ?? null,
    installDirCreated: fs.existsSync(path.join(DRILL_RELEASES, 'traversal-target')),
  }

  // --- 4. transport failures ----------------------------------------------------
  const notFound = await startServer((request, response) => {
    response.statusCode = 404
    response.end('missing')
  })
  const hang = await startServer(() => {
    /* never respond */
  })
  try {
    let notFoundError = null
    try {
      await artifact.downloadArtifactZip({
        url: `http://127.0.0.1:${notFound.port}/artifact.zip`,
        file: path.join(BASE, 'downloads', '404.zip'),
        timeoutMs: 5000,
      })
    } catch (caught) {
      notFoundError = caught
    }
    summary.scenarios.download404 = {
      name: 'download-404',
      errorCode: notFoundError?.code ?? null,
      httpStatus: notFoundError?.detail?.status ?? null,
    }

    let timeoutError = null
    try {
      await artifact.downloadArtifactZip({
        url: `http://127.0.0.1:${hang.port}/artifact.zip`,
        file: path.join(BASE, 'downloads', 'timeout.zip'),
        timeoutMs: 600,
      })
    } catch (caught) {
      timeoutError = caught
    }
    summary.scenarios.downloadTimeout = {
      name: 'download-timeout',
      errorCode: timeoutError?.code ?? null,
      reason: timeoutError?.detail?.reason ?? null,
    }

    // --- 5. deploy-level: download failures must keep the old target running ----
    const seedDir = seedRelease()
    lib.atomicSymlink(seedDir, path.join(DRILL_RELEASES, 'current'))
    writeSeedServer()
    const seedPort = 3200
    const seed = spawn(process.execPath, [SEED_SERVER, String(seedPort)], {stdio: 'ignore', detached: true})
    seed.unref()
    activeSeed = seed
    const healthy = await waitForLogin(seedPort)
    if (!healthy) throw new Error('seed server did not become healthy on 3200')
    summary.seed = {dir: seedDir, port: seedPort, pid: seed.pid, healthy}

    const deployBase = [
      '--drill',
      '--skip-ci-gate',
      '--pid-mode',
      '--from-artifact',
      '--target-port',
      String(seedPort),
      '--candidate-port',
      '3100',
      '--timeout',
      '15000',
      '--artifact-run-id',
      '42609377937',
      '--sha',
      COMMIT,
      '--manual',
      '--json',
    ]

    const run404 = await runDeploy([...deployBase, '--artifact-url', `http://127.0.0.1:${notFound.port}/artifact.zip`, '--artifact-sha256', '0'.repeat(64)])
    const latest404 = JSON.parse(fs.readFileSync(path.join(DRILL_STATE, 'latest.json'), 'utf8'))
    const health404 = await health.checkRunning({port: seedPort, releaseDir: seedDir, sha: COMMIT, timeoutMs: 5000})
    const current404 = fs.readlinkSync(path.join(DRILL_RELEASES, 'current'))
    summary.scenarios.deployDownload404 = {
      name: 'deploy-download-404',
      exitCode: run404.status,
      result: latest404.result,
      errorCode: latest404.error?.code ?? null,
      currentUnchanged: path.resolve(current404) === path.resolve(seedDir),
      targetHealthy: health404.ok,
      targetChecks: health404.checks,
      record: path.join(DRILL_STATE, 'runs', `${latest404.runId}.json`),
    }

    const runTimeout = await runDeploy([
      ...deployBase,
      '--artifact-url',
      `http://127.0.0.1:${hang.port}/artifact.zip`,
      '--artifact-sha256',
      '0'.repeat(64),
      '--artifact-timeout',
      '1500',
    ])
    const latestTimeout = JSON.parse(fs.readFileSync(path.join(DRILL_STATE, 'latest.json'), 'utf8'))
    const healthTimeout = await health.checkRunning({port: seedPort, releaseDir: seedDir, sha: COMMIT, timeoutMs: 5000})
    const currentTimeout = fs.readlinkSync(path.join(DRILL_RELEASES, 'current'))
    summary.scenarios.deployDownloadTimeout = {
      name: 'deploy-download-timeout',
      exitCode: runTimeout.status,
      result: latestTimeout.result,
      errorCode: latestTimeout.error?.code ?? null,
      currentUnchanged: path.resolve(currentTimeout) === path.resolve(seedDir),
      targetHealthy: healthTimeout.ok,
      targetChecks: healthTimeout.checks,
      record: path.join(DRILL_STATE, 'runs', `${latestTimeout.runId}.json`),
    }

    // cleanup
    try {
      process.kill(-seed.pid, 'SIGTERM')
    } catch {
      try {
        process.kill(seed.pid, 'SIGTERM')
      } catch {
        /* gone */
      }
    }
    fs.rmSync(seedDir, {recursive: true, force: true})
    summary.cleanup = {seedStopped: true, seedRemoved: !fs.existsSync(seedDir)}
  } finally {
    notFound.server.close()
    hang.server.closeAllConnections?.()
    hang.server.close()
  }

  const s = summary.scenarios
  summary.passed =
    s.digest?.errorCode === 'artifact-digest-mismatch' &&
    s.digest?.installDirCreated === false &&
    s.metadata?.errorCode === 'artifact-manifest-mismatch' &&
    s.metadata?.installDirCreated === false &&
    s.traversal?.errorCode === 'artifact-unsafe-path' &&
    s.traversal?.installDirCreated === false &&
    s.download404?.errorCode === 'artifact-download-failed' &&
    s.download404?.httpStatus === 404 &&
    s.downloadTimeout?.errorCode === 'artifact-download-failed' &&
    s.deployDownload404?.exitCode === 2 &&
    s.deployDownload404?.result === 'refused' &&
    s.deployDownload404?.errorCode === 'artifact-download-failed' &&
    s.deployDownload404?.currentUnchanged === true &&
    s.deployDownload404?.targetHealthy === true &&
    s.deployDownloadTimeout?.exitCode === 2 &&
    s.deployDownloadTimeout?.result === 'refused' &&
    s.deployDownloadTimeout?.errorCode === 'artifact-download-failed' &&
    s.deployDownloadTimeout?.currentUnchanged === true &&
    s.deployDownloadTimeout?.targetHealthy === true
  summary.finishedAt = lib.nowIso()

  // Preserve the deploy run records / install logs outside the throwaway base so
  // the evidence paths in the summary stay readable after cleanup.
  const evidenceDir = path.join(REAL_DRILLS, DRILL_ID)
  fs.mkdirSync(evidenceDir, {recursive: true})
  for (const sub of ['runs', 'failed', 'logs']) {
    const source = path.join(DRILL_STATE, sub)
    if (!fs.existsSync(source)) continue
    for (const name of fs.readdirSync(source)) {
      fs.copyFileSync(path.join(source, name), path.join(evidenceDir, `${sub}-${name}`))
    }
  }
  for (const scenario of Object.values(summary.scenarios)) {
    if (scenario.record && fs.existsSync(scenario.record)) {
      scenario.record = path.join(evidenceDir, `runs-${path.basename(scenario.record)}`)
    }
  }

  const latestPath = path.join(REAL_DRILLS, 'artifact-latest.json')
  const idPath = path.join(REAL_DRILLS, `${DRILL_ID}.json`)
  lib.writeJsonAtomic(latestPath, summary)
  lib.writeJsonAtomic(idPath, summary)
  try {
    lib.writeJsonAtomic(path.join(CHECKER_DIR, 'artifact-drills.json'), summary)
  } catch {
    /* mirror is best effort */
  }
  logLine(`\n[artifact-drill] passed=${summary.passed}`)
  console.log(JSON.stringify(summary, null, 2))
  fs.rmSync(BASE, {recursive: true, force: true})
  process.exit(summary.passed ? 0 : 3)
}

main().catch((error) => {
  if (activeSeed?.pid) {
    try {
      lib.killTree(activeSeed.pid, 'SIGKILL')
    } catch {
      /* ignore */
    }
  }
  console.error(`[artifact-drill] fatal: ${error?.stack || error}`)
  logLine(`[artifact-drill] fatal: ${error?.stack || error}`)
  fs.rmSync(BASE, {recursive: true, force: true})
  process.exit(3)
})
