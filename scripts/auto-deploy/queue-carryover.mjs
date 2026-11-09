/**
 * Queue carryover for the upgrade pipeline.
 *
 * Production sets `QUEUE_BASE_DIR=./.mercato/queue`, i.e. relative to the
 * release directory the app process runs from. A cutover therefore moves the
 * process to a NEW release directory whose queue is empty: any job still ready
 * in the old release is stranded there and never executed. Draining reduces the
 * window; this module closes it by moving the leftovers.
 *
 * Ordering matters: this runs AFTER the switch and its post-switch health check.
 * If the cutover rolls back, the old release still owns its jobs and this module
 * never ran. Jobs are merged by id, so a crash between the target write and the
 * source truncation cannot double-process on the next attempt. The source keeps
 * an audit sidecar (`carried-<runId>.json`) with the exact jobs moved.
 */
import fs from 'node:fs'
import path from 'node:path'

function queueBase(appDir) {
  return path.join(appDir, '.mercato', 'queue')
}

function readJobs(file) {
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (err && err.code === 'ENOENT') return {jobs: [], missing: true}
    return {jobs: null, error: String(err?.message || err)}
  }
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return {jobs: null, error: 'queue.json is not an array'}
    return {jobs: parsed}
  } catch (err) {
    return {jobs: null, error: `unreadable queue.json: ${String(err?.message || err)}`}
  }
}

function writeJobsAtomic(file, jobs) {
  fs.mkdirSync(path.dirname(file), {recursive: true})
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, JSON.stringify(jobs))
  fs.renameSync(tmp, file)
}

function jobKey(job) {
  if (job && typeof job === 'object' && typeof job.id === 'string' && job.id.length) return `id:${job.id}`
  return `raw:${JSON.stringify(job)}`
}

export function carryoverQueues({fromAppDir, toAppDir, runId, dryRun = false} = {}) {
  if (!fromAppDir || !toAppDir) return {moved: 0, queues: [], errors: ['missing app dir']}
  if (path.resolve(fromAppDir) === path.resolve(toAppDir)) {
    return {moved: 0, queues: [], errors: ['source and target are the same release']}
  }
  const fromBase = queueBase(fromAppDir)
  const toBase = queueBase(toAppDir)
  if (!fs.existsSync(fromBase)) {
    return {moved: 0, queues: [], errors: [], note: 'no source queues'}
  }

  const queues = []
  const errors = []
  let movedTotal = 0
  const names = fs
    .readdirSync(fromBase, {withFileTypes: true})
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  for (const name of names) {
    const sourceFile = path.join(fromBase, name, 'queue.json')
    const source = readJobs(sourceFile)
    if (source.error) {
      errors.push(`${name}: ${source.error}`)
      continue
    }
    if (!source.jobs.length) continue

    const targetFile = path.join(toBase, name, 'queue.json')
    const target = readJobs(targetFile)
    if (target.error) {
      errors.push(`${name} target: ${target.error}`)
      continue
    }
    const present = new Set(target.jobs.map(jobKey))
    const incoming = source.jobs.filter((job) => !present.has(jobKey(job)))
    const alreadyPresent = source.jobs.length - incoming.length

    if (!dryRun) {
      if (incoming.length) writeJobsAtomic(targetFile, [...target.jobs, ...incoming])
      const stamp = runId || new Date().toISOString().replace(/[:.]/g, '-')
      writeJobsAtomic(
        path.join(fromBase, name, `carried-${stamp}.json`),
        {carriedAt: new Date().toISOString(), runId: runId ?? null, jobs: source.jobs},
      )
      writeJobsAtomic(sourceFile, [])
    }
    movedTotal += dryRun ? 0 : incoming.length
    queues.push({name, moved: dryRun ? 0 : incoming.length, wouldMove: dryRun ? incoming.length : incoming.length, alreadyPresent})
  }

  return {moved: movedTotal, queues, errors, dryRun: Boolean(dryRun)}
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2)
  const arg = (name, fallback = null) => {
    const index = args.indexOf(name)
    return index >= 0 ? args[index + 1] ?? fallback : fallback
  }
  const result = carryoverQueues({
    fromAppDir: arg('--from'),
    toAppDir: arg('--to'),
    runId: arg('--run-id', 'manual'),
    dryRun: args.includes('--dry-run'),
  })
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.errors.length ? 2 : 0)
}
