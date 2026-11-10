/**
 * Read-only resolution of the two version surfaces.
 *
 * Every value comes from an artifact that is already on this host:
 *
 *  - the running release slot's `release.json` and `.mercato/build-info.json`
 *    for the app version, and its installed `node_modules/@open-mercato/*` for
 *    the kernel version;
 *  - the existing deploy chain's candidate (`origin/main` / gates record) for
 *    the next app release, with the candidate-commit `package.json` version read
 *    separately and labelled as declared-but-unbuilt;
 *  - an explicitly configured kernel update manifest (`ILA3_KERNEL_UPDATE_SOURCE`)
 *    when — and only when — such a trusted source exists.
 *
 * Nothing here returns a default version. A missing file, an unreadable
 * directory or a malformed manifest becomes `unknown` / `failed` /
 * `unsupported`, so the page can never claim "latest" without evidence.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { DeploymentStatus } from './deployment'
import {
  buildVersionSurfaces,
  KERNEL_SCOPE_PREFIX,
  type KernelPackageVersion,
  type VersionSurfaces,
} from './versions'
import { resolveRepoDir } from './update'

const execFileAsync = promisify(execFile)

export const KERNEL_UPDATE_SOURCE_ENV = 'ILA3_KERNEL_UPDATE_SOURCE'

type JsonRead = { value: Record<string, unknown> | null; error: string | null }

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

async function readJson(file: string): Promise<JsonRead> {
  try {
    const raw = await fs.readFile(file, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    const record = asRecord(parsed)
    return record ? { value: record, error: null } : { value: null, error: `${file} 不是 JSON 对象` }
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    return {
      value: null,
      error: err?.code === 'ENOENT' ? null : `读取 ${file} 失败：${err?.message ?? String(error)}`,
    }
  }
}

async function readRunningArtifacts(cwd: string): Promise<{
  release: Record<string, unknown> | null
  build: Record<string, unknown> | null
  errors: string[]
}> {
  const [release, build] = await Promise.all([
    readJson(path.join(cwd, 'release.json')),
    readJson(path.join(cwd, '.mercato', 'build-info.json')),
  ])
  const errors = [release.error, build.error].filter((value): value is string => Boolean(value))
  return { release: release.value, build: build.value, errors }
}

/** The kernel packages actually installed in the running slot. */
async function readKernelPackages(cwd: string): Promise<{
  packages: KernelPackageVersion[]
  error: string | null
}> {
  const root = path.join(cwd, 'node_modules', KERNEL_SCOPE_PREFIX)
  let names: string[]
  try {
    names = await fs.readdir(root)
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    return {
      packages: [],
      error:
        err?.code === 'ENOENT'
          ? `运行产物缺少 ${root}，无法读取实际内核版本。`
          : `读取 ${root} 失败：${err?.message ?? String(error)}`,
    }
  }

  const packages = await Promise.all(
    names.map(async (name) => {
      const manifest = await readJson(path.join(root, name, 'package.json'))
      const version = typeof manifest.value?.version === 'string' ? manifest.value.version.trim() : ''
      if (!version) return null
      return { name: `${KERNEL_SCOPE_PREFIX}${name}`, version }
    }),
  )

  return {
    packages: packages
      .filter((entry): entry is KernelPackageVersion => Boolean(entry))
      .sort((a, b) => a.name.localeCompare(b.name)),
    error: null,
  }
}

async function readDeclaredKernelDeps(cwd: string): Promise<Record<string, string>> {
  const read = await readJson(path.join(cwd, 'package.json'))
  if (!read.value) return {}
  const declared: Record<string, string> = {}
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const section = asRecord(read.value[key])
    if (!section) continue
    for (const [name, value] of Object.entries(section)) {
      if (!name.startsWith(KERNEL_SCOPE_PREFIX) || typeof value !== 'string') continue
      declared[name] = value.trim()
    }
  }
  return declared
}

