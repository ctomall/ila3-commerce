/**
 * Read-only view of the real release pipeline. Every function degrades to an
 * explicit "unavailable" value instead of inventing a version, a timestamp or a
 * result: a missing directory is reported as missing, never as a fake deploy.
 *
 * The running release is resolved from the process that LISTENs on port 3000
 * (`/proc/<pid>/cwd`), because production runs from a release slot and the
 * development checkout is not the truth. `process.cwd()` is used only as an
 * explicit, labelled fallback when the listener cannot be resolved.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  classifyDeploymentRelation,
  classifyRuntimePath,
  mapCiGate,
  mapDeploymentRun,
  sameCommit,
  selectRecentRuns,
  type CandidateDeployment,
  type DeployLockStatus,
  type DeploymentRun,
  type DeploymentStatus,
  type RunningDeployment,
} from './deployment'

const execFileAsync = promisify(execFile)

export const DEFAULT_STATE_DIR = '/home/pro/.local/state/ila3-deploy'
export const DEFAULT_RELEASES_ROOT = '/home/pro/releases/mercato'
export const DEFAULT_TARGET_PORT = 3000

type Paths = {
  stateDir: string
  releasesRoot: string
  appRoot: string
  targetPort: number
}

type ExecResult = {
  ok: boolean
  code: number | null
  stdout: string
  stderr: string
  error: string | null
}

type JsonRead = {
  value: Record<string, unknown> | null
  error: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function asIso(value: unknown): string | null {
  const raw = asString(value)
  if (!raw) return null
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function resolvePaths(overrides: Partial<Paths> = {}): Paths {
  const envPort = Number(process.env.ILA3_TARGET_PORT ?? DEFAULT_TARGET_PORT)
  return {
    stateDir:
      overrides.stateDir?.trim() ||
      process.env.ILA3_DEPLOY_STATE_DIR?.trim() ||
      DEFAULT_STATE_DIR,
    releasesRoot:
      overrides.releasesRoot?.trim() ||
      process.env.ILA3_RELEASES_ROOT?.trim() ||
      DEFAULT_RELEASES_ROOT,
    appRoot:
      overrides.appRoot?.trim() ||
      process.env.ILA3_APP_DIR?.trim() ||
      process.cwd(),
    targetPort:
      overrides.targetPort ??
      (Number.isFinite(envPort) && envPort > 0 ? envPort : DEFAULT_TARGET_PORT),
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function readJsonFile(file: string): Promise<JsonRead> {
  try {
    const raw = await fs.readFile(file, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    const record = asRecord(parsed)
    return record
      ? { value: record, error: null }
      : { value: null, error: `${file} 不是 JSON 对象` }
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    return {
      value: null,
      error: err?.code === 'ENOENT' ? null : `读取 ${file} 失败：${err?.message ?? String(error)}`,
    }
  }
}

async function run(file: string, args: string[], timeout = 4000): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      cwd: process.cwd(),
      timeout,
      maxBuffer: 2 * 1024 * 1024,
      encoding: 'utf8',
    })
    return {
      ok: true,
      code: 0,
      stdout: String(stdout ?? '').trim(),
      stderr: String(stderr ?? '').trim(),
      error: null,
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      code?: number | string
      stdout?: string
      stderr?: string
      killed?: boolean
    }
    return {
      ok: false,
      code: typeof err?.code === 'number' ? err.code : null,
      stdout: String(err?.stdout ?? '').trim(),
      stderr: String(err?.stderr ?? '').trim(),
      error: String(err?.message ?? error),
    }
  }
}

/** `/proc/net/tcp{,6}` listening sockets for a local port, as inode strings. */
async function listeningInodes(port: number): Promise<Set<string>> {
  const inodes = new Set<string>()
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    const raw = await fs.readFile(file, 'utf8').catch(() => '')
    for (const line of raw.split('\n').slice(1)) {
      const fields = line.trim().split(/\s+/)
      if (fields.length < 10) continue
      const [, portHex] = fields[1].split(':')
      if (fields[3] !== '0A') continue // TCP_LISTEN
      if (Number.parseInt(portHex, 16) === port) inodes.add(fields[9])
    }
  }
  return inodes
}

