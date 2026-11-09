/**
 * Shared runtime helpers for the isolated auto-deploy executor.
 *
 * Design constraints (see docs/deployment/auto-deploy.md):
 *  - Source is always materialised from a git object, never from the dirty dev tree.
 *  - Every deploy entry point (timer and manual) takes the same flock.
 *  - Evidence is written outside the app tree under the runtime state directory.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import {spawn, spawnSync} from 'node:child_process'

export const APP_DIR = process.env.ILA3_APP_DIR || '/home/pro/apps/mercato'
// On a CI runner there is no /home/pro: packaging runs there and used to die with
// EACCES: mkdir '/home/pro/releases/mercato'. The runner gets a temporary root; the
// deployment host keeps the real one.
export const RELEASE_ROOT =
  process.env.ILA3_RELEASE_ROOT ||
  (process.env.CI ? path.join(os.tmpdir(), 'ila3-releases') : '/home/pro/releases/mercato')
export const STATE_DIR = process.env.ILA3_STATE_DIR || '/home/pro/.local/state/ila3-deploy'
export const LOCK_PATH = process.env.ILA3_LOCK_PATH || path.join(STATE_DIR, 'deploy.lock')
export const CHECKER_STATE_DIR = path.join(APP_DIR, '.mercato', 'auto-deploy')
export const RUNS_DIR = path.join(STATE_DIR, 'runs')
export const LOGS_DIR = path.join(STATE_DIR, 'logs')
export const DRILLS_DIR = path.join(STATE_DIR, 'drills')
export const GATES_DIR = path.join(STATE_DIR, 'gates')
export const FAILED_DIR = path.join(STATE_DIR, 'failed')
export const ACTIVE_FILE = path.join(STATE_DIR, 'active.json')
export const CURRENT_LINK = path.join(RELEASE_ROOT, 'current')
export const PREVIOUS_LINK = path.join(RELEASE_ROOT, 'previous')

export function ensureDirs() {
  for (const dir of [RELEASE_ROOT, STATE_DIR, RUNS_DIR, LOGS_DIR, DRILLS_DIR, GATES_DIR, FAILED_DIR, CHECKER_STATE_DIR]) {
    fs.mkdirSync(dir, {recursive: true})
  }
}

export function nowIso() {
  return new Date().toISOString()
}

export function makeRunId(sha = 'nosha', prefix = 'run') {
  const stamp = nowIso().replace(/[-:.TZ]/g, '').slice(0, 14)
  return `${prefix}-${stamp}-${String(sha).slice(0, 8)}`
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

export function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true})
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(tmp, file)
}

export function appendLine(file, line) {
  fs.mkdirSync(path.dirname(file), {recursive: true})
  fs.appendFileSync(file, line.endsWith('\n') ? line : `${line}\n`)
}

export function sha256File(file) {
  const hash = crypto.createHash('sha256')
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(1024 * 1024)
    let n
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n))
  } finally {
    fs.closeSync(fd)
  }
  return hash.digest('hex')
}

export function sha256Text(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}

export function tailLines(text, n = 40) {
  return String(text ?? '').split(/\r?\n/).slice(-n).join('\n')
}

export function git(args, opts = {}) {
  return spawnSync('git', args, {
    cwd: opts.cwd || APP_DIR,
    encoding: 'utf8',
    timeout: opts.timeout || 30000,
    env: opts.env || process.env,
  })
}

export function gitOut(args, opts = {}) {
  const result = git(args, opts)
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed (${result.status}): ${(result.stderr || result.stdout || '').trim()}`)
  }
  return result.stdout.trim()
}

export function resolveSha(ref = 'HEAD') {
  return gitOut(['rev-parse', '--verify', `${ref}^{commit}`])
}

export function shortSha(sha) {
  return String(sha).slice(0, 8)
}

export function worktreeDirty() {
  try {
    return gitOut(['status', '--porcelain']).length > 0
  } catch {
    return null
  }
}

export function parseRemoteSlug() {
  const url = gitOut(['remote', 'get-url', 'origin'])
  const match = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (!match) throw new Error(`cannot derive GitHub owner/repo from origin ${url}`)
  return `${match[1]}/${match[2]}`
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function pidAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Kill the process group started with detached:true, falling back to the pid. */
export function killTree(pid, signal = 'SIGTERM') {
  if (!pid) return
  try {
    process.kill(-pid, signal)
    return
  } catch {
    /* fall through */
  }
  try {
    process.kill(pid, signal)
  } catch {
    /* already gone */
  }
}

export async function waitExit(pid, timeoutMs = 10000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (!pidAlive(pid)) return true
    await sleep(200)
  }
  return !pidAlive(pid)
}

