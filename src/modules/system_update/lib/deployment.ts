/**
 * Pure types and mappers for the real release pipeline (`ila3-auto-deploy`).
 *
 * Nothing in this module touches the filesystem: the browser may import the
 * types and the small formatters, while `deployment-reader.ts` owns every read.
 * Keeping the mapping pure is also what makes the run records testable without
 * a deploy directory.
 *
 * Source of truth (all read-only):
 *  - `/home/pro/.local/state/ila3-deploy/latest.json`
 *  - `/home/pro/.local/state/ila3-deploy/runs/*.json`
 *  - `/home/pro/.local/state/ila3-deploy/gates/latest.json`
 *  - `/home/pro/releases/mercato/<sha>/release.json`
 *  - `/home/pro/releases/mercato/<sha>/.mercato/build-info.json`
 *
 * The legacy `.mercato/system-update/state.json` is a compatibility surface
 * only; it is no longer the source for "what is deployed".
 */

export type DeployResult =
  | 'deployed'
  | 'already-current'
  | 'refused'
  | 'failed'
  | 'rolled-back'
  | 'rollback-failed'
  | 'running'
  | 'unknown'

export type DeployEntry = 'auto' | 'manual' | 'unknown'

export type DeployRelation = 'same' | 'behind' | 'ahead' | 'diverged' | 'unknown'

export type DeployRuntimeKind = 'release' | 'dev' | 'unknown'

export type DeployCiGate = {
  allow: boolean | null
  decision: string | null
  reason: string | null
}

export type DeployError = {
  code: string | null
  message: string | null
  detail: string | null
  /** One-line, human-readable reason assembled from the fields above. */
  text: string | null
}

export type DeploymentRun = {
  runId: string
  entry: DeployEntry
  drill: boolean
  production: boolean
  result: DeployResult
  sha: string | null
  shortSha: string | null
  startedAt: string | null
  finishedAt: string | null
  durationMs: number | null
  error: DeployError | null
  failedSteps: string[]
  ciGate: DeployCiGate | null
  /** PID recorded by the run's deploy lock, when the record has one. */
  lockPid: number | null
  recordPath: string | null
}

export type RunningDeployment = {
  found: boolean
  pid: number | null
  port: number
  cwd: string | null
  kind: DeployRuntimeKind
  releaseDir: string | null
  sha: string | null
  shortSha: string | null
  version: string | null
  builtAt: string | null
  manifestFound: boolean
  buildInfoFound: boolean
  /** `proc`: resolved from the 3000 listener. `process.cwd`: explicit fallback. */
  source: 'proc' | 'process.cwd' | 'unavailable'
  error: string | null
}

export type CandidateDeployment = {
  found: boolean
  sha: string | null
  shortSha: string | null
  source: 'origin/main' | 'gates/latest.json' | 'none'
  committedAt: string | null
  subject: string | null
  ciGate: DeployCiGate | null
  error: string | null
}

export type DeployLockStatus = {
  path: string
  fileExists: boolean
  /**
   * `true` only while a deploy actually holds the flock. `false` when the probe
   * acquired and released it. `null` when the probe could not run.
   *
   * The lock FILE always exists after the first deploy because flock does not
   * unlink it, so existence alone must never be rendered as "in progress".
   */
  held: boolean | null
  heldSource: 'flock' | 'latest-pid' | 'unavailable' | 'absent'
  pid: number | null
  mtime: string | null
  ageMs: number | null
  /** A leftover flock file with no holder; informational, not an error. */
  staleFile: boolean
}

export type DeploymentStatus = {
  checkedAt: string
  stateDir: string
  releasesRoot: string
  targetPort: number
  stateDirExists: boolean
  running: RunningDeployment
  candidate: CandidateDeployment
  relation: DeployRelation
  behindCommits: number | null
  latest: DeploymentRun | null
  recentRuns: DeploymentRun[]
  lock: DeployLockStatus
  notes: string[]
}

const KNOWN_RESULTS: ReadonlySet<string> = new Set<DeployResult>([
  'deployed',
  'already-current',
  'refused',
  'failed',
  'rolled-back',
  'rollback-failed',
  'running',
])