async function findListenerPid(port: number): Promise<number | null> {
  // Fast path: `ss` reports the pid without walking every process.
  const ss = await run('ss', ['-H', '-ltnp', `sport = :${port}`], 3000)
  if (ss.ok) {
    const match = ss.stdout.match(/pid=(\d+)/)
    if (match) return Number(match[1])
  }

  // Slow path: match the listening socket inodes against every process fd.
  // This also covers hosts where `ss` is missing or hides the pid.
  const inodes = await listeningInodes(port)
  if (!inodes.size) return null
  const targets = new Set([...inodes].map((inode) => `socket:[${inode}]`))
  const entries = await fs.readdir('/proc').catch(() => [] as string[])
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue
    const fds = await fs.readdir(`/proc/${entry}/fd`).catch(() => [] as string[])
    for (const fd of fds) {
      const link = await fs.readlink(`/proc/${entry}/fd/${fd}`).catch(() => null)
      if (link && targets.has(link)) return Number(entry)
    }
  }
  return null
}

async function readRunning(paths: Paths, notes: string[]): Promise<RunningDeployment> {
  let pid = await findListenerPid(paths.targetPort).catch(() => null)
  const listenerPid = pid
  let cwd: string | null = null
  let source: RunningDeployment['source'] = 'unavailable'

  if (pid !== null) {
    cwd = await fs.readlink(`/proc/${pid}/cwd`).catch(() => null)
    if (cwd) source = 'proc'
  }

  if (!cwd) {
    const fallback = process.cwd()
    if (listenerPid !== null) {
      notes.push(
        `已找到 ${paths.targetPort} 端口进程 pid=${listenerPid}，但无法读取 /proc/${listenerPid}/cwd；运行位置回退为当前服务进程目录。`,
      )
    } else {
      notes.push(
        `未找到 ${paths.targetPort} 端口监听进程；运行位置回退为当前服务进程目录（${fallback}），不能代表生产 release 槽位。`,
      )
    }
    cwd = fallback
    source = 'process.cwd'
  }

  const resolved = await fs.realpath(cwd).catch(() => cwd as string)
  const kind = classifyRuntimePath(resolved, paths.releasesRoot)
  const releaseDir = kind === 'release' ? path.basename(resolved) : null

  const releaseRead = await readJsonFile(path.join(resolved, 'release.json'))
  const buildRead = await readJsonFile(path.join(resolved, '.mercato', 'build-info.json'))
  if (releaseRead.error) notes.push(releaseRead.error)
  if (buildRead.error) notes.push(buildRead.error)
  if (kind === 'release' && !releaseRead.value) {
    notes.push(`发布槽位缺少可读的 release.json：${path.join(resolved, 'release.json')}`)
  }

  const release = releaseRead.value
  const build = buildRead.value
  const releaseBuild = asRecord(release?.buildInfo)
  const dirName = path.basename(resolved)
  const buildCommit = asString(build?.commit)
  const dirSha = /^[0-9a-f]{40}$/i.test(dirName) ? dirName : null
  const sha = asString(release?.sha) ?? buildCommit ?? dirSha
  const shortSha = asString(release?.shortSha) ?? (sha ? sha.slice(0, 8) : null)
  const builtAt = asIso(releaseBuild?.builtAt) ?? asIso(release?.createdAt) ?? asIso(build?.builtAt)
  const version = asString(release?.version) ?? asString(build?.version)

  return {
    found: Boolean(resolved),
    pid,
    port: paths.targetPort,
    cwd: resolved,
    kind,
    releaseDir,
    sha,
    shortSha,
    version,
    builtAt,
    manifestFound: Boolean(release),
    buildInfoFound: Boolean(build),
    source,
    error: null,
  }
}

