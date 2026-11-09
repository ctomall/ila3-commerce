/**
 * Candidate / active health checks for an isolated release.
 *
 * Required checks (docs/deployment/auto-deploy.md):
 *  - process alive
 *  - GET /login == 200
 *  - GET /backend unauthenticated is a redirect chain ending at /login (200)
 *  - .mercato/build-info.json status=ok and commit == target SHA
 */
import fs from 'node:fs'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {
  LOGS_DIR,
  STATE_DIR,
  ensureDirs,
  followRedirects,
  httpGet,
  killTree,
  nowIso,
  pidAlive,
  readJson,
  sleep,
  tailLines,
  writeJsonAtomic,
} from './lib.mjs'

export function verifyBuildStamp(releaseDir, sha) {
  const stampPath = path.join(releaseDir, '.mercato', 'build-info.json')
  const buildIdPath = path.join(releaseDir, '.mercato', 'next', 'BUILD_ID')
  const stamp = readJson(stampPath)
  const expected = String(sha).slice(0, 8)
  const buildId = fs.existsSync(buildIdPath)
  const ok = Boolean(stamp) && stamp.status === 'ok' && stamp.commit === expected && buildId
  return {
    ok,
    expected,
    commit: stamp?.commit ?? null,
    status: stamp?.status ?? null,
    builtAt: stamp?.builtAt ?? null,
    treeDigest: stamp?.treeDigest ?? null,
    buildId,
    detail: `commit=${stamp?.commit ?? '(missing)'} expected=${expected} status=${stamp?.status ?? '(missing)'} buildId=${buildId}`,
  }
}

async function waitForLogin(port, timeoutMs, child) {
  const startedAt = Date.now()
  let lastError = null
  while (Date.now() - startedAt < timeoutMs) {
    if (child && child.exitCode !== null) {
      return {ok: false, startedAt, error: `candidate exited early with code ${child.exitCode}`}
    }
    const response = await httpGet(`http://127.0.0.1:${port}/login`, {timeoutMs: 3000})
    if (response.ok && response.status === 200) return {ok: true, startedAt, status: 200}
    lastError = response.error || `HTTP ${response.status ?? 'none'}`
    await sleep(1000)
  }
  return {ok: false, startedAt, error: lastError || `timed out after ${timeoutMs}ms`}
}

async function evaluateChecks({port, releaseDir, sha, login, startedAt, child = null}) {
  const checks = []
  checks.push({
    name: 'process-alive',
    ok: child ? child.exitCode === null && pidAlive(child.pid) : true,
    detail: child ? `pid=${child.pid} exitCode=${child.exitCode}` : 'external process (checked via HTTP)',
  })
  checks.push({
    name: 'login-200',
    ok: Boolean(login?.ok),
    detail: login?.ok ? `HTTP 200 in ${Date.now() - startedAt}ms` : String(login?.error || 'not ready'),
  })

  if (login?.ok) {
    const initial = await httpGet(`http://127.0.0.1:${port}/backend`, {timeoutMs: 5000})
    const chain = await followRedirects(`http://127.0.0.1:${port}/backend`, {max: 5, timeoutMs: 5000})
    let finalPath = ''
    try {
      finalPath = chain.final ? new URL(chain.final.url).pathname : ''
    } catch {
      finalPath = ''
    }
    const ok =
      initial.ok &&
      initial.status >= 300 &&
      initial.status < 400 &&
      chain.ok &&
      Boolean(chain.final) &&
      chain.final.status === 200 &&
      finalPath.startsWith('/login')
    checks.push({
      name: 'backend-redirects-to-login',
      ok,
      detail: JSON.stringify({
        initial: initial.status,
        location: initial.location,
        hops: chain.hops.map((hop) => `${hop.status} ${hop.url}`),
        final: chain.final,
      }),
    })
  } else {
    checks.push({name: 'backend-redirects-to-login', ok: false, detail: 'skipped: /login not ready'})
  }

  const stamp = verifyBuildStamp(releaseDir, sha)
  checks.push({name: 'build-stamp-commit', ok: stamp.ok, detail: stamp.detail})
  return {ok: checks.every((check) => check.ok), checks, stamp}
}

