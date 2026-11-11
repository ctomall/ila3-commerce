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
    // The claim patch is asserted by its own statement shape, not just a marker:
    // the atomic UPDATE ... RETURNING and its empty-result short-circuit.
    expect(source).toContain('claimRows')
    expect(source).toContain("jsonb_set(coalesce(channel_metadata, '{}'::jsonb), '{attempting}'")
    expect(source).toContain('returning id`')
    expect(source).toMatch(/claimRows\.length === 0[\s\S]{0,120}?already_delivered/)
    // Attempt-unknown and inactive-channel transforms.
    expect(source).toContain('isUnknownSendOutcome')
    expect(source).toContain('markOutboundAttemptUnknown')
    expect(source).toContain('local_commit_failed')
    expect(source).toContain('channel_inactive')
  })

  it('the worker treats an unknown outcome as terminal instead of re-enqueueing', () => {
    const source = fs.readFileSync(WORKER, 'utf8')

    expect(source).toContain('/* [patched:outbound-attempt-unknown] */')
    // Tight match on the branch body: warn, then return, then straight into
    // `case "failed"`. A loose "some return within N chars" would also pass if
    // the branch fell through to the re-enqueueing failure path.
    expect(source).toMatch(
      /case "unknown":\s*logger\.warn\("delivery outcome unknown; leaving the link for reconciliation",\s*\{[\s\S]*?\}\);\s*return;\s*case "failed":/,
    )
  })
})
