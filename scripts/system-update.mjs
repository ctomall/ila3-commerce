#!/usr/bin/env node
/**
 * Self-update runner for the ILA3 Commerce deployment.
 *
 * Runs as root from a transient one-shot systemd unit (ila3-self-update.service),
 * NOT as a child of the web process — mercato.service uses KillMode=control-group,
 * so anything spawned inside its cgroup would be killed by the restart that this
 * very process performs.
 *
 * Contract:
 *   in : .mercato/system-update/request.json  { ref?, force?, actor?, requestedAt? }
 *   out: .mercato/system-update/state.json    { status, step, fromCommit, ... }
 *        .mercato/system-update/update.log
 *
 * Safety:
 *   - refuses to run when the work tree is dirty (unless force=true)
 *   - always tags pre-update-<timestamp> before touching HEAD
 *   - rebuilds and health-checks; on any failure it resets to the previous
 *     commit, rebuilds and restarts, then reports status "rolled-back"
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const APP_DIR = process.env.ILA3_APP_DIR?.trim() || process.cwd()
const STATE_DIR = path.join(APP_DIR, '.mercato', 'system-update')
const STATE_FILE = path.join(STATE_DIR, 'state.json')
const REQUEST_FILE = path.join(STATE_DIR, 'request.json')
const LOG_FILE = path.join(STATE_DIR, 'update.log')
const HEALTH_URL = `http://127.0.0.1:${process.env.PORT?.trim() || '3000'}/login`
const SERVICE = 'mercato.service'

fs.mkdirSync(STATE_DIR, { recursive: true })

const state = {
  status: 'running',
  step: 'starting',
  startedAt: new Date().toISOString(),
  finishedAt: null,
  fromCommit: null,
  toCommit: null,
  message: null,
  actor: null,
  logFile: LOG_FILE,
}

function persist() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', { mode: 0o644 })
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  fs.appendFileSync(LOG_FILE, line)
  process.stdout.write(line)
}

function step(name) {
  state.step = name
  persist()
  log(`==> ${name}`)
}

function run(command, args, options = {}) {
  log(`$ ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: APP_DIR,
    stdio: 'inherit',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', CI: '1' },
    ...options,
  })
  if (result.status !== 0) {
    throw new Error(`command failed (exit ${result.status}): ${command} ${args.join(' ')}`)
  }
  return result
}

function git(args) {
  const result = spawnSync('git', args, { cwd: APP_DIR, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr?.trim()}`)
  return result.stdout.trim()
}

function readRequest() {
  try {
    return JSON.parse(fs.readFileSync(REQUEST_FILE, 'utf8'))
  } catch {
    return {}
  }
}

async function waitForHealth(timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const probe = spawnSync(
      'curl',
      ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '5', HEALTH_URL],
      { encoding: 'utf8' },
    )
    if (probe.status === 0 && String(probe.stdout).trim() === '200') {
      log(`health check passed: ${HEALTH_URL} -> 200`)
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  return false
}

function restartService(action) {
  // The unit runs as the deployment user so build output stays owned by it;
  // service control therefore goes through sudo (narrow rule in
  // /etc/sudoers.d/90-ila3-self-update).
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    run('systemctl', [action, SERVICE])
    return
  }
  run('sudo', ['-n', 'systemctl', action, SERVICE])
}

function buildArtifacts(label) {
  step(`${label}: yarn install`)
  run('yarn', ['install'])
  step(`${label}: yarn generate`)
  run('yarn', ['generate'])
  step(`${label}: yarn build`)
  run('yarn', ['build'])
}

async function main() {
  const request = readRequest()
  state.actor = typeof request.actor === 'string' ? request.actor : 'system'
  persist()

  const force = request.force === true
  const requestedRef = typeof request.ref === 'string' ? request.ref.trim() : ''
  log(`self-update start (actor=${state.actor}, ref=${requestedRef || 'origin/HEAD'}, force=${force})`)

  // 0. preconditions
  step('preflight')
  if (!fs.existsSync(path.join(APP_DIR, '.git'))) throw new Error(`not a git repository: ${APP_DIR}`)
  const remote = git(['remote', 'get-url', 'origin'])
  log(`origin: ${remote}`)
  state.fromCommit = git(['rev-parse', 'HEAD'])
  persist()

  const dirty = git(['status', '--porcelain'])
  if (dirty && !force) {
    throw new Error(`work tree is dirty (${dirty.split('\n').length} path(s)); re-run with force=true or commit first`)
  }

  // 1. fetch
  step('git fetch')
  run('git', ['fetch', '--prune', '--tags', 'origin'])

  const branch = request.branch?.trim() || git(['rev-parse', '--abbrev-ref', 'HEAD'])
  const target = requestedRef || `origin/${branch}`
  state.toCommit = git(['rev-parse', target])
  persist()
  log(`target ${target} -> ${state.toCommit}`)

  if (state.toCommit === state.fromCommit) {
    state.status = 'succeeded'
    state.step = 'no-op'
    state.message = 'already up to date'
    state.finishedAt = new Date().toISOString()
    persist()
    log('already up to date, nothing to do')
    return
  }

  // 2. safety tag
  const tag = `pre-update-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`
  step(`tag ${tag}`)
  run('git', ['tag', '-f', tag, state.fromCommit])

  // 3. stop, update, build, start
  step(`stop ${SERVICE}`)
  restartService('stop')

  run('git', ['reset', '--hard', state.toCommit])
  buildArtifacts('build')

  step(`start ${SERVICE}`)
  restartService('start')

  step('health check')
  const healthy = await waitForHealth()
  if (!healthy) throw new Error('health check did not pass within 180s')

  state.status = 'succeeded'
  state.step = 'done'
  state.message = `${state.fromCommit.slice(0, 8)} -> ${state.toCommit.slice(0, 8)} (tag ${tag})`
  state.finishedAt = new Date().toISOString()
  persist()
  log(`self-update succeeded: ${state.message}`)
}

async function rollback(reason) {
  const previous = state.fromCommit
  if (!previous) {
    state.status = 'failed'
    state.message = `no rollback point: ${reason}`
    state.finishedAt = new Date().toISOString()
    persist()
    log(`ROLLBACK SKIPPED: ${reason}`)
    return
  }
  try {
    log(`rollback start -> ${previous}`)
    step('rollback: git reset')
    run('git', ['reset', '--hard', previous])
    step('rollback: rebuild')
    buildArtifacts('rollback build')
    step('rollback: restart')
    restartService('start')
    const healthy = await waitForHealth(120_000)
    state.status = 'rolled-back'
    state.finishedAt = new Date().toISOString()
    state.message = `failed: ${reason}; rolled back to ${previous.slice(0, 8)}${healthy ? '' : ' (health check still failing)'}`
    persist()
    log(`rollback finished: ${state.message}`)
  } catch (rollbackError) {
    state.status = 'failed'
    state.finishedAt = new Date().toISOString()
    state.message = `failed: ${reason}; ROLLBACK ALSO FAILED: ${rollbackError.message}`
    persist()
    log(`ROLLBACK FAILED: ${rollbackError.message}`)
  }
}

try {
  await main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  log(`ERROR: ${message}`)
  // Keep the service up even when we fail before stopping it.
  await rollback(message)
  process.exitCode = 1
}
