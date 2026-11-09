/**
 * Worker drain gate for the upgrade pipeline.
 *
 * Cutting over while queue jobs are still ready kills the workers mid-job. Each
 * job's outcome then depends on the local-queue rewrite path, not on the
 * pipeline, which is not something a deploy should gamble on.
 *
 * This gate waits until no queue under the release's `.mercato/queue` directory
 * has a READY job (delayed future jobs do not block: they belong to a future
 * tick and survive the switch). On timeout it reports what is left instead of
 * throwing — the ADR requires recording leftovers, never silently dropping or
 * blocking production forever.
 *
 * It never processes a job, never starts a worker and never mutates a queue
 * file: probing is read-only, mirroring the lazy worker supervisor's probes.
 */
import fs from 'node:fs'
import path from 'node:path'

export function listQueueNames(appDir) {
  const baseDir = path.join(appDir, '.mercato', 'queue')
  if (!fs.existsSync(baseDir)) return []
  return fs
    .readdirSync(baseDir, {withFileTypes: true})
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/**
 * Read-only probe of one local-queue file.
 *
 * Deliberately implemented here instead of importing @open-mercato/queue's
 * probe: the installed package and the source tree disagree on that function's
 * signature (dist 0.9.0 takes `(name, strategy, options)`, source takes
 * `(name, options)`), and a probe that silently reads the wrong directory would
 * report a busy queue as idle. The on-disk format is stable: queue.json is an
 * array of jobs, each with an optional `availableAt`.
 */
export function probeQueueFile(file) {
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (err && err.code === 'ENOENT') return {ready: 0, delayedFuture: 0, error: false}
    return {ready: 0, delayedFuture: 0, error: true, errorMessage: String(err?.message || err)}
  }
  let jobs
  try {
    jobs = JSON.parse(raw)
  } catch (err) {
    return {ready: 0, delayedFuture: 0, error: true, errorMessage: `unreadable queue.json: ${String(err?.message || err)}`}
  }
  if (!Array.isArray(jobs)) return {ready: 0, delayedFuture: 0, error: false}
  const now = Date.now()
  let ready = 0
  let delayedFuture = 0
  for (const job of jobs) {
    if (!job || typeof job !== 'object') continue
    const availableAt = job.availableAt
    if (typeof availableAt !== 'string' || availableAt.length === 0) {
      ready++
      continue
    }
    const ts = Date.parse(availableAt)
    if (!Number.isFinite(ts) || ts <= now) ready++
    else delayedFuture++
  }
  return {ready, delayedFuture, error: false}
}

export async function probeQueues(appDir, queues) {
  const baseDir = path.join(appDir, '.mercato', 'queue')
  return queues.map((queueName) => ({
    queueName,
    ...probeQueueFile(path.join(baseDir, queueName, 'queue.json')),
  }))
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function waitForDrain({
  appDir,
  timeoutMs = 20000,
  intervalMs = 500,
  queues = null,
  sleep = defaultSleep,
} = {}) {
  if (!appDir || !fs.existsSync(appDir)) {
    return {drained: false, reason: 'app dir missing', waitedMs: 0, rounds: 0, remaining: []}
  }
  const names = Array.isArray(queues) && queues.length ? queues : listQueueNames(appDir)
  if (names.length === 0) {
    return {drained: true, reason: 'no local queues', waitedMs: 0, rounds: 0, remaining: []}
  }

  const startedAt = Date.now()
  let rounds = 0
  let probes = []
  while (true) {
    probes = await probeQueues(appDir, names)
    rounds++
    const busy = probes.filter((probe) => probe.ready > 0)
    const errored = probes.filter((probe) => probe.error)
    if (busy.length === 0) {
      return {
        drained: true,
        waitedMs: Date.now() - startedAt,
        rounds,
        remaining: errored.map((probe) => ({
          queue: probe.queueName,
          error: probe.errorMessage ?? 'probe failed',
        })),
      }
    }
    if (Date.now() - startedAt >= timeoutMs) {
      return {
        drained: false,
        timedOut: true,
        waitedMs: Date.now() - startedAt,
        rounds,
        remaining: busy.map((probe) => ({
          queue: probe.queueName,
          ready: probe.ready,
          delayedFuture: probe.delayedFuture,
        })),
      }
    }
    await sleep(intervalMs)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2)
  const arg = (name, fallback = null) => {
    const index = args.indexOf(name)
    return index >= 0 ? args[index + 1] ?? fallback : fallback
  }
  const appDir = arg('--app-dir', process.cwd())
  const timeoutMs = Number(arg('--timeout-ms', '20000'))
  const queuesArg = arg('--queues', '')
  const result = await waitForDrain({
    appDir,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 20000,
    queues: queuesArg ? queuesArg.split(',').map((name) => name.trim()).filter(Boolean) : null,
  })
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.drained ? 0 : 2)
}
