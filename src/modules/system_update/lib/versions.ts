/**
 * Pure version model for the operator upgrade surface.
 *
 * The page answers two separate questions and must never blur them:
 *
 *  - **Kernel (Open Mercato base)**: which `@open-mercato/*` packages are
 *    actually installed in the running release slot, and — only when a
 *    verified update source exists — which base version could be adopted.
 *  - **App (ILA3)**: which semantic app version the running release slot was
 *    built as, and which release candidate the existing `origin/main` deploy
 *    chain would publish next.
 *
 * An app-only commit therefore only ever changes the app surface, and only a
 * base dependency change can change the kernel surface. A build SHA is tracked
 * separately from the semantic version. Nothing here touches the filesystem or
 * the network: the reader owns every read and every failure degrades to
 * `unknown` / `failed` / `unsupported` instead of inventing a version.
 */
import type { CandidateDeployment, DeployCiGate, DeployRelation } from './deployment'

export const KERNEL_SCOPE_PREFIX = '@open-mercato/'
export const KERNEL_PRIMARY_PACKAGE = '@open-mercato/core'

export type VersionReadStatus = 'ok' | 'unknown' | 'failed'

export type VersionTargetStatus =
  | 'available'
  | 'none'
  | 'blocked'
  | 'unsupported'
  | 'unknown'
  | 'failed'

export type VersionUpgradeSummary = 'none' | 'app' | 'kernel' | 'mixed' | 'unknown'

export type VersionSourceKind =
  | 'release-artifact'
  | 'installed-packages'
  | 'repo-candidate'
  | 'kernel-manifest'
  | 'none'

export type VersionSource = {
  kind: VersionSourceKind
  /** Short human label of where the number came from (never a version itself). */
  label: string
  /** Path / URL / run id that makes the label checkable. */
  detail: string | null
}

export type KernelPackageVersion = {
  name: string
  version: string
}

export type KernelSurface = {
  status: VersionReadStatus
  /** Actual installed version of the primary base package (`@open-mercato/core`). */
  currentVersion: string | null
  primaryPackage: string | null
  packages: KernelPackageVersion[]
  /** Every distinct installed version, ascending. More than one means drift. */
  distinctVersions: string[]
  /** Declared dependency value for the primary package in the release slot. */
  declaredVersion: string | null
  /** `null` when it cannot be decided (e.g. no packages readable). */
  consistent: boolean | null
  /** Human explanation of the drift; `null` when consistent or undecidable. */
  inconsistency: string | null
  error: string | null
  source: VersionSource
  targetVersion: string | null
  targetStatus: VersionTargetStatus
  targetSource: VersionSource
  compatibility: string | null
  migrationRisk: string | null
  targetError: string | null
  /** Context such as "no trusted kernel update source configured". */
  note: string | null
}

export type AppSurface = {
  status: VersionReadStatus
  currentVersion: string | null
  currentSha: string | null
  currentShortSha: string | null
  builtAt: string | null
  error: string | null
  /** Declared-vs-build disagreement inside the same release slot. */
  note: string | null
  source: VersionSource
  targetStatus: VersionTargetStatus
  /** Semantic version declared by the candidate commit — not a build SHA. */
  targetVersion: string | null
  targetSha: string | null
  targetShortSha: string | null
  targetCommittedAt: string | null
  targetSubject: string | null
  targetVersionNote: string | null
  relation: DeployRelation
  behindCommits: number | null
  ciGate: DeployCiGate | null
  targetSource: VersionSource
  targetError: string | null
}

export type VersionSurfaces = {
  checkedAt: string
  kernel: KernelSurface
  app: AppSurface
  summary: VersionUpgradeSummary
  notes: string[]
}

export type UpgradeTargetDecision = {
  /** `system` when the request may proceed; `null` when it must be refused. */
  target: 'system' | null
  allowed: boolean
  error: string | null
}

const SOURCE_RELEASE: VersionSource = {
  kind: 'release-artifact',
  label: '运行发布槽位（release.json / build-info.json）',
  detail: null,
}

