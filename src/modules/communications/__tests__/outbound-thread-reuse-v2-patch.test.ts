import { describe, expect, it } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Contract test for `scripts/patches/apply-outbound-thread-reuse-v2.mjs`.
 * Temp mirror of the current installed bytes; shared install untouched.
 */
describe('outbound-thread-reuse-v2 managed patch', () => {
  const repoRoot = process.cwd()
  const scriptPath = path.join(repoRoot, 'scripts/patches/apply-outbound-thread-reuse-v2.mjs')
  const relativeTarget =
    'node_modules/@open-mercato/core/dist/modules/communication_channels/lib/send-as-user.js'

  function runPatch(repoRootOverride: string): string {
    return execFileSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, OM_PATCH_REPO_ROOT: repoRootOverride },
    })
  }

  it('adds the org fallbacks and updates the mapping in place, idempotently', () => {
    const script = fs.readFileSync(scriptPath, 'utf8')
    expect(script).toContain('/* [patched:outbound-thread-reuse-v2] */')
    expect(script).toContain(relativeTarget)

    const original = fs.readFileSync(path.join(repoRoot, relativeTarget), 'utf8')
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'om-thread-reuse-v2-'))
    try {
      const destination = path.join(tempRoot, relativeTarget)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(path.join(repoRoot, relativeTarget), destination)

      const first = runPatch(tempRoot)
      expect(first).toContain('replies reuse the inbound conversation without a mapping conflict')

      const patched = fs.readFileSync(destination, 'utf8')
      expect(patched).toContain('/* [patched:outbound-thread-reuse-v2] */')
      expect(patched).toContain('let externalThreadRef = `outbound:${messageThreadId}`;')
      expect(patched).toContain('if (input.parentMessageId) {')
      expect(patched).toContain('direction: "inbound"')
      // Parent link and conversation each try the org-scoped read, then a
      // tenant-only read.
      expect(patched).toContain('messageId: input.parentMessageId,\n            tenantId,\n            direction: "inbound"')
      expect(patched).toContain('id: parentLink.externalConversationId,\n              tenantId\n')
      // Conversation upsert has the tenant-only fallback.
      expect(patched).toContain('externalConversationId: externalThreadRef,\n          tenantId\n        },')
      // Mapping lookup matches the real unique key (no organizationId) and
      // updates in place instead of inserting.
      expect(patched).toContain('externalConversationId: conversation.id,\n        tenantId\n      },')
      expect(patched).toContain('existingMapping.externalThreadRef = externalThreadRef;')
      expect(patched).toContain('existingMapping.messageThreadId = messageThreadId;')
      expect(patched).toContain('existingMapping.channelId = channel.id;')
      expect(patched).toContain('existingMapping.providerKey = channel.providerKey;')

      execFileSync(process.execPath, ['--check', destination], { encoding: 'utf8' })

      const beforeSecond = fs.readFileSync(destination, 'utf8')
      const second = runPatch(tempRoot)
      expect(second).toContain('replies reuse the inbound conversation without a mapping conflict')
      expect(fs.readFileSync(destination, 'utf8')).toBe(beforeSecond)

      expect(fs.readFileSync(path.join(repoRoot, relativeTarget), 'utf8')).toBe(original)
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})
