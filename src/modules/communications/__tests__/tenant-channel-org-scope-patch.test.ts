import { describe, expect, it } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Contract test for `scripts/patches/apply-tenant-channel-org-scope.mjs`.
 * Proves the transform on a temp mirror; the shared install is never modified.
 */
describe('tenant-channel-org-scope managed patch', () => {
  const repoRoot = process.cwd()
  const scriptPath = path.join(repoRoot, 'scripts/patches/apply-tenant-channel-org-scope.mjs')
  const relativeTarget =
    'node_modules/@open-mercato/core/dist/modules/communication_channels/commands/connect-credential-channel.js'

  function runPatch(repoRootOverride: string): string {
    return execFileSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, OM_PATCH_REPO_ROOT: repoRootOverride },
    })
  }

  it('keeps the acting organization on the channel row and credentials, idempotently', () => {
    const script = fs.readFileSync(scriptPath, 'utf8')
    expect(script).toContain('/* [patched:tenant-channel-org-scope] */')
    expect(script).toContain(relativeTarget)

    const original = fs.readFileSync(path.join(repoRoot, relativeTarget), 'utf8')
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'om-tenant-org-'))
    try {
      const destination = path.join(tempRoot, relativeTarget)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(path.join(repoRoot, relativeTarget), destination)

      runPatch(tempRoot)
      const patched = fs.readFileSync(destination, 'utf8')
      expect(patched).toContain('/* [patched:tenant-channel-org-scope] */')
      expect(patched).toContain('organizationId: input.scope.organizationId ?? input.scope.tenantId,')
      expect(patched).toContain('organizationId: input.scope.organizationId ?? null')
      expect(patched).not.toContain('organizationId: tenantScoped ? null :')
      execFileSync(process.execPath, ['--check', destination], { encoding: 'utf8' })

      const beforeSecond = fs.readFileSync(destination, 'utf8')
      runPatch(tempRoot)
      expect(fs.readFileSync(destination, 'utf8')).toBe(beforeSecond)
      expect(fs.readFileSync(path.join(repoRoot, relativeTarget), 'utf8')).toBe(original)
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})
