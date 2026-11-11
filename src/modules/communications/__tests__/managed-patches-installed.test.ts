import { describe, expect, it } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Guard: the install this app runs must carry every managed patch the delivery
 * depends on.
 *
 * `scripts/verify-patches.mjs` and the post-deploy check gate the claim and
 * attempt-unknown patches on a release, but nothing asserted
 * `outbound-inactive-channel-failed` in an installed tree. A silently dropped
 * patch left the rest of the suite green while production reverted to throwing
 * on an inactive channel and leaving the link queued.
 *
 * The assertions cover the transformed code, not only the marker comments: a
 * half-applied body can keep a marker while losing the behavior it stands for.
 * This is a static guard — it proves the shipped artifact contains the patched
 * logic, not that it runs; the runtime drills prove the behavior.
 *
 * Test-only: it reads the installed artifact, it does not apply anything.
 */
const DIST = path.join(
  process.cwd(),
  'node_modules/@open-mercato/core/dist/modules/communication_channels',
)
const COMMAND = path.join(DIST, 'commands/deliver-outbound-message.js')
const WORKER = path.join(DIST, 'workers/outbound-delivery.js')

describe('managed patches in the installed module', () => {
  it('the command carries the claim, unknown-outcome and inactive-channel transforms', () => {
    const source = fs.readFileSync(COMMAND, 'utf8')

    // Markers for the three patches applied to this file.
    expect(source).toContain('/* [patched:outbound-concurrent-claim] */')
    expect(source).toContain('/* [patched:outbound-attempt-unknown] */')
    expect(source).toContain('/* [patched:outbound-inactive-channel-failed] */')

    // Behavior those markers stand for: symbols a half-applied transform loses.
    expect(source).toContain('isUnknownSendOutcome')
    expect(source).toContain('markOutboundAttemptUnknown')
    expect(source).toContain('local_commit_failed')
    expect(source).toContain('channel_inactive')
  })

  it('the worker treats an unknown outcome as terminal instead of re-enqueueing', () => {
    const source = fs.readFileSync(WORKER, 'utf8')

    expect(source).toContain('/* [patched:outbound-attempt-unknown] */')
    expect(source).toContain('delivery outcome unknown; leaving the link for reconciliation')
    // The unknown branch must return before the retry branches; a branch that
    // falls through to `failed` would re-enqueue an already-uncertain send.
    expect(source).toMatch(/case "unknown":[\s\S]{0,600}?return;/)
  })
})
