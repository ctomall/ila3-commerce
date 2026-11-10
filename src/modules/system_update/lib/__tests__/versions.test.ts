import { describe, expect, it } from '@jest/globals'
import {
  buildVersionSurfaces,
  classifyUpgradeTarget,
  compareSemver,
  mapAppCurrent,
  mapAppTarget,
  mapKernelManifest,
  summarizeKernelPackages,
  summarizeUpgrades,
  type BuildVersionSurfacesInput,
} from '../versions'

const NOW = new Date('2026-11-10T02:30:00.000Z')
const RUNNING = {
  version: '0.1.2',
  sha: '03ff493f8a587bae4524dd1c5062a2595863f911',
  shortSha: '03ff493f',
  builtAt: '2026-11-10T01:54:06.369Z',
  cwd: '/home/pro/releases/mercato/03ff493f8a587bae4524dd1c5062a2595863f911',
  kind: 'release',
  source: 'proc',
}
const RELEASE = {
  schema: 1,
  sha: '03ff493f8a587bae4524dd1c5062a2595863f911',
  shortSha: '03ff493f',
  version: '0.1.2',
  createdAt: '2026-11-10T02:04:47.164Z',
  buildInfo: { version: '0.1.2', commit: '03ff493f', builtAt: '2026-11-10T01:54:06.369Z' },
}
const BUILD = { version: '0.1.2', commit: '03ff493f', builtAt: '2026-11-10T01:54:06.369Z' }
const CANDIDATE = {
  found: true,
  sha: 'd0268835727b1b44d1ddfd6d7a99508cb142afc3',
  shortSha: 'd0268835',
  source: 'origin/main' as const,
  committedAt: '2026-11-10T02:20:00.000Z',
  subject: 'test(db): restore the daily backup',
  ciGate: { allow: true, decision: 'allow', reason: 'successful-test-workflow-for-sha' },
  error: null,
}
const KERNEL_PACKAGES = [
  { name: '@open-mercato/core', version: '0.9.0' },
  { name: '@open-mercato/shared', version: '0.9.0' },
  { name: '@open-mercato/ui', version: '0.9.0' },
]
const DECLARED = {
  '@open-mercato/core': '0.9.0',
  '@open-mercato/shared': '0.9.0',
  '@open-mercato/ui': '0.9.0',
}

function input(overrides: Partial<BuildVersionSurfacesInput> = {}): BuildVersionSurfacesInput {
  return {
    now: NOW,
    running: RUNNING,
    release: RELEASE,
    build: BUILD,
    kernelPackages: KERNEL_PACKAGES,
    declaredKernelDeps: DECLARED,
    kernelManifest: { configured: false, raw: null },
    candidate: CANDIDATE,
    relation: 'behind',
    behindCommits: 1,
    declaredAppVersion: '0.1.2',
    ...overrides,
  }
}

describe('summarizeKernelPackages', () => {
  it('reports the actual installed version when every package agrees', () => {
    const summary = summarizeKernelPackages(KERNEL_PACKAGES, DECLARED)
    expect(summary.currentVersion).toBe('0.9.0')
    expect(summary.distinctVersions).toEqual(['0.9.0'])
    expect(summary.consistent).toBe(true)
    expect(summary.inconsistency).toBeNull()
    expect(summary.primaryPackage).toBe('@open-mercato/core')
  })

  it('reports the real core version and the drift instead of a unified version', () => {
    const summary = summarizeKernelPackages(
      [
        { name: '@open-mercato/core', version: '0.9.0' },
        { name: '@open-mercato/shared', version: '0.9.1' },
      ],
      { '@open-mercato/core': '0.9.0' },
    )
    expect(summary.currentVersion).toBe('0.9.0')
    expect(summary.distinctVersions).toEqual(['0.9.0', '0.9.1'])
    expect(summary.consistent).toBe(false)
    expect(summary.inconsistency).toContain('0.9.0 / 0.9.1')
  })

  it('flags a declared pin that differs from the installed package', () => {
    const summary = summarizeKernelPackages(
      [{ name: '@open-mercato/core', version: '0.9.1' }],
      { '@open-mercato/core': '0.9.0' },
    )
    expect(summary.consistent).toBe(false)
    expect(summary.inconsistency).toContain('声明 @open-mercato/core 为 0.9.0，实际安装 0.9.1')
  })

  it('does not invent a version when no package is readable', () => {
    const summary = summarizeKernelPackages([], {})
    expect(summary.currentVersion).toBeNull()
    expect(summary.consistent).toBeNull()
  })

  it('reports the installed version verbatim, never the app package version', () => {
    const summary = summarizeKernelPackages([{ name: '@open-mercato/core', version: '0.10.3' }], {})
    expect(summary.currentVersion).toBe('0.10.3')
  })
})

