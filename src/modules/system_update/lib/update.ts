/**
 * Shared server-side helpers for the self-update surface.
 *
 * The web process never executes git/build itself. It writes an upgrade request
 * and asks systemd for a transient one-shot unit, because mercato.service uses
 * KillMode=control-group: a build spawned inside its cgroup would be killed by
 * the very restart the upgrade needs.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'

const execFileAsync = promisify(execFile)

export const APP_DIR = process.env.ILA3_APP_DIR?.trim() || process.cwd()
export const STATE_DIR = path.join(APP_DIR, '.mercato', 'system-update')
export const STATE_FILE = path.join(STATE_DIR, 'state.json')
export const REQUEST_FILE = path.join(STATE_DIR, 'request.json')
export const LOG_FILE = path.join(STATE_DIR, 'update.log')
export const UPDATE_UNIT = 'ila3-self-update.service'

export type UpdateRunState = 'running' | 'succeeded' | 'failed' | 'rolled-back'

export type UpdateState = {
  status: UpdateRunState
  step?: string
  startedAt?: string
  finishedAt?: string | null
  fromCommit?: string | null
  toCommit?: string | null
  fromVersion?: string | null
  toVersion?: string | null
  message?: string | null
  actor?: string | null
  logFile?: string
}

export type RepoInfo = {
  isRepo: boolean
  branch?: string
  commit?: string
  shortCommit?: string
  subject?: string
  committedAt?: string
  remote?: string
  tags?: string[]
  /** App version from package.json at the running commit. */
  version?: string
  /** Nearest release tag (vX.Y.Z) reachable from HEAD, plus the short commit. */
  releaseLabel?: string
  /** Upgradeable release tags, newest first. */
  releaseTags?: string[]
  dirtyCount?: number
}

export type AuthLike = { roles?: unknown } | null

export function isSelfUpdateEnabled(): boolean {
  return String(process.env.ENABLE_SELF_UPDATE ?? '').toLowerCase() === 'true'
}

/** Only the superadmin role may trigger an upgrade. */
export function isSuperAdmin(auth: AuthLike): boolean {
  const roles = auth && Array.isArray(auth.roles) ? auth.roles : []
  return roles.some((role) => String(role).toLowerCase() === 'superadmin')
}

export function normalizeRef(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null
  // Accept branch/tag/sha shapes only: no shell metacharacters, no leading dash.
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/.test(value)) return null
  if (value.includes('..')) return null
  return value
}

async function git(args: string[], timeout = 8000): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: APP_DIR,
    timeout,
    maxBuffer: 4 * 1024 * 1024,
  })
  return stdout.trim()
}

export async function readRepoInfo(): Promise<RepoInfo> {
  try {
    await fs.access(path.join(APP_DIR, '.git'))
  } catch {
    return { isRepo: false }
  }
  const [branch, commit, subject, committedAt, remote, dirty] = await Promise.all([
    git(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => ''),
    git(['rev-parse', 'HEAD']).catch(() => ''),
    git(['log', '-1', '--pretty=%s']).catch(() => ''),
    git(['log', '-1', '--pretty=%cI']).catch(() => ''),
    git(['remote', 'get-url', 'origin']).catch(() => ''),
    git(['status', '--porcelain']).catch(() => ''),
  ])
  const tags = await git(['tag', '--list', 'pre-update-*', '--sort=-creatordate'])
    .then((out) => out.split('\n').filter(Boolean).slice(0, 5))
    .catch(() => [])
  // Version surface: the app version from package.json plus the release tags a person
  // can actually upgrade to. `pre-update-*` tags are rollback markers, not releases.
  const version = await fs
    .readFile(path.join(APP_DIR, 'package.json'), 'utf8')
    .then((raw) => String((JSON.parse(raw) as { version?: string }).version ?? ''))
    .catch(() => '')
  const releaseTags = await git(['tag', '--list', 'v*', '--sort=-v:refname'])
    .then((out) => out.split('\n').filter(Boolean).slice(0, 12))
    .catch(() => [])
  const nearestTag = await git(['describe', '--tags', '--abbrev=0']).catch(() => '')
  const releaseLabel = [nearestTag, commit ? commit.slice(0, 8) : ''].filter(Boolean).join(' ')

  return {
    isRepo: Boolean(commit),
    branch,
    commit,
    shortCommit: commit ? commit.slice(0, 8) : '',
    subject,
    committedAt,
    remote,
    tags,
    version,
    releaseLabel,
    releaseTags,
    dirtyCount: dirty ? dirty.split('\n').length : 0,
  }
}

export async function readState(): Promise<UpdateState | null> {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8')
    return JSON.parse(raw) as UpdateState
  } catch {
    return null
  }
}

export async function readLogTail(maxLines = 60): Promise<string[]> {
  try {
    const raw = await fs.readFile(LOG_FILE, 'utf8')
    return raw.split('\n').filter(Boolean).slice(-maxLines)
  } catch {
    return []
  }
}

/** Ask systemd for the one-shot upgrade unit. Returns false when it is refused. */
export async function requestSelfUpdate(payload: {
  ref?: string | null
  force?: boolean
  actor: string
}): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true })
  const request = {
    ref: payload.ref ?? null,
    force: payload.force === true,
    actor: payload.actor,
    requestedAt: new Date().toISOString(),
  }
  await fs.writeFile(REQUEST_FILE, JSON.stringify(request, null, 2) + '\n', { mode: 0o600 })
  await execFileAsync('sudo', ['-n', 'systemctl', 'start', '--no-block', UPDATE_UNIT], {
    cwd: APP_DIR,
    timeout: 15_000,
  })
}

export async function isUpdateUnitRunning(): Promise<boolean> {
  try {
    await execFileAsync('systemctl', ['is-active', '--quiet', UPDATE_UNIT], { timeout: 5000 })
    return true
  } catch {
    return false
  }
}
