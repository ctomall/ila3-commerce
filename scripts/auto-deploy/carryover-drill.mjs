/**
 * Drill: a successful cutover must move leftover queue jobs from the running
 * release into the new one.
 *
 * Production's QUEUE_BASE_DIR is cwd-relative, so the new release starts with an
 * empty queue. The old release carries one READY job, the drain gate times out
 * (timeout 0) and records it, the switch succeeds, and the carryover stage must
 * move that job into the new release's queue directory.
 *
 * Synthetic fixtures only: no install, no DB, no production paths. Ports 3218 /
 * 3118 are non-production; the drill kills the started process afterwards.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'mercato-carryover-drill-'))
const RELEASES = path.join(BASE, 'releases')
const STATE = path.join(BASE, 'state')
const OLD_SHA = spawnSync('git', ['rev-parse', 'HEAD~1'], {cwd: REPO, encoding: 'utf8'}).stdout.trim()
const NEW_SHA = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: REPO, encoding: 'utf8'}).stdout.trim()
const PORT = 3218
const CANDIDATE_PORT = 3118

const FAKE_NEXT = `const http = require('node:http')
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

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), {recursive: true})
  fs.writeFileSync(file, contents)
}

function makeRelease(dir, sha) {
  fs.rmSync(dir, {recursive: true, force: true})
  write(path.join(dir, 'package.json'), JSON.stringify({name: 'carryover-drill', version: '0.0.0'}))
  write(path.join(dir, 'release.json'), JSON.stringify({schema: 1, status: 'ok', sha, shortSha: sha.slice(0, 8)}))
  write(
    path.join(dir, '.mercato', 'build-info.json'),
    JSON.stringify({status: 'ok', commit: sha.slice(0, 8), version: '0.0.0'}),
  )
  write(path.join(dir, '.mercato', 'next', 'BUILD_ID'), 'carryover-drill\n')
  write(path.join(dir, 'node_modules', 'next', 'dist', 'bin', 'next'), FAKE_NEXT)
  fs.chmodSync(path.join(dir, 'node_modules', 'next', 'dist', 'bin', 'next'), 0o755)
  return dir
}

const oldDir = makeRelease(path.join(RELEASES, OLD_SHA), OLD_SHA)
const newDir = makeRelease(path.join(RELEASES, NEW_SHA), NEW_SHA)
const oldQueue = path.join(oldDir, '.mercato', 'queue', 'communication-channels-outbound')
fs.mkdirSync(oldQueue, {recursive: true})
fs.writeFileSync(path.join(oldQueue, 'queue.json'), JSON.stringify([{id: 'job-leftover', payload: {messageId: 'm1'}}]))
fs.symlinkSync(oldDir, path.join(RELEASES, 'current'))

const run = spawnSync(
  process.execPath,
  [
    path.join(REPO, 'scripts', 'auto-deploy', 'deploy.mjs'),
    '--drill', '--pid-mode', '--skip-ci-gate', '--json',
    '--release-dir', newDir,
    '--sha', NEW_SHA,
    '--target-port', String(PORT),
    '--candidate-port', String(CANDIDATE_PORT),
    '--drain-timeout-ms', '0',
  ],
  {
    cwd: REPO,
    encoding: 'utf8',
    env: {
      ...process.env,
      ILA3_RELEASE_ROOT: RELEASES,
      ILA3_STATE_DIR: STATE,
      ILA3_APP_DIR: REPO,
      ILA3_LOCK_PATH: path.join(STATE, 'deploy.lock'),
    },
    timeout: 300000,
  },
)

let summary = null
try {
  summary = JSON.parse(run.stdout.slice(run.stdout.indexOf('{')))
} catch {
  summary = null
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}
const newQueue = readJson(path.join(newDir, '.mercato', 'queue', 'communication-channels-outbound', 'queue.json')) ?? []
const oldQueueAfter = readJson(path.join(oldQueue, 'queue.json')) ?? []
const sidecar = fs
  .readdirSync(oldQueue)
  .filter((name) => name.startsWith('carried-'))
  .map((name) => readJson(path.join(oldQueue, name)))
  .filter(Boolean)
const currentLink = fs.readlinkSync(path.join(RELEASES, 'current'))
const record = summary?.record ? readJson(summary.record) : null
const carry = record?.queueCarryover ?? summary?.queueCarryover ?? null
const deployed = record?.result === 'deployed'
const moved = carry?.moved === 1

const passed =
  run.status === 0 &&
  deployed &&
  path.resolve(currentLink) === path.resolve(newDir) &&
  moved &&
  newQueue.some((job) => job.id === 'job-leftover') &&
  oldQueueAfter.length === 0 &&
  sidecar.length === 1

// The successful drill leaves the target process running: kill it through the
// executor's own active record before removing the temp tree.
const active = readJson(path.join(STATE, 'active.json'))
if (active?.pid) {
  try {
    process.kill(active.pid, 'SIGKILL')
  } catch {
    // already gone
  }
}

console.log(
  JSON.stringify(
    {
      drill: 'queue-carryover',
      exitCode: run.status,
      deployed,
      moved,
      newQueueIds: newQueue.map((job) => job.id),
      oldQueueLength: oldQueueAfter.length,
      sidecars: sidecar.length,
      carryover: carry,
      drain: record?.workerDrain ?? null,
      preflight: record?.migrationPreflight ?? null,
      record: summary?.record ?? null,
      passed,
    },
    null,
    2,
  ),
)
fs.rmSync(BASE, {recursive: true, force: true})
process.exit(passed ? 0 : 1)