describe('mapKernelManifest', () => {
  it('is unsupported (not "latest") when no trusted source is configured', () => {
    const result = mapKernelManifest(null, '0.9.0', { configured: false })
    expect(result.targetStatus).toBe('unsupported')
    expect(result.targetVersion).toBeNull()
    expect(result.note).toContain('暂不支持检测')
  })

  it('reports an available kernel target with compatibility and migration risk', () => {
    const result = mapKernelManifest(
      {
        schema: 1,
        source: { label: 'verified om release feed', url: 'https://example.test/om-feed.json' },
        target: {
          version: '0.10.0',
          compatibility: '应用依赖需同步升级',
          migrationRisk: '含数据库迁移，需先演练',
        },
      },
      '0.9.0',
      { configured: true, path: '/tmp/om-feed.json' },
    )
    expect(result.targetStatus).toBe('available')
    expect(result.targetVersion).toBe('0.10.0')
    expect(result.compatibility).toBe('应用依赖需同步升级')
    expect(result.migrationRisk).toBe('含数据库迁移，需先演练')
    expect(result.targetSource.detail).toBe('https://example.test/om-feed.json')
  })

  it('reports none when the target equals the running kernel version', () => {
    const result = mapKernelManifest({ schema: 1, target: { version: '0.9.0' } }, '0.9.0', {
      configured: true,
    })
    expect(result.targetStatus).toBe('none')
  })

  it('never offers a downgrade', () => {
    const result = mapKernelManifest({ schema: 1, target: { version: '0.8.9' } }, '0.9.0', {
      configured: true,
    })
    expect(result.targetStatus).toBe('none')
    expect(result.note).toContain('不提供降级')
  })

  it('fails closed on a malformed manifest or unreadable source', () => {
    expect(mapKernelManifest({ schema: 2 }, '0.9.0', { configured: true }).targetStatus).toBe('failed')
    expect(
      mapKernelManifest({ schema: 1, target: { version: 'not-a-version' } }, '0.9.0', {
        configured: true,
      }).targetStatus,
    ).toBe('failed')
    const readError = mapKernelManifest(null, '0.9.0', {
      configured: true,
      path: '/nope.json',
      readError: '读取失败',
    })
    expect(readError.targetStatus).toBe('failed')
    expect(readError.error).toBe('读取失败')
  })

  it('cannot compare when the running kernel version is unknown', () => {
    const result = mapKernelManifest({ schema: 1, target: { version: '0.9.1' } }, null, {
      configured: true,
    })
    expect(result.targetStatus).toBe('unknown')
  })
})

describe('mapAppCurrent', () => {
  it('uses the release artifact version and keeps SHA/build time as tracking fields', () => {
    const result = mapAppCurrent({ release: RELEASE, build: BUILD, running: RUNNING })
    expect(result.currentVersion).toBe('0.1.2')
    expect(result.currentSha).toBe('03ff493f8a587bae4524dd1c5062a2595863f911')
    expect(result.currentShortSha).toBe('03ff493f')
    expect(result.builtAt).toBe('2026-11-10T01:54:06.369Z')
    expect(result.status).toBe('ok')
  })

  it('surfaces a release/build disagreement instead of picking a false unified version', () => {
    const result = mapAppCurrent({
      release: { ...RELEASE, version: '0.1.2' },
      build: { ...BUILD, version: '0.1.3' },
      running: RUNNING,
    })
    expect(result.currentVersion).toBe('0.1.2')
    expect(result.note).toContain('不一致')
  })

  it('fails closed when no version or SHA is readable', () => {
    const result = mapAppCurrent({
      release: null,
      build: null,
      running: { ...RUNNING, version: null, sha: null, shortSha: null, builtAt: null },
      readErrors: ['release.json 不可读'],
    })
    expect(result.status).toBe('failed')
    expect(result.currentVersion).toBeNull()
    expect(result.error).toContain('release.json 不可读')
  })

  it('labels a non-release cwd as a possible dev build', () => {
    const result = mapAppCurrent({
      release: null,
      build: BUILD,
      running: { ...RUNNING, cwd: '/home/pro/apps/mercato', kind: 'dev', source: 'process.cwd' },
    })
    expect(result.note).toContain('不是发布槽位')
  })
})

