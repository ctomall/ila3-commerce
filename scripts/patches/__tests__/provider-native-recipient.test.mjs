#!/usr/bin/env node
/**
 * Contract test for the ADR-006 A managed patch.
 *
 * The hub is a prebuilt dependency: a `yarn install` silently drops patches, and
 * a patch that half-applies would leave the CRM answering 422 for every WhatsApp
 * / Messenger send while looking healthy. This asserts the two things the feature
 * actually depends on:
 *   1. the manifest declares both patch ids and their targets;
 *   2. the installed bytes contain the wiring (recipient validation + the
 *      `to` hand-off to the adapter), not just a marker comment.
 *
 * Run with `node scripts/patches/__tests__/provider-native-recipient.test.mjs`.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (file) => fs.readFileSync(file, 'utf8')
const manifest = JSON.parse(read('scripts/patches/manifest.json'))
const ids = new Set(manifest.patches.map((patch) => patch.id))

assert.ok(ids.has('send-as-user-provider-native'), 'manifest declares the provider-native patch')
assert.ok(ids.has('send-as-user-team-channel'), 'manifest declares the team-channel patch')

const sendAsUser = read(
  'node_modules/@open-mercato/core/dist/modules/communication_channels/lib/send-as-user.js',
)
assert.match(
  sendAsUser,
  /\[patched:provider-native-recipient\]/,
  'send-as-user carries the provider-native marker',
)
assert.match(
  sendAsUser,
  /validateOutboundRecipient\(input\.to\[0\]/,
  'the recipient is validated against the adapter shape',
)
assert.match(
  sendAsUser,
  /externalEmail: providerNative \? void 0 : input\.to\[0\]/,
  'a chat recipient is not forced through the e-mail validator',
)
assert.match(
  sendAsUser,
  /sourceChannelType: channel\.channelType/,
  'compose learns the channel type from the channel row, not from caller input',
)
assert.match(sendAsUser, /\[patched:team-channel-send\]/, 'team channel policy is applied')
assert.match(
  sendAsUser,
  /sentByUserId: actor\.userId/,
  'a non-owner send is attributable on the link row',
)

const deliver = read(
  'node_modules/@open-mercato/core/dist/modules/communication_channels/commands/deliver-outbound-message.js',
)
assert.match(deliver, /\[patched:provider-native-recipient\]/, 'deliver-outbound carries the marker')
assert.match(
  deliver,
  /recipientFormat === "provider-native"/,
  'only a provider-native adapter receives the raw recipient',
)
assert.match(deliver, /\{ to: baseMetadata\.to\[0\] \}/, 'the stored recipient becomes metadata.to')

// E-mail keeps the old behaviour: the new branch must be gated by the capability.
assert.match(
  sendAsUser,
  /providerNative = adapterCapabilities\?\.recipientFormat === "provider-native"/,
  'provider-native behaviour is capability-gated',
)

console.log('provider-native recipient contract: ok')
