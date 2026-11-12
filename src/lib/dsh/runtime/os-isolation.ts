/**
 * OS-level employee isolation for DSH runs (C phase).
 *
 * The base deployment runs every DSH child as the application user (`pro`), so
 * a 0700 directory only separates processes that are *not* already that user.
 * Two employees therefore share one Unix identity and the mode bits do not make
 * them separate: this module is what changes that.
 *
 * Design:
 *   - every employee binding maps deterministically to a dedicated system user
 *     `dsh-<first 16 hex of sha256(tenant\0org\0user)>` with no shell;
 *   - the runtime home/workspace/tmp of that employee live under
 *     `/srv/dsh/<kind>/<hash>` owned by that user, mode 0700;
 *   - a root-owned provisioner (`scripts/dsh-os-isolation/provision.sh`,
 *     installed as `/usr/local/sbin/dsh-agent-provision`) creates the user and
 *     directories and writes a sudoers rule that lets the app run *only* the
 *     runner as *that* user;
 *   - the runner (`/usr/local/lib/dsh-agent/run-with-env`) sources the one-shot
 *     env file, deletes it, cds to the run workspace and execs DSH.
 *
 * Rediscovering identity from the model is impossible: the hash is derived
 * server-side from the session, and the provisioner only accepts that tuple.
 * Turning `OM_DSH_OS_ISOLATION` off restores the previous single-user launch
 * without a rebuild.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export type OsIsolationConfig = {
  root: string
  provisionScript: string
  runner: string
  runDir: string
}

export type DshIdentity = {
  tenantId: string
  organizationId: string
  userId: string
}

export type ProvisionedIdentity = {
  user: string
  home: string
  workspace: string
  tmp: string
}

export function resolveOsIsolation(
  env: Record<string, string | undefined> = process.env,
): OsIsolationConfig | null {
  if ((env.OM_DSH_OS_ISOLATION ?? '').trim() !== '1') return null
  return {
    root: (env.OM_DSH_ISOLATION_ROOT ?? '').trim() || '/srv/dsh',
    provisionScript:
      (env.OM_DSH_PROVISION_SCRIPT ?? '').trim() || '/usr/local/sbin/dsh-agent-provision',
    runner: (env.OM_DSH_RUNNER ?? '').trim() || '/usr/local/lib/dsh-agent/run-with-env',
    runDir: (env.OM_DSH_RUN_DIR ?? '').trim() || '/run/dsh-agent',
  }
}

/** Same tuple the chat route hashes for its employee directories. */
export function dshIdentityHash(identity: DshIdentity): string {
  return createHash('sha256')
    .update([identity.tenantId, identity.organizationId, identity.userId].join('\u0000'))
    .digest('hex')
    .slice(0, 32)
}

/** 20 characters, deterministic, and impossible to confuse with the app user. */
export function dshUnixUser(identity: DshIdentity): string {
  return `dsh-${dshIdentityHash(identity).slice(0, 16)}`
}

export function assertIsolationIdentity(input: Partial<DshIdentity> | undefined): DshIdentity {
  const tenantId = input?.tenantId?.trim()
  const organizationId = input?.organizationId?.trim()
  const userId = input?.userId?.trim()
  if (!tenantId || !organizationId || !userId) {
    throw new Error(
      'DSH OS isolation is enabled but the run has no tenant/organization/user identity',
    )
  }
  return { tenantId, organizationId, userId }
}

/**
 * Create (idempotently) the employee user, its directories and the per-run
 * workspace/run directory. Root work is delegated to the installed script; the
 * app never writes /etc directly.
 */
export function provisionEmployee(
  config: OsIsolationConfig,
  identity: DshIdentity,
  runId: string,
): ProvisionedIdentity {
  const output = execFileSync(
    'sudo',
    [
      '-n',
      config.provisionScript,
      'identity',
      identity.tenantId,
      identity.organizationId,
      identity.userId,
      runId,
    ],
    { encoding: 'utf8', timeout: 30_000 },
  )
  const parsed = JSON.parse(output.trim()) as Partial<ProvisionedIdentity>
  const expectedUser = dshUnixUser(identity)
  if (
    parsed.user !== expectedUser ||
    typeof parsed.home !== 'string' ||
    typeof parsed.workspace !== 'string' ||
    typeof parsed.tmp !== 'string' ||
    !parsed.workspace.startsWith(`${config.root}/workspaces/`) ||
    !parsed.home.startsWith(`${config.root}/homes/`)
  ) {
    throw new Error('DSH provisioner returned an unexpected identity or path')
  }
  return {
    user: parsed.user,
    home: parsed.home,
    workspace: parsed.workspace,
    tmp: parsed.tmp,
  }
}

/**
 * Write the one-shot env file the runner sources.
 *
 * The per-run directory is created by the provisioner as `pro:<user>` mode 2770,
 * so the file inherits the employee's group and mode 0640 makes it readable by
 * exactly that user. Secrets never appear in argv.
 */
export function writeRunEnvFile(
  config: OsIsolationConfig,
  runId: string,
  env: Record<string, string>,
): string {
  const dir = path.join(config.runDir, runId)
  const file = path.join(dir, 'env')
  fs.writeFileSync(file, `${formatEnv(env)}\n`, { mode: 0o640 })
  return file
}

function formatEnv(env: Record<string, string>): string {
  const lines: string[] = []
  for (const key of Object.keys(env).sort()) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`refusing to export an invalid environment name: ${key}`)
    }
    const value = env[key]
    // Single quotes with '\'' escaping keeps arbitrary tokens literal.
    lines.push(`export ${key}='${value.replace(/'/g, `'\\''`)}'`)
  }
  return lines.join('\n')
}

/** The command the launcher spawns instead of the DSH binary directly. */
export function buildIsolatedSpawn(input: {
  config: OsIsolationConfig
  provisioned: ProvisionedIdentity
  envFile: string
  command: string
  args: readonly string[]
}): { command: string; args: string[]; cwd: string } {
  return {
    command: 'sudo',
    args: [
      '-n',
      '-u',
      input.provisioned.user,
      '--',
      input.config.runner,
      input.envFile,
      input.command,
      ...input.args,
    ],
    // The workspace belongs to the employee user; the runner cds into it.
    cwd: '/',
  }
}