async function readCandidate(paths: Paths, notes: string[]): Promise<CandidateDeployment> {
  const gatesRead = readJsonFile(path.join(paths.stateDir, 'gates', 'latest.json'))

  const gitSha = await run(
    'git',
    ['-C', paths.appRoot, 'rev-parse', '--verify', 'origin/main^{commit}'],
    5000,
  )
  const gates = await gatesRead

  let sha: string | null = null
  let source: CandidateDeployment['source'] = 'none'
  let committedAt: string | null = null
  let subject: string | null = null
  let error: string | null = null

  if (gitSha.ok && gitSha.stdout) {
    sha = gitSha.stdout
    source = 'origin/main'
    const meta = await run(
      'git',
      ['-C', paths.appRoot, 'show', '-s', '--format=%cI%n%s', sha],
      5000,
    )
    if (meta.ok) {
      const [rawCommittedAt, ...subjectLines] = meta.stdout.split('\n')
      committedAt = asIso(rawCommittedAt)
      subject = subjectLines.join(' ').trim() || null
    }
  } else {
    const gateSha = asString(gates.value?.sha)
    if (gateSha) {
      sha = gateSha
      source = 'gates/latest.json'
      notes.push('无法从 git 读取 origin/main，最新候选 SHA 回退到发布门禁记录 gates/latest.json。')
    } else {
      error = `无法读取 origin/main：${gitSha.error ?? 'git 不可用'}；也没有 gates/latest.json 记录。`
      notes.push(error)
    }
  }

  const gateSha = asString(gates.value?.sha)
  const ciGate =
    sha && gateSha && sameCommit(gateSha, sha) ? mapCiGate(gates.value) : null

  return {
    found: Boolean(sha),
    sha,
    shortSha: sha ? sha.slice(0, 8) : null,
    source,
    committedAt,
    subject,
    ciGate,
    error,
  }
}

async function readLatest(paths: Paths, notes: string[]): Promise<DeploymentRun | null> {
  const file = path.join(paths.stateDir, 'latest.json')
  const read = await readJsonFile(file)
  if (read.error) notes.push(read.error)
  if (!read.value) {
    if (!read.error) notes.push(`没有最新发布记录：${file} 不存在。`)
    return null
  }
  return mapDeploymentRun(read.value, { recordPath: file })
}

async function readRecentRuns(paths: Paths, notes: string[]): Promise<DeploymentRun[]> {
  const dir = path.join(paths.stateDir, 'runs')
  const names = await fs.readdir(dir).catch(() => [] as string[])
  const files = names.filter((name) => name.endsWith('.json')).map((name) => path.join(dir, name))
  if (!files.length) {
    notes.push(`没有发布运行记录：${dir} 不存在或为空。`)
    return []
  }

  const withStats = await Promise.all(
    files.map(async (file) => {
      const stat = await fs.stat(file).catch(() => null)
      return stat ? { file, mtimeMs: stat.mtimeMs } : null
    }),
  )
  const newest = withStats
    .filter((entry): entry is { file: string; mtimeMs: number } => Boolean(entry))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 12)

  const runs = await Promise.all(
    newest.map(async ({ file }) => {
      const read = await readJsonFile(file)
      if (read.error) notes.push(read.error)
      return mapDeploymentRun(read.value, { recordPath: file })
    }),
  )

  return selectRecentRuns(
    runs.filter((run): run is DeploymentRun => Boolean(run)),
    5,
  )
}

async function readLock(
  paths: Paths,
  latest: DeploymentRun | null,
  now: Date,
  notes: string[],
): Promise<DeployLockStatus> {
  const lockPath = path.join(paths.stateDir, 'deploy.lock')
  const stat = await fs.stat(lockPath).catch(() => null)

  if (!stat) {
    return {
      path: lockPath,
      fileExists: false,
      held: false,
      heldSource: 'absent',
      pid: null,
      mtime: null,
      ageMs: null,
      staleFile: false,
    }
  }

  let held: boolean | null = null
  let heldSource: DeployLockStatus['heldSource'] = 'unavailable'

  // `flock -n <file> true` acquires and immediately releases the lock when it
  // is free. The file itself is never removed by flock, so probing the lock is
  // the only honest way to tell "in progress" from "leftover file".
  const probe = await run('flock', ['-n', lockPath, 'true'], 3000)
  if (probe.ok) {
    held = false
    heldSource = 'flock'
  } else if (probe.code === 1 || probe.code === 75) {
    held = true
    heldSource = 'flock'
  } else {
    const pid = latest?.result === 'running' ? latest.lockPid : null
    if (pid !== null && (await pathExists(`/proc/${pid}`))) {
      held = true
      heldSource = 'latest-pid'
    } else if (latest?.result === 'running') {
      held = null
      notes.push('无法探测 deploy.lock（flock 不可用），且最新记录为 running 但记录的 pid 已不存在；锁状态未知。')
    } else {
      held = false
      heldSource = 'unavailable'
      notes.push(`无法探测 deploy.lock（${probe.error ?? 'flock 不可用'}）；文件存在并不等于发布进行中。`)
    }
  }

  const staleFile = held === false
  if (staleFile) {
    notes.push(
      'deploy.lock 文件存在但当前没有进程持有该 flock（flock 释放后不会删除文件）；不视为发布进行中。',
    )
  }

  return {
    path: lockPath,
    fileExists: true,
    held,
    heldSource,
    pid: held === true && latest?.result === 'running' ? latest.lockPid : null,
    mtime: stat.mtime.toISOString(),
    ageMs: Math.max(0, now.getTime() - stat.mtime.getTime()),
    staleFile,
  }
}

