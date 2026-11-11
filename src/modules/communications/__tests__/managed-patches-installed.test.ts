import { describe, expect, it } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Guard: the install this app runs must carry every managed patch the delivery
 * depends on.
 *
 * `scripts/verify-patches.mjs` and the post-deploy check cover the claim and
 * attempt-unknown patches on a release, but nothing asserted
 * `outbound-inactive-channel-failed` in an installed tree. A silently dropped
 * patch would leave the rest of the suite green while production reverted to
 * throwing on an inactive channel and leaving the link queued.
 *
 * Test-only: it reads the installed artifact, it does not apply anything.
 */
const INSTALLED_COMMAND = path.join(
  process.cwd(),
  'node_modules/@open-mercato/core/dist/modules/communication_channels/commands/deliver-outbound-message.js',
)

describe('managed patches in the installed module', () => {
  it('carries the claim, attempt-unknown and inactive-channel patches', () => {
    const source = fs.readFileSync(INSTALLED_COMMAND, 'utf8')
    expect(source).toContain('/* [patched:outbound-concurrent-claim] */')
    expect(source).toContain('/* [patched:outbound-attempt-unknown] */')
    expect(source).toContain('/* [patched:outbound-inactive-channel-failed] */')
  })
})
