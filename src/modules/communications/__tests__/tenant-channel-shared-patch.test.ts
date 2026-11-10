import { describe, expect, it } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Contract test for `scripts/patches/apply-tenant-channel-shared.mjs`.
 * Proves the transform on a temp mirror of the current installed bytes; the
 * shared install is never modified.
 */
describe('tenant-channel-shared managed patch', () => {
  const repoRoot = process.cwd()
  const scriptPath = path.join(repoRoot, 'scripts/patches/apply-tenant-channel-shared.mjs')
  const relativeTarget =
    'node_modules/@open-mercato/core/dist/modules/communication_channels/lib/connect-channel.js'

  function runPatch(repoRootOverride: string): string {
    return execFileSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, OM_PATCH_REPO_ROOT: repoRootOverride },
    })
  }

  it('marks tenant-scoped channels shared on create and reconnect, idempotently', () => {
    const script = fs.readFileSync(scriptPath, 'utf8')
    expect(script).toContain('/* [patched:tenant-channel-shared] */')
    expect(script).toContain(relativeTarget)

    const original = fs.readFileSync(path.join(repoRoot, relativeTarget), 'utf8')
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'om-tenant-shared-'))
    try {
      const destination = path.join(tempRoot, relativeTarget)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(path.join(repoRoot, relativeTarget), destination)

      const first = runPatch(tempRoot)
      expect(first).toContain('tenant-scoped channels are shared on create and reconnect')

      const patched = fs.readFileSync(destination, 'utf8')
      expect(patched).toContain('/* [patched:tenant-channel-shared] */')
      expect(patched).toContain('const tenantScoped = adapter.channelScope === "tenant";')
      expect(patched).toContain('if (tenantScoped) target.visibility = "shared";')
      expect(patched).toContain('visibility: tenantScoped ? "shared" : "private",')
      // Per-user channels are not rewritten unconditionally.
      expect(patched).not.toContain('target.visibility = "private"')

      execFileSync(process.execPath, ['--check', destination], { encoding: 'utf8' })

      const beforeSecond = fs.readFileSync(destination, 'utf8')
      const second = runPatch(tempRoot)
      expect(second).toContain('tenant-scoped channels are shared on create and reconnect')
      expect(fs.readFileSync(destination, 'utf8')).toBe(beforeSecond)

      expect(fs.readFileSync(path.join(repoRoot, relativeTarget), 'utf8')).toBe(original)
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})