/**
 * Run a command with a hard timeout and a bounded in-memory tail.
 * Full output is appended to logPath. `echo` mirrors matching lines to stdout.
 */
export function runStreaming({
  cmd,
  args = [],
  cwd = APP_DIR,
  env = process.env,
  timeoutMs = 1800000,
  logPath = null,
  label = cmd,
  echo = false,
  filter = null,
  maxTailLines = 160,
}) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const fd = logPath ? fs.openSync(logPath, 'a') : null
    const header = `\n[${nowIso()}] [${label}] $ ${cmd} ${args.join(' ')}\n`
    if (fd) fs.writeSync(fd, header)
    if (echo) process.stdout.write(header)

    let child
    try {
      child = spawn(cmd, args, {cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe']})
    } catch (error) {
      if (fd) fs.closeSync(fd)
      resolve({status: null, signal: null, timedOut: false, ms: 0, tail: String(error), logPath})
      return
    }

    const lines = []
    let timedOut = false
    let settled = false

    const push = (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (!line) continue
        lines.push(line)
        if (lines.length > 400) lines.shift()
        if (fd) fs.writeSync(fd, `${line}\n`)
        if (echo && (!filter || filter.test(line))) process.stdout.write(`${line}\n`)
      }
    }
    child.stdout.on('data', push)
    child.stderr.on('data', push)

    const timer = setTimeout(() => {
      timedOut = true
      push(`[timeout] ${label} exceeded ${timeoutMs}ms; terminating process group`)
      killTree(child.pid, 'SIGTERM')
      setTimeout(() => killTree(child.pid, 'SIGKILL'), 10000).unref()
    }, timeoutMs)
    timer.unref?.()

    const finish = (status, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const tail = lines.slice(-maxTailLines).join('\n')
      const footer = `[${label}] exit=${status} signal=${signal || ''} ms=${Date.now() - startedAt}${timedOut ? ' (timeout)' : ''}\n`
      if (fd) {
        fs.writeSync(fd, footer)
        fs.closeSync(fd)
      }
      if (echo) process.stdout.write(footer)
      resolve({status, signal, timedOut, ms: Date.now() - startedAt, tail, logPath})
    }

    child.on('error', (error) => {
      push(`[spawn-error] ${error.message}`)
      finish(null, null)
    })
    child.on('close', (code, signal) => finish(code, signal))
  })
}

export function duBytes(target) {
  const result = spawnSync('du', ['-sb', target], {encoding: 'utf8', timeout: 120000})
  if (result.status !== 0) return null
  const value = Number(String(result.stdout).split(/\s+/)[0])
  return Number.isFinite(value) ? value : null
}

export function duHuman(target) {
  const result = spawnSync('du', ['-sh', target], {encoding: 'utf8', timeout: 120000})
  if (result.status !== 0) return null
  return String(result.stdout).split(/\s+/)[0]
}

/** A release directory is named by its full 40-hex commit sha; nothing else is a prune candidate. */
const RELEASE_DIR_RE = /^[0-9a-f]{40}$/

function resolveLinkTarget(link) {
  const raw = readLink(link)
  if (!raw) return null
  return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(path.dirname(link), raw)
}

/**
 * Release directories still referenced by a symlink, which must survive pruning.
 * At most two: the release `current` is running and the one `previous` rolls back to.
 */
export function protectedReleases({root = RELEASE_ROOT, currentLink, previousLink} = {}) {
  const keep = new Set()
  for (const link of [currentLink || path.join(root, 'current'), previousLink || path.join(root, 'previous')]) {
    const target = resolveLinkTarget(link)
    if (target) keep.add(target)
  }
  return keep
}

/** First pid whose cwd is inside `dir`, or null. Guards against deleting a release in use. */
function releaseInUse(dir) {
  let entries
  try {
    entries = fs.readdirSync('/proc')
  } catch {
    return null // no /proc (non-Linux host): skip the guard instead of refusing to prune
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue
    let cwd
    try {
      cwd = fs.readlinkSync(`/proc/${entry}/cwd`)
    } catch {
      continue // process exited, or cwd is not readable for this user
    }
    if (cwd === dir || cwd.startsWith(`${dir}${path.sep}`)) return entry
  }
  return null
}

function pruneGitWorktrees() {
  try {
    spawnSync('git', ['-C', APP_DIR, 'worktree', 'prune'], {encoding: 'utf8', timeout: 60000})
  } catch {
    /* best effort: a stale worktree registration is harmless next to a full disk */
  }
}

/**
 * Delete release directories that neither `current` nor `previous` points at.
 *
 * Every release is a full copy of node_modules plus the .mercato build output
 * (about 4.2G for this app) and the 15-minute timer puts no other bound on how
 * many accumulate, so without this the root volume fills up and PostgreSQL
 * starts failing writes. Only 40-hex directories directly under `root` are
 * candidates: the symlinks, release.json evidence and unrelated files are never
 * touched, and a directory a live process still has as its cwd is skipped.
 */