/**
 * Start a candidate from an isolated release and run the health checks.
 * keep=false always terminates the candidate, including on failure.
 */
export async function checkRelease({
  releaseDir,
  port,
  checkPort = port,
  sha,
  timeoutMs = 120000,
  keep = false,
  logPath = null,
}) {
  ensureDirs()
  const log = logPath || path.join(LOGS_DIR, `health-${Date.now()}-${port}.log`)
  const nextBin = path.join(releaseDir, 'node_modules', 'next', 'dist', 'bin', 'next')
  if (!fs.existsSync(nextBin)) {
    return {ok: false, checks: [{name: 'next-binary', ok: false, detail: nextBin}], log, pid: null, port, checkPort}
  }

  const fd = fs.openSync(log, 'a')
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    NEXT_TELEMETRY_DISABLED: '1',
  }
  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: releaseDir,
    env,
    detached: true,
    stdio: ['ignore', fd, fd],
  })

  let exitInfo = null
  child.on('exit', (code, signal) => {
    exitInfo = {code, signal, at: nowIso()}
  })

  const startedAt = Date.now()
  const login = await waitForLogin(checkPort, timeoutMs, child)
  const checks = await evaluateChecks({port: checkPort, releaseDir, sha, login, startedAt, child})
  const result = {
    ok: checks.ok,
    pid: child.pid,
    port,
    checkPort,
    checks: checks.checks,
    stamp: checks.stamp,
    log,
    exitInfo,
    startedAt: new Date(startedAt).toISOString(),
    waitedMs: Date.now() - startedAt,
  }

  if (keep && checks.ok) {
    fs.closeSync(fd)
    return result
  }

  killTree(child.pid, 'SIGTERM')
  await sleep(1500)
  if (pidAlive(child.pid)) killTree(child.pid, 'SIGKILL')
  await sleep(500)
  fs.closeSync(fd)
  result.cleanedUp = true
  result.tail = tailLines(safeRead(log), 40)
  return result
}

/** Health checks against an already-running server (no spawn, no kill). */
export async function checkRunning({port, releaseDir, sha, timeoutMs = 60000}) {
  const startedAt = Date.now()
  const login = await waitForLogin(port, timeoutMs, null)
  const checks = await evaluateChecks({port, releaseDir, sha, login, startedAt, child: null})
  return {
    ok: checks.ok,
    port,
    checks: checks.checks,
    stamp: checks.stamp,
    waitedMs: Date.now() - startedAt,
  }
}

function safeRead(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const args = {port: 3100, checkPort: null, timeoutMs: 120000, keep: false, releaseDir: null, sha: null, json: false}
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i + 1]
    if (argv[i] === '--port') args.port = Number(argv[++i])
    else if (argv[i] === '--check-port') args.checkPort = Number(argv[++i])
    else if (argv[i] === '--timeout') args.timeoutMs = Number(argv[++i])
    else if (argv[i] === '--release') args.releaseDir = argv[++i]
    else if (argv[i] === '--sha') args.sha = argv[++i]
    else if (argv[i] === '--keep') args.keep = true
    else if (argv[i] === '--json') args.json = true
  }
  if (!args.releaseDir) throw new Error('--release <dir> is required')
  args.checkPort = args.checkPort ?? args.port
  const sha = args.sha || readJson(path.join(args.releaseDir, 'release.json'))?.sha
  if (!sha) throw new Error('--sha is required when release.json has no sha')
  const result = await checkRelease({...args, sha, logPath: path.join(STATE_DIR, 'logs', `health-cli-${Date.now()}.log`)})
  writeJsonAtomic(path.join(STATE_DIR, 'last-health.json'), result)
  if (args.json) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(`[health] ok=${result.ok} port=${result.port} checkPort=${result.checkPort} pid=${result.pid}`)
    for (const check of result.checks) console.log(`[health] ${check.ok ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`)
    console.log(`[health] log=${result.log}`)
  }
  process.exit(result.ok ? 0 : 2)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`[health] fatal: ${error?.stack || error}`)
    process.exit(3)
  })
}
