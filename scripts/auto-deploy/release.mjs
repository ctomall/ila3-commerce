/**
 * Build an isolated release from a git object.
 *
 * Source, dependencies and build output live in one directory under
 * /home/pro/releases/mercato/<full-sha>. The development worktree is never
 * used as a build source, so uncommitted collaborator changes cannot leak
 * into a release.
 */
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {
  APP_DIR,
  FAILED_DIR,
  LOGS_DIR,
  RELEASE_ROOT,
  STATE_DIR,
  duBytes,
  duHuman,
  ensureDirs,
  git,
  gitOut,
  makeRunId,
  nowIso,
  readJson,
  resolveSha,
  runStreaming,
  sha256File,
  shortSha,
  tailLines,
  worktreeDirty,
  writeJsonAtomic,
} from './lib.mjs'

const ENV_FILES = ['.env', '.env.local', '.env.production']

function releasePaths(sha) {
  return {
    dir: path.join(RELEASE_ROOT, sha),
    manifest: path.join(RELEASE_ROOT, sha, 'release.json'),
  }
}

export function verifyRelease(dir, sha) {
  const manifest = readJson(path.join(dir, 'release.json'))
  if (!manifest || manifest.status !== 'ok' || manifest.sha !== sha) {
    return {ok: false, reason: 'release.json missing, failed or sha mismatch', manifest: manifest ?? null}
  }
  const stamp = readJson(path.join(dir, '.mercato', 'build-info.json'))
  const buildId = fs.existsSync(path.join(dir, '.mercato', 'next', 'BUILD_ID'))
  const ok = Boolean(stamp) && stamp.status === 'ok' && stamp.commit === shortSha(sha) && buildId
  return {
    ok,
    reason: ok ? null : `stamp=${stamp?.status}/${stamp?.commit} expected=${shortSha(sha)} buildId=${buildId}`,
    manifest,
    stamp,
  }
}

function envForBuild() {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_OPTIONS: '--max-old-space-size=6144',
    NEXT_PRIVATE_WORKER_THREADS: '2',
    CI: '1',
    YARN_ENABLE_TELEMETRY: '0',
  }
  delete env.OM_DIST_DIR
  delete env.PORT
  return env
}

function removeWorktree(dir) {
  if (!fs.existsSync(dir)) return
  const removed = git(['worktree', 'remove', '--force', dir], {timeout: 120000})
  if (removed.status !== 0) {
    fs.rmSync(dir, {recursive: true, force: true})
    git(['worktree', 'prune'], {timeout: 60000})
  }
}

function copyEnvFiles(releaseDir) {
  const copied = []
  for (const name of ENV_FILES) {
    const source = path.join(APP_DIR, name)
    if (!fs.existsSync(source)) continue
    const target = path.join(releaseDir, name)
    fs.copyFileSync(source, target)
    fs.chmodSync(target, 0o600)
    copied.push({name, bytes: fs.statSync(target).size, sha256: sha256File(target)})
  }
  return copied
}

function artifactManifest(releaseDir) {
  const dist = path.join(releaseDir, '.mercato', 'next')
  const entries = []
  if (fs.existsSync(dist)) {
    for (const entry of fs.readdirSync(dist, {withFileTypes: true})) {
      const full = path.join(dist, entry.name)
      entries.push({
        name: entry.name,
        type: entry.isDirectory() ? 'dir' : 'file',
        bytes: duBytes(full),
      })
    }
  }
  return {
    distDir: '.mercato/next',
    exists: fs.existsSync(path.join(dist, 'BUILD_ID')),
    totalBytes: duBytes(dist),
    totalHuman: duHuman(dist),
    entries: entries.sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0)),
    nodeModulesBytes: duBytes(path.join(releaseDir, 'node_modules')),
    nodeModulesHuman: duHuman(path.join(releaseDir, 'node_modules')),
  }
}

/**
 * Build or reuse a release. Returns {reused, dir, manifest}.
 * Throws an error with code release-build-failed on failure after writing
 * a diagnostic record under the state directory.
 */