async function readCandidateDeclaredVersion(sha: string | null): Promise<{
  version: string | null
  error: string | null
}> {
  if (!sha) return { version: null, error: '没有候选提交 SHA，无法读取候选声明的版本。' }
  const repoDir = resolveRepoDir()
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoDir, 'show', `${sha}:package.json`], {
      timeout: 6000,
      maxBuffer: 2 * 1024 * 1024,
      encoding: 'utf8',
    })
    const parsed = JSON.parse(stdout) as { version?: unknown }
    const version = typeof parsed.version === 'string' ? parsed.version.trim() : ''
    return version
      ? { version, error: null }
      : { version: null, error: `候选 ${sha.slice(0, 8)} 的 package.json 没有 version` }
  } catch (error) {
    const err = error as Error & { stderr?: string }
    return {
      version: null,
      error: `无法读取候选 ${sha.slice(0, 8)} 的 package.json：${err?.stderr?.trim() || err?.message || String(error)}`,
    }
  }
}

type KernelManifestRead = {
  configured: boolean
  raw: unknown
  path: string | null
  error: string | null
}

/**
 * A kernel update target is only read from an operator-configured local
 * manifest. There is deliberately no fallback to a package registry's `latest`
 * tag: that would turn an unverified version into a suggested base upgrade.
 */
async function readKernelManifest(overridePath?: string | null): Promise<KernelManifestRead> {
  const configuredPath =
    overridePath === undefined
      ? process.env[KERNEL_UPDATE_SOURCE_ENV]?.trim() || ''
      : overridePath?.trim() || ''
  if (!configuredPath) {
    return { configured: false, raw: null, path: null, error: null }
  }
  try {
    const raw = await fs.readFile(configuredPath, 'utf8')
    return { configured: true, raw: JSON.parse(raw) as unknown, path: configuredPath, error: null }
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    return {
      configured: true,
      raw: null,
      path: configuredPath,
      error: `读取内核更新源 ${configuredPath} 失败：${err?.message ?? String(error)}`,
    }
  }
}

export type VersionReadOverrides = {
  now?: Date
  /** Test-only override: skip the environment variable. */
  kernelManifestPath?: string | null
}

export async function readVersionSurfaces(
  deployment: DeploymentStatus,
  overrides: VersionReadOverrides = {},
): Promise<VersionSurfaces> {
  const now = overrides.now ?? new Date()
  const running = deployment.running
  const notes: string[] = []

  if (!running.cwd) {
    notes.push('未能解析运行目录，无法读取内核与系统版本。')
    return buildVersionSurfaces({
      now,
      running: {
        version: running.version,
        sha: running.sha,
        shortSha: running.shortSha,
        builtAt: running.builtAt,
        cwd: null,
        kind: running.kind,
        source: running.source,
      },
      release: null,
      build: null,
      readErrors: ['未能解析运行目录。'],
      kernelPackages: [],
      declaredKernelDeps: {},
      kernelManifest: { configured: false, raw: null },
      candidate: deployment.candidate,
      relation: deployment.relation,
      behindCommits: deployment.behindCommits,
      declaredAppVersion: null,
      declaredAppVersionError: '没有运行目录，无法解析版本。',
      notes,
    })
  }

  const [artifacts, kernel, declaredKernelDeps, candidateVersion, manifest] = await Promise.all([
    readRunningArtifacts(running.cwd),
    readKernelPackages(running.cwd),
    readDeclaredKernelDeps(running.cwd),
    readCandidateDeclaredVersion(deployment.candidate.sha),
    readKernelManifest(overrides.kernelManifestPath),
  ])

  if (kernel.error) notes.push(kernel.error)
  if (artifacts.errors.length) notes.push(...artifacts.errors)
  if (manifest.error) notes.push(manifest.error)

  return buildVersionSurfaces({
    now,
    running: {
      version: running.version,
      sha: running.sha,
      shortSha: running.shortSha,
      builtAt: running.builtAt,
      cwd: running.cwd,
      kind: running.kind,
      source: running.source,
    },
    release: artifacts.release,
    build: artifacts.build,
    readErrors: artifacts.errors,
    kernelPackages: kernel.packages,
    declaredKernelDeps,
    kernelManifest: {
      configured: manifest.configured,
      raw: manifest.raw,
      path: manifest.path,
      error: manifest.error,
    },
    candidate: deployment.candidate,
    relation: deployment.relation,
    behindCommits: deployment.behindCommits,
    declaredAppVersion: candidateVersion.version,
    declaredAppVersionError: candidateVersion.error,
    notes,
  })
}
