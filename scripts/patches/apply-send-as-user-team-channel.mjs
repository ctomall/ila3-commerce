#!/usr/bin/env node
/**
 * Managed patch (team-send policy A): an employee may send through a channel the
 * team shares, not only through the mailbox they personally own.
 *
 * `sendAsUser` refused with 403 unless `channel.userId === actor.userId`. That is
 * correct for a personal mailbox, but it also refused every tenant/team channel
 * (`CommunicationChannel.visibility` other than `private`), so a shared WhatsApp
 * number or a team inbox had no product path to send at all — the round-17 drill
 * recorded it as the "team-shared channel" decision (A/B/C).
 *
 * Policy A (user-approved): team-shared channels are sendable by any employee who
 * can already see them, and each such send is attributable:
 *   - the facade logs `channelId` + `actorUserId` + `ownerUserId`;
 *   - the resulting MessageChannelLink carries `sentByUserId` and
 *     `teamSharedChannel`, so the audit trail survives without a second table.
 *
 * Private channels keep the ownership rule unchanged.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'

const MARKER = '/* [patched:team-channel-send] */'
const TARGET =
  'node_modules/@open-mercato/core/dist/modules/communication_channels/lib/send-as-user.js'

const OLD = `  if (channel.userId !== actor.userId) {
    return { ok: false, status: 403, error: "You can only send through channels you own" };
  }`

const NEW = `  ${MARKER}
  // Policy A: a team-shared channel is sendable by any employee who can see it;
  // a private channel keeps the owner-only rule. The send is attributed below.
  const teamSharedChannel =
    channel.userId !== actor.userId &&
    typeof channel.visibility === "string" &&
    channel.visibility !== "private";
  if (channel.userId !== actor.userId && !teamSharedChannel) {
    return { ok: false, status: 403, error: "You can only send through channels you own or a team-shared channel" };
  }
  if (teamSharedChannel) {
    logger.info("team-shared channel send authorized", {
      channelId: channel.id,
      providerKey: channel.providerKey,
      actorUserId: actor.userId,
      ownerUserId: channel.userId
    });
  }`

const source = fs.readFileSync(TARGET, 'utf8')
if (!source.includes(MARKER)) {
  const hits = source.split(OLD).length - 1
  if (hits !== 1) {
    throw new Error(`[patches] team-channel-send: expected exactly one match, found ${hits}`)
  }
  fs.writeFileSync(TARGET, source.replace(OLD, NEW))
}

// Attribution on the link row: audit without a second table.
const AUDIT_MARKER = '/* [patched:team-channel-audit] */'
let updated = fs.readFileSync(TARGET, 'utf8')
if (!updated.includes(AUDIT_MARKER)) {
  const anchor = `        ...input.channelMetadata ?? {},`
  const hits = updated.split(anchor).length - 1
  if (hits !== 1) {
    throw new Error(`[patches] team-channel-audit: expected exactly one match, found ${hits}`)
  }
  updated = updated.replace(
    anchor,
    `${anchor}
        ${AUDIT_MARKER}
        ...(actor.userId !== channel.userId ? { sentByUserId: actor.userId, teamSharedChannel: true } : {}),`,
  )
  fs.writeFileSync(TARGET, updated)
}

console.log('team-shared channel send authorized with attribution')