describe('mapAppTarget', () => {
  it('marks a behind candidate as an app update and labels its version as declared-only', () => {
    const result = mapAppTarget({
      candidate: CANDIDATE,
      relation: 'behind',
      behindCommits: 3,
      declaredVersion: '0.1.3',
    })
    expect(result.targetStatus).toBe('available')
    expect(result.targetVersion).toBe('0.1.3')
    expect(result.targetVersionNote).toContain('尚未构建')
    expect(result.targetSha).toBe(CANDIDATE.sha)
  })

  it('blocks a candidate whose release gate denied it', () => {
    const result = mapAppTarget({
      candidate: { ...CANDIDATE, ciGate: { allow: false, decision: 'deny', reason: 'no-successful-test-run-for-sha' } },
      relation: 'behind',
      behindCommits: 1,
      declaredVersion: '0.1.3',
    })
    expect(result.targetStatus).toBe('blocked')
    expect(result.targetError).toContain('no-successful-test-run-for-sha')
  })

  it('reports no update when running and candidate are the same commit', () => {
    const result = mapAppTarget({
      candidate: CANDIDATE,
      relation: 'same',
      behindCommits: 0,
      declaredVersion: '0.1.2',
    })
    expect(result.targetStatus).toBe('none')
  })

  it('never calls an ahead or diverged relation an upgrade', () => {
    expect(
      mapAppTarget({ candidate: CANDIDATE, relation: 'ahead', behindCommits: null, declaredVersion: '0.1.2' })
        .targetStatus,
    ).toBe('none')
    expect(
      mapAppTarget({ candidate: CANDIDATE, relation: 'diverged', behindCommits: null, declaredVersion: '0.1.3' })
        .targetStatus,
    ).toBe('unknown')
  })

  it('fails closed when the candidate cannot be read', () => {
    expect(
      mapAppTarget({
        candidate: { ...CANDIDATE, found: false, sha: null, error: 'git unavailable' },
        relation: 'unknown',
        behindCommits: null,
        declaredVersion: null,
      }).targetStatus,
    ).toBe('failed')
    expect(
      mapAppTarget({
        candidate: { ...CANDIDATE, found: false, sha: null, error: null },
        relation: 'unknown',
        behindCommits: null,
        declaredVersion: null,
      }).targetStatus,
    ).toBe('unknown')
  })
})

describe('summarizeUpgrades', () => {
  it('app-only change is an app update, never a kernel update', () => {
    expect(summarizeUpgrades('none', 'available')).toBe('app')
    expect(summarizeUpgrades('unsupported', 'available')).toBe('app')
  })

  it('kernel-only change is a kernel update, never an app update', () => {
    expect(summarizeUpgrades('available', 'none')).toBe('kernel')
  })

  it('both targets are mixed; unresolved checks are unknown; otherwise none', () => {
    expect(summarizeUpgrades('available', 'available')).toBe('mixed')
    expect(summarizeUpgrades('failed', 'none')).toBe('unknown')
    expect(summarizeUpgrades('none', 'blocked')).toBe('unknown')
    expect(summarizeUpgrades('unsupported', 'none')).toBe('none')
  })
})

describe('classifyUpgradeTarget', () => {
  it('defaults to the existing system action', () => {
    expect(classifyUpgradeTarget(undefined)).toEqual({ target: 'system', allowed: true, error: null })
    expect(classifyUpgradeTarget('system').allowed).toBe(true)
    expect(classifyUpgradeTarget('app').target).toBe('system')
  })

  it('refuses a kernel/base request server-side', () => {
    for (const value of ['kernel', 'base', 'open-mercato', 'KERNEL']) {
      const decision = classifyUpgradeTarget(value)
      expect(decision.allowed).toBe(false)
      expect(decision.target).toBeNull()
      expect(decision.error).toContain('kernel/base')
    }
  })

  it('rejects an unknown target instead of falling back to system', () => {
    expect(classifyUpgradeTarget('everything').allowed).toBe(false)
    expect(classifyUpgradeTarget(42).allowed).toBe(false)
  })
})