async function isAncestor(
  cwd: string,
  ancestor: string,
  descendant: string,
): Promise<boolean | null> {
  const result = await run(
    'git',
    ['-C', cwd, 'merge-base', '--is-ancestor', ancestor, descendant],
    4000,
  )
  if (result.ok) return true
  if (result.code === 1) return false
  return null
}

async function readRelation(
  paths: Paths,
  running: RunningDeployment,
  candidate: CandidateDeployment,
): Promise<{ relation: DeploymentStatus['relation']; behindCommits: number | null }> {
  if (!running.sha || !candidate.sha) return { relation: 'unknown', behindCommits: null }
  if (sameCommit(running.sha, candidate.sha)) return { relation: 'same', behindCommits: 0 }

  const [runningIsAncestor, candidateIsAncestor] = await Promise.all([
    isAncestor(paths.appRoot, running.sha, candidate.sha),
    isAncestor(paths.appRoot, candidate.sha, running.sha),
  ])
  const relation = classifyDeploymentRelation({
    runningSha: running.sha,
    candidateSha: candidate.sha,
    runningIsAncestor,
    candidateIsAncestor,
  })

  let behindCommits: number | null = null
  if (relation === 'behind') {
    const count = await run(
      'git',
      ['-C', paths.appRoot, 'rev-list', '--count', `${running.sha}..${candidate.sha}`],
      4000,
    )
    if (count.ok) {
      const parsed = Number.parseInt(count.stdout, 10)
      behindCommits = Number.isFinite(parsed) ? parsed : null
    }
  }

  return { relation, behindCommits }
}

export async function readDeploymentStatus(
  overrides: Partial<Paths> & { now?: Date } = {},
): Promise<DeploymentStatus> {
  const paths = resolvePaths(overrides)
  const now = overrides.now ?? new Date()
  const notes: string[] = []
  const stateDirExists = await pathExists(paths.stateDir)
  if (!stateDirExists) {
    notes.push(`发布状态目录不存在：${paths.stateDir}（页面按“未接入”展示，不伪造记录）。`)
  }

  const [running, candidate, latest] = await Promise.all([
    readRunning(paths, notes),
    readCandidate(paths, notes),
    readLatest(paths, notes),
  ])
  const [lock, recentRuns, relationResult] = await Promise.all([
    readLock(paths, latest, now, notes),
    readRecentRuns(paths, notes),
    readRelation(paths, running, candidate),
  ])

  return {
    checkedAt: now.toISOString(),
    stateDir: paths.stateDir,
    releasesRoot: paths.releasesRoot,
    targetPort: paths.targetPort,
    stateDirExists,
    running,
    candidate,
    relation: relationResult.relation,
    behindCommits: relationResult.behindCommits,
    latest,
    recentRuns,
    lock,
    notes,
  }
}

/**
 * True only while the deploy flock is actually held. Used by the run route so a
 * second click cannot race the auto-deploy executor; the UI also disables the
 * button, but the server is the authority.
 */
export async function isDeployLockHeld(stateDir?: string): Promise<boolean | null> {
  const dir = stateDir?.trim() || process.env.ILA3_DEPLOY_STATE_DIR?.trim() || DEFAULT_STATE_DIR
  const lockPath = path.join(dir, 'deploy.lock')
  if (!(await pathExists(lockPath))) return false
  const probe = await run('flock', ['-n', lockPath, 'true'], 3000)
  if (probe.ok) return false
  if (probe.code === 1 || probe.code === 75) return true
  return null
}