const SOURCE_INSTALLED: VersionSource = {
  kind: 'installed-packages',
  label: '运行发布槽位实际安装的 @open-mercato/* 包',
  detail: null,
}

const SOURCE_NO_KERNEL_SOURCE: VersionSource = {
  kind: 'none',
  label: '未配置可信内核更新源',
  detail: null,
}

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

/** Strict `x.y.z` (optional leading `v`, optional prerelease/build suffix). */
export function parseSemver(value: string | null | undefined): [number, number, number] | null {
  if (!value) return null
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(value.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** -1 / 0 / 1, or `null` when either side is not a comparable `x.y.z`. */
export function compareSemver(a: string | null, b: string | null): number | null {
  const left = parseSemver(a)
  const right = parseSemver(b)
  if (!left || !right) return null
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1
  }
  return 0
}

/** A declared dependency is "exact" only when it is a bare version. */
export function isExactVersion(declared: string | null | undefined): boolean {
  if (!declared) return false
  return /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(declared.trim())
}

/**
 * Decide the kernel surface from the packages that are actually installed in
 * the running slot. The primary package's real version is always reported when
 * present — even when the set is inconsistent — because inventing one unified
 * version would misrepresent the running base.
 */
export function summarizeKernelPackages(
  packages: readonly KernelPackageVersion[],
  declared: Readonly<Record<string, string>> = {},
): Pick<
  KernelSurface,
  'currentVersion' | 'primaryPackage' | 'distinctVersions' | 'declaredVersion' | 'consistent' | 'inconsistency'
> {
  const sorted = [...packages].sort((a, b) => a.name.localeCompare(b.name))
  const distinctVersions = [...new Set(sorted.map((entry) => entry.version))].sort((a, b) => {
    const compared = compareSemver(a, b)
    if (compared !== null) return compared
    return a.localeCompare(b)
  })
  const primary = sorted.find((entry) => entry.name === KERNEL_PRIMARY_PACKAGE) ?? null
  const declaredVersion = declared[KERNEL_PRIMARY_PACKAGE] ?? null

  if (!sorted.length) {
    return {
      currentVersion: null,
      primaryPackage: null,
      distinctVersions,
      declaredVersion,
      consistent: null,
      inconsistency: null,
    }
  }

  // Without @open-mercato/core installed we can only report a unified version
  // when every package agrees; otherwise the version is genuinely unknown.
  const currentVersion =
    primary?.version ?? (distinctVersions.length === 1 ? distinctVersions[0] : null)

  const mismatches: string[] = []
  if (distinctVersions.length > 1) {
    mismatches.push(`已安装多个内核包版本：${distinctVersions.join(' / ')}`)
  }
  if (primary && declaredVersion && isExactVersion(declaredVersion) && declaredVersion !== primary.version) {
    mismatches.push(
      `发布槽位声明 ${KERNEL_PRIMARY_PACKAGE} 为 ${declaredVersion}，实际安装 ${primary.version}`,
    )
  }

  const namedMismatch = sorted.filter((entry) => {
    const range = declared[entry.name]
    return Boolean(range && isExactVersion(range) && range !== entry.version)
  })
  if (namedMismatch.length) {
    mismatches.push(
      `声明与实际不一致的包：${namedMismatch
        .map((entry) => `${entry.name}（声明 ${declared[entry.name]}，实际 ${entry.version}）`)
        .join('、')}`,
    )
  }

  return {
    currentVersion,
    primaryPackage: primary?.name ?? null,
    distinctVersions,
    declaredVersion,
    consistent: mismatches.length === 0,
    inconsistency: mismatches.length ? mismatches.join('；') : null,
  }
}

export type KernelManifestResult = {
  configured: boolean
  targetVersion: string | null
  targetStatus: VersionTargetStatus
  targetSource: VersionSource
  compatibility: string | null
  migrationRisk: string | null
  error: string | null
  note: string | null
}

/**
 * Map an explicitly configured kernel update manifest. A manifest only counts
 * as a verified source when it is a local file the operator opted into via
 * `ILA3_KERNEL_UPDATE_SOURCE`; `latest` on a package registry is deliberately
 * never consulted here.
 */
export function mapKernelManifest(
  raw: unknown,
  currentVersion: string | null,
  options: { configured: boolean; path?: string | null; readError?: string | null },
): KernelManifestResult {
  if (!options.configured) {
    return {
      configured: false,
      targetVersion: null,
      targetStatus: 'unsupported',
      targetSource: {
        kind: 'none',
        label: SOURCE_NO_KERNEL_SOURCE.label,
        detail: null,
      },
      compatibility: null,
      migrationRisk: null,
      error: null,
      note: '未配置可信内核更新源，暂不支持检测底座可升级目标。',
    }
  }

  const detail = options.path ?? null
  const source = (label: string): VersionSource => ({
    kind: 'kernel-manifest',
    label,
    detail,
  })

  if (options.readError) {
    return {
      configured: true,
      targetVersion: null,
      targetStatus: 'failed',
      targetSource: source('内核更新源读取失败'),
      compatibility: null,
      migrationRisk: null,
      error: options.readError,
      note: null,
    }
  }

  const record = asRecord(raw)
  if (!record) {
    return {
      configured: true,
      targetVersion: null,
      targetStatus: 'failed',
      targetSource: source('内核更新源返回的不是 JSON 对象'),
      compatibility: null,
      migrationRisk: null,
      error: '内核更新源不是 JSON 对象',
      note: null,
    }
  }
  if (record.schema !== 1) {
    return {
      configured: true,
      targetVersion: null,
      targetStatus: 'failed',
      targetSource: source('内核更新源 schema 不受支持'),
      compatibility: null,
      migrationRisk: null,
      error: `内核更新源 schema 必须为 1（实际 ${String(record.schema)}）`,
      note: null,
    }
  }

  const target = asRecord(record.target)
  const targetVersion = asText(target?.version)
  if (!targetVersion || !parseSemver(targetVersion)) {
    return {
      configured: true,
      targetVersion: null,
      targetStatus: 'failed',
      targetSource: source('内核更新源缺少合法的目标版本'),
      compatibility: null,
      migrationRisk: null,
      error: '内核更新源 target.version 不是合法的 x.y.z 版本',
      note: null,
    }
  }

  const manifestSource = asRecord(record.source)
  const label =
    asText(manifestSource?.label) ?? '内核更新源（本地已验证 manifest）'
  const targetSource: VersionSource = {
    kind: 'kernel-manifest',
    label,
    detail: asText(manifestSource?.url) ?? detail,
  }
  const compatibility = asText(target?.compatibility)
  const migrationRisk = asText(target?.migrationRisk)

  if (!currentVersion) {
    return {
      configured: true,
      targetVersion,
      targetStatus: 'unknown',
      targetSource,
      compatibility,
      migrationRisk,
      error: null,
      note: '当前内核版本未知，无法比较目标版本。',
    }
  }

  const compared = compareSemver(targetVersion, currentVersion)
  if (compared === null) {
    return {
      configured: true,
      targetVersion,
      targetStatus: 'unknown',
      targetSource,
      compatibility,
      migrationRisk,
      error: null,
      note: '当前或目标内核版本不是可比较的 x.y.z，无法判断是否有更新。',
    }
  }
  if (compared > 0) {
    return {
      configured: true,
      targetVersion,
      targetStatus: 'available',
      targetSource,
      compatibility,
      migrationRisk,
      error: null,
      note: null,
    }
  }
  return {
    configured: true,
    targetVersion,
    targetStatus: 'none',
    targetSource,
    compatibility,
    migrationRisk,
    error: null,
    note: compared < 0 ? '目标内核版本低于当前版本，不提供降级。' : null,
  }
}

export type AppCurrentResult = {
  currentVersion: string | null
  currentSha: string | null
  currentShortSha: string | null
  builtAt: string | null
  status: VersionReadStatus
  error: string | null
  note: string | null
  source: VersionSource
}

/**
 * Resolve the *running* app version from the release slot's own artifacts.
 * `running` is what `/proc/<pid>/cwd` resolved; it is used to label the source
 * and to supply a SHA when the manifest is missing, never to invent a version.
 */
export function mapAppCurrent(input: {
  release: Record<string, unknown> | null
  build: Record<string, unknown> | null
  running: {
    version: string | null
    sha: string | null
    shortSha: string | null
    builtAt: string | null
    cwd: string | null
    kind: string
    source: string
  }
  readErrors?: string[]
  now?: Date
}): AppCurrentResult {
  const { release, build, running } = input
  const readErrors = input.readErrors ?? []
  const releaseBuild = asRecord(release?.buildInfo)

  const releaseVersion = asText(release?.version)
  const buildVersion = asText(build?.version)
  const currentVersion = releaseVersion ?? buildVersion ?? running.version
  const sha = asText(release?.sha) ?? running.sha ?? asText(build?.commit)
  const shortSha =
    asText(release?.shortSha) ?? running.shortSha ?? (sha ? sha.slice(0, 8) : null)
  const builtAt =
    asIso(releaseBuild?.builtAt) ??
    asIso(release?.createdAt) ??
    asIso(build?.builtAt) ??
    running.builtAt

  const notes: string[] = []
  if (releaseVersion && buildVersion && releaseVersion !== buildVersion) {
    notes.push(`release.json 版本 ${releaseVersion} 与 build-info.json 版本 ${buildVersion} 不一致`)
  }
  if (!release && build) notes.push('运行槽位缺少 release.json，版本取自 build-info.json。')
  if (running.kind !== 'release') {
    notes.push('当前运行位置不是发布槽位，版本可能来自开发/临时目录。')
  }

  const status: VersionReadStatus = currentVersion ? 'ok' : sha ? 'unknown' : 'failed'
  const error =
    status === 'failed'
      ? readErrors.length
        ? readErrors.join('；')
        : '发布槽位没有可读的版本信息。'
      : null

  return {
    currentVersion,
    currentSha: sha,
    currentShortSha: shortSha,
    builtAt,
    status,
    error,
    note: notes.length ? notes.join('；') : null,
    source: {
      ...SOURCE_RELEASE,
      detail: running.cwd,
    },
  }
}

export type AppTargetResult = {
  targetStatus: VersionTargetStatus
  targetVersion: string | null
  targetSha: string | null
  targetShortSha: string | null
  targetCommittedAt: string | null
  targetSubject: string | null
  targetVersionNote: string | null
  relation: DeployRelation
  behindCommits: number | null
  ciGate: DeployCiGate | null
  targetSource: VersionSource
  targetError: string | null
}

/**
 * Resolve the app upgrade target from the candidate the existing deploy chain
 * would publish. The target semantic version is the one *declared by the
 * candidate commit* and is explicitly labelled as unbuilt; the SHA stays a
 * separate tracking field.
 */
export function mapAppTarget(input: {
  candidate: Pick<
    CandidateDeployment,
    'found' | 'sha' | 'shortSha' | 'source' | 'committedAt' | 'subject' | 'ciGate' | 'error'
  >
  relation: DeployRelation
  behindCommits: number | null
  declaredVersion: string | null
  declaredVersionError?: string | null
}): AppTargetResult {
  const { candidate, relation, behindCommits } = input
  const sourceLabels: Record<CandidateDeployment['source'], string> = {
    'origin/main': 'origin/main（本地跟踪 ref）',
    'gates/latest.json': 'gates/latest.json 发布门禁',
    none: '无候选来源',
  }
  const targetSource: VersionSource = {
    kind: candidate.found ? 'repo-candidate' : 'none',
    label: sourceLabels[candidate.source] ?? '无候选来源',
    detail: candidate.sha,
  }

  const declaredVersion = input.declaredVersion
  const versionNote = declaredVersion
    ? '候选提交声明的版本，尚未构建/验证。'
    : input.declaredVersionError
      ? `无法读取候选版本的声明：${input.declaredVersionError}`
      : '候选提交未声明可读的版本。'

  const base = {
    targetVersion: declaredVersion,
    targetSha: candidate.sha,
    targetShortSha: candidate.shortSha,
    targetCommittedAt: candidate.committedAt,
    targetSubject: candidate.subject,
    targetVersionNote: versionNote,
    relation,
    behindCommits,
    ciGate: candidate.ciGate,
    targetSource,
  }

  if (!candidate.found) {
    return {
      ...base,
      targetStatus: candidate.error ? 'failed' : 'unknown',
      targetError:
        candidate.error ??
        '未找到可比较的发布候选；不能判断是否存在系统更新。',
    }
  }

  if (relation === 'behind') {
    if (candidate.ciGate?.allow === false) {
      return {
        ...base,
        targetStatus: 'blocked',
        targetError: `候选已存在，但发布门禁未通过：${candidate.ciGate.reason ?? '原因未知'}`,
      }
    }
    return { ...base, targetStatus: 'available', targetError: null }
  }
  if (relation === 'same') {
    return { ...base, targetStatus: 'none', targetError: null }
  }
  if (relation === 'ahead') {
    return {
      ...base,
      targetStatus: 'none',
      targetError: null,
      targetVersionNote: `${versionNote} 当前运行版本领先于候选，不构成升级。`,
    }
  }
  if (relation === 'diverged') {
    return {
      ...base,
      targetStatus: 'unknown',
      targetError: '当前运行与候选已分叉，不能自动判断升级目标。',
    }
  }
  return {
    ...base,
    targetStatus: 'unknown',
    targetError: '无法判定当前运行与候选的关系，不能假称有升级。',
  }
}

/** App availability wins over kernel only when both are known; otherwise report mixed. */
export function summarizeUpgrades(
  kernelStatus: VersionTargetStatus,
  appStatus: VersionTargetStatus,
): VersionUpgradeSummary {
  const kernelAvailable = kernelStatus === 'available'
  const appAvailable = appStatus === 'available'
  if (kernelAvailable && appAvailable) return 'mixed'
  if (appAvailable) return 'app'
  if (kernelAvailable) return 'kernel'
  const unresolved: VersionTargetStatus[] = ['failed', 'blocked', 'unknown']
  if (unresolved.includes(kernelStatus) || unresolved.includes(appStatus)) return 'unknown'
  return 'none'
}

/**
 * The upgrade action only ever publishes the app release. A kernel/base request
 * is refused server-side: this goal does not authorize dependency upgrades,
 * migrations or permission-model changes, and there is no verified one-click
 * base upgrade path.
 */
export function classifyUpgradeTarget(raw: unknown): UpgradeTargetDecision {
  if (raw === undefined || raw === null || raw === '') {
    return { target: 'system', allowed: true, error: null }
  }
  if (typeof raw !== 'string') {
    return { target: null, allowed: false, error: 'invalid target' }
  }
  const value = raw.trim().toLowerCase()
  if (value === 'system' || value === 'app') {
    return { target: 'system', allowed: true, error: null }
  }
  if (value === 'kernel' || value === 'base' || value === 'open-mercato') {
    return {
      target: null,
      allowed: false,
      error:
        'kernel/base upgrades are not available from this action; they require a verified dependency upgrade flow',
    }
  }
  return { target: null, allowed: false, error: 'invalid target' }
}

export type BuildVersionSurfacesInput = {
  now?: Date
  running: Parameters<typeof mapAppCurrent>[0]['running']
  release: Record<string, unknown> | null
  build: Record<string, unknown> | null
  readErrors?: string[]
  kernelPackages: KernelPackageVersion[]
  declaredKernelDeps: Record<string, string>
  kernelManifest: { configured: boolean; raw: unknown; path?: string | null; error?: string | null }
  candidate: Pick<
    CandidateDeployment,
    'found' | 'sha' | 'shortSha' | 'source' | 'committedAt' | 'subject' | 'ciGate' | 'error'
  >
  relation: DeployRelation
  behindCommits: number | null
  declaredAppVersion: string | null
  declaredAppVersionError?: string | null
  notes?: string[]
}

/** Compose the two surfaces from already-read inputs (used by the reader and tests). */
export function buildVersionSurfaces(input: BuildVersionSurfacesInput): VersionSurfaces {
  const now = input.now ?? new Date()
  const notes = [...(input.notes ?? [])]

  const appCurrent = mapAppCurrent({
    release: input.release,
    build: input.build,
    running: input.running,
    readErrors: input.readErrors,
    now,
  })
  const appTarget = mapAppTarget({
    candidate: input.candidate,
    relation: input.relation,
    behindCommits: input.behindCommits,
    declaredVersion: input.declaredAppVersion,
    declaredVersionError: input.declaredAppVersionError,
  })

  const kernelSummary = summarizeKernelPackages(input.kernelPackages, input.declaredKernelDeps)
  const kernelManifest = mapKernelManifest(input.kernelManifest.raw, kernelSummary.currentVersion, {
    configured: input.kernelManifest.configured,
    path: input.kernelManifest.path ?? null,
    readError: input.kernelManifest.error ?? null,
  })

  const kernelStatus: VersionReadStatus = input.kernelPackages.length ? 'ok' : 'unknown'
  const kernelError = input.kernelPackages.length
    ? null
    : '运行发布槽位缺少 node_modules/@open-mercato，无法读取实际内核版本。'
  if (kernelError) notes.push(kernelError)
  if (kernelSummary.inconsistency) notes.push(kernelSummary.inconsistency)
  if (kernelManifest.note) notes.push(kernelManifest.note)

  const kernel: KernelSurface = {
    status: kernelStatus,
    currentVersion: kernelSummary.currentVersion,
    primaryPackage: kernelSummary.primaryPackage,
    packages: [...input.kernelPackages].sort((a, b) => a.name.localeCompare(b.name)),
    distinctVersions: kernelSummary.distinctVersions,
    declaredVersion: kernelSummary.declaredVersion,
    consistent: kernelSummary.consistent,
    inconsistency: kernelSummary.inconsistency,
    error: kernelError,
    source: {
      ...SOURCE_INSTALLED,
      detail: input.running.cwd,
    },
    targetVersion: kernelManifest.targetVersion,
    targetStatus: kernelManifest.targetStatus,
    targetSource: kernelManifest.targetSource,
    compatibility: kernelManifest.compatibility,
    migrationRisk: kernelManifest.migrationRisk,
    targetError: kernelManifest.error,
    note: kernelManifest.note,
  }

  const app: AppSurface = {
    status: appCurrent.status,
    currentVersion: appCurrent.currentVersion,
    currentSha: appCurrent.currentSha,
    currentShortSha: appCurrent.currentShortSha,
    builtAt: appCurrent.builtAt,
    error: appCurrent.error,
    note: appCurrent.note,
    source: appCurrent.source,
    targetStatus: appTarget.targetStatus,
    targetVersion: appTarget.targetVersion,
    targetSha: appTarget.targetSha,
    targetShortSha: appTarget.targetShortSha,
    targetCommittedAt: appTarget.targetCommittedAt,
    targetSubject: appTarget.targetSubject,
    targetVersionNote: appTarget.targetVersionNote,
    relation: appTarget.relation,
    behindCommits: appTarget.behindCommits,
    ciGate: appTarget.ciGate,
    targetSource: appTarget.targetSource,
    targetError: appTarget.targetError,
  }

  return {
    checkedAt: now.toISOString(),
    kernel,
    app,
    summary: summarizeUpgrades(kernel.targetStatus, app.targetStatus),
    notes,
  }
}
