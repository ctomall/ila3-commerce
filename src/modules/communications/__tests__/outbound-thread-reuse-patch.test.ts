import { describe, expect, it } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Contract test for `scripts/patches/apply-outbound-thread-reuse.mjs`.
 *
 * The patch is intentionally NOT applied to the shared node_modules install
 * (it is under review). This proves the transform against the CURRENT installed
 * bytes without mutating them: mirror the dist target into a temp root, run the
 * real script there through its `OM_PATCH_REPO_ROOT` proof hook, then assert the
 * transform, idempotency, ESM syntax, and that the shared file is untouched.
 */
describe('outbound-thread-reuse managed patch', () => {
  const repoRoot = process.cwd()
  const scriptPath = path.join(repoRoot, 'scripts/patches/apply-outbound-thread-reuse.mjs')
  const relativeTarget =
    'node_modules/@open-mercato/core/dist/modules/communication_channels/lib/send-as-user.js'

  function runPatch(repoRootOverride: string): string {
    return execFileSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, OM_PATCH_REPO_ROOT: repoRootOverride },
    })
  }

  it('applies to the current installed bytes, is idempotent, and leaves the shared install untouched', () => {
    const script = fs.readFileSync(scriptPath, 'utf8')
    expect(script).toContain('/* [patched:outbound-thread-reuse] */')
    expect(script).toContain(relativeTarget)

    const original = fs.readFileSync(path.join(repoRoot, relativeTarget), 'utf8')

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'om-outbound-thread-'))
    try {
      const destination = path.join(tempRoot, relativeTarget)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(path.join(repoRoot, relativeTarget), destination)

      const first = runPatch(tempRoot)
      expect(first).toContain('replies reuse the inbound conversation instead of creating an outbound one')

      const patched = fs.readFileSync(destination, 'utf8')

      // The anchor-matching transform produced the reviewed behavior.
      expect(patched).toContain('/* [patched:outbound-thread-reuse] */')
      expect(patched).toContain('let externalThreadRef = `outbound:${messageThreadId}`;')
      expect(patched).toContain('if (input.parentMessageId) {')
      expect(patched).toContain('messageId: input.parentMessageId')
      expect(patched).toContain('direction: "inbound"')
      expect(patched).toContain('id: parentLink.externalConversationId')
      expect(patched).toContain('parentConversation.channelId === channel.id')
      expect(patched).toContain('externalThreadRef = parentConversation.externalConversationId;')
      // The legacy fallback is still the initializer.
      expect(patched).toContain('outbound thread reuse lookup failed; using outbound thread key')

      // Patched file must still parse as ESM.
      execFileSync(process.execPath, ['--check', destination], { encoding: 'utf8' })

      // Idempotent: a second apply must not change a byte.
      const beforeSecond = fs.readFileSync(destination, 'utf8')
      const second = runPatch(tempRoot)
      expect(second).toContain('replies reuse the inbound conversation instead of creating an outbound one')
      expect(fs.readFileSync(destination, 'utf8')).toBe(beforeSecond)

      // The proof run cannot have touched the shared install.
      expect(fs.readFileSync(path.join(repoRoot, relativeTarget), 'utf8')).toBe(original)
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})