export async function buildRelease({sha, force = false, timeoutMs = 3600000} = {}) {
  ensureDirs()
  const full = resolveSha(sha || 'HEAD')
  const {dir, manifest: manifestPath} = releasePaths(full)
  const runId = makeRunId(full, 'release')
  const releaseLog = path.join(LOGS_DIR, `${runId}-release.log`)

  if (!force) {
    const existing = verifyRelease(dir, full)
    if (existing.ok) {
      return {reused: true, dir, manifest: existing.manifest, runId, releaseLog}
    }
  }

  if (fs.existsSync(dir)) removeWorktree(dir)
  fs.mkdirSync(RELEASE_ROOT, {recursive: true})

  const add = await runStreaming({
    cmd: 'git',
    args: ['worktree', 'add', '--detach', dir, full],
    cwd: APP_DIR,
    timeoutMs: 120000,
    logPath: releaseLog,
    label: 'worktree-add',
    echo: true,
  })
  if (add.status !== 0) {
    const failure = {schema: 1, status: 'failed', stage: 'worktree-add', sha: full, runId, at: nowIso(), tail: add.tail, log: releaseLog}
    writeJsonAtomic(path.join(FAILED_DIR, `${full}-${runId}.json`), failure)
    throw Object.assign(new Error(`git worktree add failed: ${add.tail}`), {code: 'release-build-failed', detail: failure})
  }

  const envFiles = copyEnvFiles(dir)
  const dirty = worktreeDirty()
  const dirtyFiles = dirty ? gitOut(['status', '--porcelain']).split('\n').filter(Boolean) : []
  const buildEnv = envForBuild()

  const installLog = path.join(LOGS_DIR, `${runId}-install.log`)
  const install = await runStreaming({
    cmd: 'nice',
    args: ['-n', '10', 'yarn', 'install', '--frozen-lockfile'],
    cwd: dir,
    env: buildEnv,
    timeoutMs: 1800000,
    logPath: installLog,
    label: 'yarn-install',
    echo: true,
    filter: /(error|Error|warn|Warning|Done|done|success|Success|failed|Failed|➤|YN0000|YN0001)/,
  })
  if (install.status !== 0) {
    const failure = {
      schema: 1,
      status: 'failed',
      stage: 'install',
      sha: full,
      runId,
      at: nowIso(),
      command: 'yarn install --frozen-lockfile',
      tail: tailLines(install.tail, 80),
      log: installLog,
      releaseLog,
    }
    writeJsonAtomic(path.join(FAILED_DIR, `${full}-${runId}.json`), failure)
    removeWorktree(dir)
    throw Object.assign(new Error(`yarn install failed: ${tailLines(install.tail, 20)}`), {code: 'release-build-failed', detail: failure})
  }

  const buildLog = path.join(LOGS_DIR, `${runId}-build.log`)
  const build = await runStreaming({
    cmd: 'nice',
    args: ['-n', '10', 'yarn', 'build'],
    cwd: dir,
    env: buildEnv,
    timeoutMs,
    logPath: buildLog,
    label: 'yarn-build',
    echo: true,
    filter: /(error|Error|⨯|✓|Compiled|Creating an optimized|Failed|failed|warn|Warning|Done|ready|Ready|Route|First Load|Skipping|Skipped|success|Success|patched|Patch|generate|Generate|●|○|ƒ|λ)/,
  })
  if (build.status !== 0) {
    const failure = {
      schema: 1,
      status: 'failed',
      stage: 'build',
      sha: full,
      runId,
      at: nowIso(),
      command: 'yarn build',
      timedOut: build.timedOut,
      tail: tailLines(build.tail, 100),
      log: buildLog,
      releaseLog,
    }
    writeJsonAtomic(path.join(FAILED_DIR, `${full}-${runId}.json`), failure)
    removeWorktree(dir)
    throw Object.assign(new Error(`yarn build failed: ${tailLines(build.tail, 20)}`), {code: 'release-build-failed', detail: failure})
  }

  const stamp = readJson(path.join(dir, '.mercato', 'build-info.json'))
  const buildIdPath = path.join(dir, '.mercato', 'next', 'BUILD_ID')
  if (!stamp || stamp.status !== 'ok' || stamp.commit !== shortSha(full) || !fs.existsSync(buildIdPath)) {
    const failure = {
      schema: 1,
      status: 'failed',
      stage: 'verify-stamp',
      sha: full,
      runId,
      at: nowIso(),
      stamp,
      buildId: fs.existsSync(buildIdPath),
      tail: tailLines(build.tail, 60),
      log: buildLog,
    }
    writeJsonAtomic(path.join(FAILED_DIR, `${full}-${runId}.json`), failure)
    removeWorktree(dir)
    throw Object.assign(new Error(`build stamp verification failed: ${JSON.stringify(failure)}`), {
      code: 'release-build-failed',
      detail: failure,
    })
  }

  const pkg = readJson(path.join(dir, 'package.json'), {})
  const manifest = {
    schema: 1,
    status: 'ok',
    sha: full,
    shortSha: shortSha(full),
    version: pkg.version ?? null,
    createdAt: nowIso(),
    source: {
      method: 'git-worktree',
      command: `git worktree add --detach ${dir} ${full}`,
      commit: full,
      devWorktreeDirty: dirty,
      devWorktreeDirtyFileCount: dirtyFiles.length,
      devWorktreeDirtyFiles: dirtyFiles.slice(0, 30),
      note: 'The release is materialised from the git object. Dirty development files are recorded for audit only and are not copied.',
    },
    envFiles,
    commands: {
      install: 'yarn install --frozen-lockfile',
      build: 'nice -n 10 yarn build',
      buildHeap: '--max-old-space-size=6144',
    },
    logs: {release: releaseLog, install: installLog, build: buildLog},
    install: {ms: install.ms, status: install.status, tail: tailLines(install.tail, 40)},
    build: {ms: build.ms, status: build.status, timedOut: build.timedOut, tail: tailLines(build.tail, 80)},
    buildInfo: stamp,
    artifact: artifactManifest(dir),
  }
  writeJsonAtomic(manifestPath, manifest)
  return {reused: false, dir, manifest, runId, releaseLog}
}

async function main() {
  const argv = process.argv.slice(2)
  let sha = null
  let force = false
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--sha') sha = argv[++i]
    else if (argv[i] === '--force') force = true
  }
  const result = await buildRelease({sha, force})
  console.log(
    JSON.stringify(
      {
        ok: true,
        reused: result.reused,
        sha: result.manifest.sha,
        dir: result.dir,
        artifactBytes: result.manifest.artifact.totalBytes,
        artifactHuman: result.manifest.artifact.totalHuman,
        buildInfo: result.manifest.buildInfo,
        logs: result.manifest.logs,
      },
      null,
      2,
    ),
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`[release] fatal: ${error?.message || error}`)
    if (error?.detail) console.error(JSON.stringify(error.detail, null, 2))
    process.exit(3)
  })
}