const TRUNCATE_DETAIL = 280

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function asIso(value: unknown): string | null {
  const raw = asText(value)
  if (!raw) return null
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function truncate(value: string, max = TRUNCATE_DETAIL): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function stringifyDetail(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return asText(value)
  try {
    return truncate(JSON.stringify(value))
  } catch {
    return null
  }
}

/**
 * Turn a run-record `error` into one line. The deploy script stores
 * `{code, message, detail}` where `detail` may itself be a nested gate report;
 * the specific reason (e.g. `no-successful-test-run-for-sha`) is more useful
 * than repeating the code, so it is preferred when present.
 */
export function describeDeployError(raw: unknown): DeployError | null {
  const record = asRecord(raw)
  if (!record) {
    const text = asText(raw)
    return text ? { code: null, message: text, detail: null, text } : null
  }

  const code = asText(record.code)
  const message = asText(record.message)
  const detailRecord = asRecord(record.detail)
  const detail =
    (detailRecord
      ? asText(detailRecord.reason) ?? asText(detailRecord.message) ?? asText(detailRecord.code)
      : null) ??
    (typeof record.detail === 'string' ? asText(record.detail) : null) ??
    stringifyDetail(record.detail)

  if (!code && !message && !detail) return null

  const head = [code, message && message !== code ? message : null].filter(Boolean).join(': ')
  const parts: string[] = []
  if (head) parts.push(head)
  if (detail && detail !== head && detail !== code && !parts.some((part) => part.includes(detail))) {
    parts.push(detail)
  }

  return { code, message, detail, text: parts.join(' — ') || null }
}

export function mapCiGate(raw: unknown): DeployCiGate | null {
  const record = asRecord(raw)
  if (!record) return null
  const allow = typeof record.allow === 'boolean' ? record.allow : null
  const decision = asText(record.decision)
  const reason = asText(record.reason)
  if (allow === null && !decision && !reason) return null
  return { allow, decision, reason }
}

/**
 * Map one `latest.json` / `runs/*.json` record. Unknown fields stay null; a
 * record without a runId is not a run record and maps to null.
 */
export function mapDeploymentRun(
  raw: unknown,
  options: { recordPath?: string | null; fallbackRunId?: string | null } = {},
): DeploymentRun | null {
  const record = asRecord(raw)
  if (!record) return null

  const runId = asText(record.runId) ?? asText(options.fallbackRunId)
  if (!runId) return null

  const rawResult = asText(record.result)
  const result: DeployResult =
    rawResult && KNOWN_RESULTS.has(rawResult) ? (rawResult as DeployResult) : 'unknown'

  const entryRaw = asText(record.entry)
  const entry: DeployEntry =
    entryRaw === 'auto' || entryRaw === 'manual' ? entryRaw : 'unknown'

  const sha = asText(record.sha)
  const shortSha = asText(record.shortSha) ?? (sha ? sha.slice(0, 8) : null)
  const startedAt = asIso(record.startedAt)
  const finishedAt = asIso(record.finishedAt)
  const durationMs =
    startedAt && finishedAt
      ? Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt))
      : null

  const steps = Array.isArray(record.steps) ? record.steps : []
  const failedSteps = steps
    .map((step) => asRecord(step))
    .filter((step): step is Record<string, unknown> => Boolean(step))
    .filter((step) => step.ok === false)
    .map((step) => asText(step.name))
    .filter((name): name is string => Boolean(name))

  const evidence = asRecord(record.evidence)
  const lock = asRecord(record.lock)
  const lockPid = asNumber(lock?.pid)

  return {
    runId,
    entry,
    drill: record.drill === true,
    production: record.production === true,
    result,
    sha,
    shortSha,
    startedAt,
    finishedAt,
    durationMs,
    error: describeDeployError(record.error),
    failedSteps,
    ciGate: mapCiGate(record.ciGate),
    lockPid,
    recordPath: asText(evidence?.record) ?? asText(options.recordPath),
  }
}

/** Newest first by startedAt (runId as a stable tie-breaker). */
export function sortRunsNewestFirst(runs: readonly DeploymentRun[]): DeploymentRun[] {
  return [...runs].sort((a, b) => {
    const aAt = a.startedAt ? Date.parse(a.startedAt) : Number.NaN
    const bAt = b.startedAt ? Date.parse(b.startedAt) : Number.NaN
    if (Number.isFinite(aAt) && Number.isFinite(bAt) && aAt !== bAt) return bAt - aAt
    return b.runId.localeCompare(a.runId)
  })
}

export function selectRecentRuns(runs: readonly DeploymentRun[], limit = 5): DeploymentRun[] {
  const seen = new Set<string>()
  const unique: DeploymentRun[] = []
  for (const run of sortRunsNewestFirst(runs)) {
    if (seen.has(run.runId)) continue
    seen.add(run.runId)
    unique.push(run)
    if (unique.length >= limit) break
  }
  return unique
}

/** Full SHAs match exactly; a short build stamp matches its full SHA by prefix. */
export function sameCommit(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const left = a.trim().toLowerCase()
  const right = b.trim().toLowerCase()
  if (!left || !right) return false
  if (left === right) return true
  const shortest = Math.min(left.length, right.length)
  if (shortest < 7) return false
  return left.startsWith(right) || right.startsWith(left)
}

export function classifyDeploymentRelation(input: {
  runningSha: string | null
  candidateSha: string | null
  runningIsAncestor: boolean | null
  candidateIsAncestor: boolean | null
}): DeployRelation {
  const { runningSha, candidateSha, runningIsAncestor, candidateIsAncestor } = input
  if (!runningSha || !candidateSha) return 'unknown'
  if (sameCommit(runningSha, candidateSha)) return 'same'
  if (runningIsAncestor === true) return 'behind'
  if (candidateIsAncestor === true) return 'ahead'
  if (runningIsAncestor === false && candidateIsAncestor === false) return 'diverged'
  return 'unknown'
}

/**
 * Whether a working directory is a release slot. Both paths are compared
 * after normalising trailing slashes; no filesystem access is performed.
 */
export function classifyRuntimePath(
  cwd: string | null | undefined,
  releasesRoot: string,
): DeployRuntimeKind {
  if (!cwd) return 'unknown'
  const path = cwd.replace(/\/+$/, '')
  const root = releasesRoot.replace(/\/+$/, '')
  if (!path || !root) return 'unknown'
  return path === root || path.startsWith(`${root}/`) ? 'release' : 'dev'
}

/** `10 分 29 秒`-style duration; null when the record has no both timestamps. */
export function formatDuration(ms: number | null | undefined): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds} 秒`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`
}

export function isFailedDeployResult(result: DeployResult): boolean {
  return result === 'failed' || result === 'rollback-failed'
}
