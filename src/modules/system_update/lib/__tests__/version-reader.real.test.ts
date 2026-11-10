/**
 * Opt-in contract check against the real release artifacts on this host.
 *
 * CI has no production release slot, so the suite is skipped unless
 * `ILA3_REAL_VERSION_ARTIFACTS=1` is set explicitly. It proves the reader
 * reports the running app/kernel versions from the real slot instead of a
 * hardcoded or source-checkout value.
 */
import { describe, expect, it } from '@jest/globals'
import { readDeploymentStatus } from '../deployment-reader'
import { readVersionSurfaces } from '../version-reader'

const enabled = process.env.ILA3_REAL_VERSION_ARTIFACTS === '1'
const maybe = enabled ? describe : describe.skip

maybe('version reader against the real running release slot', () => {
  it('reads the app semantic version, its SHA and the installed kernel packages', async () => {
    const deployment = await readDeploymentStatus()
    const versions = await readVersionSurfaces(deployment)

    // The app version must be a semantic version from release.json, and the SHA
    // must remain a separate tracking field.
    expect(versions.app.currentVersion).toMatch(/^\d+\.\d+\.\d+/)
    expect(versions.app.currentSha).toMatch(/^[0-9a-f]{40}$/)
    expect(versions.app.currentVersion).not.toBe(versions.app.currentSha)

    // The kernel version comes from the installed @open-mercato/* packages.
    expect(versions.kernel.packages.length).toBeGreaterThan(0)
    expect(versions.kernel.currentVersion).toMatch(/^\d+\.\d+\.\d+/)
    expect(versions.kernel.packages.every((pkg) => pkg.name.startsWith('@open-mercato/'))).toBe(true)
    expect(versions.kernel.consistent).toBe(true)

    // Without ILA3_KERNEL_UPDATE_SOURCE the target is unsupported, never "latest".
    expect(versions.kernel.targetStatus).toBe('unsupported')
    expect(versions.kernel.targetVersion).toBeNull()
  }, 30000)

  it('reads a configured kernel manifest and reports its target honestly', async () => {
    const deployment = await readDeploymentStatus()
    const versions = await readVersionSurfaces(deployment, {
      kernelManifestPath:
        '/storage/artifacts/pro/crm-version-goal/fixtures/kernel-target.simulated.json',
    })

    expect(versions.kernel.targetStatus).toBe('available')
    expect(versions.kernel.targetVersion).toBe('0.10.0')
    expect(versions.kernel.compatibility).toContain('SIMULATED')
    expect(versions.kernel.migrationRisk).toContain('SIMULATED')
  }, 30000)

  it('reports a failing kernel source as failed, never as an update', async () => {
    const deployment = await readDeploymentStatus()
    const versions = await readVersionSurfaces(deployment, {
      kernelManifestPath: '/storage/artifacts/pro/crm-version-goal/fixtures/missing.json',
    })

    expect(versions.kernel.targetStatus).toBe('failed')
    expect(versions.kernel.targetVersion).toBeNull()
  }, 30000)
})