describe('compareSemver', () => {
  it('compares x.y.z only', () => {
    expect(compareSemver('0.9.0', '0.10.0')).toBe(-1)
    expect(compareSemver('v0.9.0', '0.9.0')).toBe(0)
    expect(compareSemver('1.0.0', '0.9.9')).toBe(1)
    expect(compareSemver('next', '0.9.0')).toBeNull()
  })
})

describe('buildVersionSurfaces', () => {
  it('an app-only candidate produces a system update and an unsupported kernel target', () => {
    const surfaces = buildVersionSurfaces(input())
    expect(surfaces.summary).toBe('app')
    expect(surfaces.app.currentVersion).toBe('0.1.2')
    expect(surfaces.app.targetStatus).toBe('available')
    expect(surfaces.app.targetVersion).toBe('0.1.2')
    expect(surfaces.kernel.currentVersion).toBe('0.9.0')
    expect(surfaces.kernel.targetStatus).toBe('unsupported')
    // The kernel is never upgraded just because the app candidate moved.
    expect(surfaces.kernel.packages.every((pkg) => pkg.version === '0.9.0')).toBe(true)
  })

  it('a kernel manifest target with an unchanged app is a kernel update only', () => {
    const surfaces = buildVersionSurfaces(
      input({
        relation: 'same',
        behindCommits: 0,
        kernelManifest: {
          configured: true,
          path: '/tmp/om-feed.json',
          raw: { schema: 1, target: { version: '0.10.0', migrationRisk: '需迁移' } },
        },
      }),
    )
    expect(surfaces.summary).toBe('kernel')
    expect(surfaces.kernel.targetStatus).toBe('available')
    expect(surfaces.kernel.targetVersion).toBe('0.10.0')
    expect(surfaces.app.targetStatus).toBe('none')
  })

  it('mixed upgrade lists both targets but keeps them distinct', () => {
    const surfaces = buildVersionSurfaces(
      input({
        kernelManifest: { configured: true, raw: { schema: 1, target: { version: '0.10.0' } } },
      }),
    )
    expect(surfaces.summary).toBe('mixed')
    expect(surfaces.app.targetStatus).toBe('available')
    expect(surfaces.kernel.targetStatus).toBe('available')
    expect(surfaces.app.targetVersion).toBe('0.1.2')
    expect(surfaces.kernel.targetVersion).toBe('0.10.0')
  })

  it('exposes kernel package drift in the surface', () => {
    const surfaces = buildVersionSurfaces(
      input({
        kernelPackages: [
          { name: '@open-mercato/core', version: '0.9.0' },
          { name: '@open-mercato/shared', version: '0.9.1' },
        ],
      }),
    )
    expect(surfaces.kernel.consistent).toBe(false)
    expect(surfaces.kernel.inconsistency).toContain('0.9.1')
    expect(surfaces.kernel.currentVersion).toBe('0.9.0')
  })

  it('unknown candidate plus a failing kernel source is reported as unknown, not "latest"', () => {
    const surfaces = buildVersionSurfaces(
      input({
        candidate: { ...CANDIDATE, found: false, sha: null, error: 'origin/main 不可读' },
        relation: 'unknown',
        behindCommits: null,
        declaredAppVersion: null,
        declaredAppVersionError: '无候选',
        kernelManifest: { configured: true, raw: null, path: '/nope.json', error: '读取失败' },
      }),
    )
    expect(surfaces.summary).toBe('unknown')
    expect(surfaces.app.targetStatus).toBe('failed')
    expect(surfaces.kernel.targetStatus).toBe('failed')
  })

  it('missing installed kernel packages are unknown, never a default version', () => {
    const surfaces = buildVersionSurfaces(input({ kernelPackages: [], declaredKernelDeps: {} }))
    expect(surfaces.kernel.status).toBe('unknown')
    expect(surfaces.kernel.currentVersion).toBeNull()
    expect(surfaces.kernel.error).toContain('node_modules/@open-mercato')
  })

  it('keeps the app current version from the release artifact, not the candidate', () => {
    const surfaces = buildVersionSurfaces(
      input({ release: { ...RELEASE, version: '0.1.1' }, declaredAppVersion: '0.1.3' }),
    )
    expect(surfaces.app.currentVersion).toBe('0.1.1')
    expect(surfaces.app.targetVersion).toBe('0.1.3')
  })
})
