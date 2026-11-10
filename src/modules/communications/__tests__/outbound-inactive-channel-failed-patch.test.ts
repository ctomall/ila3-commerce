import { describe, expect, it } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Contract test for `scripts/patches/apply-outbound-inactive-channel-failed.mjs`.
 * The patch is NOT applied to the shared install; the transform is proven on a
 * temp mirror of the current installed bytes.
 */
describe('outbound-inactive-channel-failed managed patch', () => {
  const repoRoot = process.cwd()
  const scriptPath = path.join(repoRoot, 'scripts/patches/apply-outbound-inactive-channel-failed.mjs')
  const relativeTarget =
    'node_modules/@open-mercato/core/dist/modules/communication_channels/commands/deliver-outbound-message.js'

  function runPatch(repoRootOverride: string): string {
    return execFileSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, OM_PATCH_REPO_ROOT: repoRootOverride },
    })
  }

  it('applies to the current installed bytes, is idempotent, and leaves the shared install untouched', () => {
    const script = fs.readFileSync(scriptPath, 'utf8')
    expect(script).toContain('/* [patched:outbound-inactive-channel-failed] */')
    expect(script).toContain(relativeTarget)

    const original = fs.readFileSync(path.join(repoRoot, relativeTarget), 'utf8')
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'om-inactive-channel-'))
    try {
      const destination = path.join(tempRoot, relativeTarget)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(path.join(repoRoot, relativeTarget), destination)

      const first = runPatch(tempRoot)
      expect(first).toContain('sends to a missing/inactive channel mark their outbound link failed')

      const patched = fs.readFileSync(destination, 'utf8')
      expect(patched).toContain('/* [patched:outbound-inactive-channel-failed] */')
      expect(patched).toContain('if (!channel || !channel.isActive) {')
      expect(patched).toContain('const failureReason = channel ? "channel_inactive" : "channel_missing";')
      expect(patched).toContain('messageId: message.id')
      expect(patched).toContain('direction: "outbound"')
      expect(patched).toContain('strandedLink.deliveryStatus = "failed";')
      expect(patched).toContain('lastError: failureReason,')
      expect(patched).toContain('"communication_channels.message.delivery_failed"')
      expect(patched).toContain('throw new Error(failureMessage);')
      // No original throw block remains.
      expect(patched).not.toContain('throw new Error(\n        `[internal] Channel ${mapping.channelId} not found')

      execFileSync(process.execPath, ['--check', destination], { encoding: 'utf8' })

      const beforeSecond = fs.readFileSync(destination, 'utf8')
      const second = runPatch(tempRoot)
      expect(second).toContain('sends to a missing/inactive channel mark their outbound link failed')
      expect(fs.readFileSync(destination, 'utf8')).toBe(beforeSecond)

      expect(fs.readFileSync(path.join(repoRoot, relativeTarget), 'utf8')).toBe(original)
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})
