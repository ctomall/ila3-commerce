import { describe, expect, it } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Contract test for `scripts/patches/apply-outbound-attempt-unknown.mjs`.
 *
 * The patch is intentionally NOT applied to the shared node_modules install yet
 * (it is under review and the build would apply it to every install). This test
 * proves the transform against the CURRENT installed bytes without mutating
 * them: it mirrors the two dist targets into a temp root, runs the real patch
 * script there via its `OM_PATCH_REPO_ROOT` proof hook, and checks the result.
 *
 * When the patch is approved and applied, this test keeps working: it asserts
 * the shared files are unchanged BY THE TEST, not that they lack the marker.
 */
describe('outbound-attempt-unknown managed patch', () => {
  const repoRoot = process.cwd()
  const scriptPath = path.join(repoRoot, 'scripts/patches/apply-outbound-attempt-unknown.mjs')
  const relativeTargets = [
    'node_modules/@open-mercato/core/dist/modules/communication_channels/commands/deliver-outbound-message.js',
    'node_modules/@open-mercato/core/dist/modules/communication_channels/workers/outbound-delivery.js',
  ]

  function runPatch(repoRootOverride: string): string {
    return execFileSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, OM_PATCH_REPO_ROOT: repoRootOverride },
    })
  }

  it('applies to the current installed bytes, is idempotent, and leaves the shared install untouched', () => {
    const script = fs.readFileSync(scriptPath, 'utf8')
    expect(script).toContain('/* [patched:outbound-attempt-unknown] */')
    expect(script).toContain(relativeTargets[0])
    expect(script).toContain(relativeTargets[1])

    const original = new Map(relativeTargets.map((relative) => [relative, fs.readFileSync(path.join(repoRoot, relative), 'utf8')]))

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'om-outbound-attempt-'))
    try {
      for (const relative of relativeTargets) {
        const destination = path.join(tempRoot, relative)
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        fs.copyFileSync(path.join(repoRoot, relative), destination)
      }

      const first = runPatch(tempRoot)
      expect(first).toContain('unknown outbound outcomes are marked instead of blindly retried')

      const command = fs.readFileSync(path.join(tempRoot, relativeTargets[0]), 'utf8')
      const worker = fs.readFileSync(path.join(tempRoot, relativeTargets[1]), 'utf8')

      // The anchor-matching transform really produced the behavior we reviewed.
      expect(command).toContain('/* [patched:outbound-attempt-unknown] */')
      expect(command).toContain('const OUTBOUND_ATTEMPT_LEASE_MS = 2 * 60 * 1000;')
      expect(command).toContain('async function markOutboundAttemptUnknown(args)')
      expect(command).toContain('markOutboundAttemptUnknown({')
      expect(command).toContain('attempting: true,')
      expect(command).toContain('link.deliveryStatus = "unknown";')
      expect(command).toContain('reason: "local_commit_failed"')
      expect(command).toContain('reason: "unknown_result"')
      expect(command).toContain('"attempt_lease_expired"')
      expect(command).toContain('"attempt_marker_present"')
      expect(command).toContain('providerAccepted = true;')
      expect(command).toContain('localCommitDone = true;')
      expect(command).toContain('if (providerAccepted && localCommitDone)')
      expect(command).toContain('...providerExternalMessageId ? { providerExternalMessageId } : {}')
      expect(worker).toContain('/* [patched:outbound-attempt-unknown] */')
      expect(worker).toContain('case "unknown":')
      expect(worker).toContain('leaving the link for reconciliation')

      // The patched files must still parse as ESM.
      for (const relative of relativeTargets) {
        execFileSync(process.execPath, ['--check', path.join(tempRoot, relative)], { encoding: 'utf8' })
      }

      // Idempotent: a second apply must not change a byte.
      const beforeSecond = fs.readFileSync(path.join(tempRoot, relativeTargets[0]), 'utf8')
      const second = runPatch(tempRoot)
      expect(second).toContain('unknown outbound outcomes are marked instead of blindly retried')
      expect(fs.readFileSync(path.join(tempRoot, relativeTargets[0]), 'utf8')).toBe(beforeSecond)

      // The proof run cannot have touched the shared install.
      for (const relative of relativeTargets) {
        expect(fs.readFileSync(path.join(repoRoot, relative), 'utf8')).toBe(original.get(relative))
      }
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})