export function pruneReleases({root = RELEASE_ROOT, dryRun = false, extraKeep = []} = {}) {
  const keep = protectedReleases({root})
  for (const dir of extraKeep) keep.add(path.resolve(dir))
  const removed = []
  const skipped = []
  let freedBytes = 0
  let candidates = 0

  let entries
  try {
    entries = fs.readdirSync(root, {withFileTypes: true})
  } catch {
    return {removed, skipped, freedBytes, candidates}
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !RELEASE_DIR_RE.test(entry.name)) continue
    candidates += 1
    const dir = path.join(root, entry.name)
    if (keep.has(path.resolve(dir))) {
      skipped.push({name: entry.name, reason: 'current-or-previous'})
      continue
    }
    const pid = releaseInUse(path.resolve(dir))
    if (pid) {
      skipped.push({name: entry.name, reason: `in-use-by-pid-${pid}`})
      continue
    }
    const bytes = duBytes(dir) ?? 0
    if (!dryRun) {
      fs.rmSync(dir, {recursive: true, force: true})
      if (path.resolve(root) === path.resolve(RELEASE_ROOT)) pruneGitWorktrees()
    }
    freedBytes += bytes
    removed.push({name: entry.name, bytes})
  }

  return {removed, skipped, freedBytes, candidates}
}

export function readLink(link) {
  try {
    return fs.readlinkSync(link)
  } catch {
    return null
  }
}

/** Atomic symlink replacement: create a temp link then rename over the target. */
export function atomicSymlink(target, link) {
  fs.mkdirSync(path.dirname(link), {recursive: true})
  const tmp = `${link}.tmp-${process.pid}-${Date.now()}`
  try {
    fs.unlinkSync(tmp)
  } catch {
    /* nothing to clean */
  }
  fs.symlinkSync(target, tmp)
  fs.renameSync(tmp, link)
}

export async function httpGet(url, {timeoutMs = 5000} = {}) {
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {'user-agent': 'ila3-auto-deploy/1.0'},
    })
    const location = response.headers.get('location') || ''
    await response.body?.cancel?.().catch(() => undefined)
    return {ok: true, status: response.status, location}
  } catch (error) {
    return {ok: false, status: null, location: '', error: String(error?.message || error)}
  }
}

export async function followRedirects(startUrl, {max = 5, timeoutMs = 5000} = {}) {
  const hops = []
  let current = startUrl
  for (let i = 0; i <= max; i += 1) {
    const response = await httpGet(current, {timeoutMs})
    hops.push({url: current, status: response.status, location: response.location, error: response.error})
    if (!response.ok) return {ok: false, hops, error: response.error}
    if (response.status >= 300 && response.status < 400 && response.location) {
      current = new URL(response.location, current).href
      continue
    }
    return {ok: true, hops, final: {url: current, status: response.status}}
  }
  return {ok: false, hops, error: 'too-many-redirects'}
}

export function persistRun(record) {
  ensureDirs()
  const file = path.join(RUNS_DIR, `${record.runId}.json`)
  writeJsonAtomic(file, record)
  writeJsonAtomic(path.join(STATE_DIR, 'latest.json'), record)
  writeJsonAtomic(path.join(CHECKER_STATE_DIR, 'last-run.json'), record)
  appendLine(
    path.join(STATE_DIR, 'runs.jsonl'),
    JSON.stringify({
      runId: record.runId,
      entry: record.entry,
      result: record.result,
      sha: record.sha,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
    }),
  )
  return file
}

/**
 * Re-exec the given script under `flock -n <LOCK_PATH>`.
 * Both the timer entry and the manual entry call this, so they share one lock.
 * A held lock exits 75 immediately with a machine-readable reason.
 */
export function enforceFlock(scriptPath, argv) {
  if (process.env.ILA3_DEPLOY_LOCKED === '1') return
  ensureDirs()
  const result = spawnSync('flock', ['-n', LOCK_PATH, process.execPath, scriptPath, ...argv], {
    stdio: 'inherit',
    env: {...process.env, ILA3_DEPLOY_LOCKED: '1'},
  })
  if (result.status === 1) {
    console.error(
      JSON.stringify(
        {
          status: 'locked-out',
          lock: LOCK_PATH,
          reason: 'another deploy run (timer or manual) currently holds the lock',
          entry: process.env.ILA3_DEPLOY_ENTRY || 'unknown',
          at: nowIso(),
        },
        null,
        2,
      ),
    )
    process.exit(75)
  }
  process.exit(result.status ?? 1)
}
