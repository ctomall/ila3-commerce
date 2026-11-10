#!/usr/bin/env node
/**
 * Managed patch: a missing or inactive channel must fail the outbound link, not
 * throw before the link is located.
 *
 * The installed `deliver_outbound_message` loads the channel and throws
 * immediately when it is missing or `isActive === false`:
 *
 *     if (!channel) throw new Error('[internal] Channel ... not found ...')
 *     if (!channel.isActive) throw new Error('... is inactive; refusing ...')
 *
 * Both throws happen BEFORE the `MessageChannelLink` lookup, so a send that
 * already has a queued/pending link keeps that in-flight status forever. The
 * worker's retries end in a queue failure while the UI/reconciler still sees a
 * non-terminal delivery.
 *
 * This patch replaces the two throws with one block that:
 *   1. looks up the outbound link for `message.id` (tenant/org scoped,
 *      direction "outbound");
 *   2. if found (and not already sent/delivered/read), sets
 *      `delivery_status = "failed"`, records
 *      `channel_metadata.lastError = "channel_inactive"|"channel_missing"`, and
 *      emits `communication_channels.message.delivery_failed` (best effort,
 *      persistent);
 *   3. flushes and returns a terminal `failed` result instead of throwing;
 *   4. if no link exists there is nothing to mark, so the original throw is
 *      preserved unchanged.
 *
 * No adapter/queue/schema change; the patch only touches this one branch.
 * Idempotent; asserted by scripts/verify-patches.mjs (while applied).
 *
 * Proof hook: `OM_PATCH_REPO_ROOT` mirrors the repo root for temp-mirror runs;
 * the default is the current working directory.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:outbound-inactive-channel-failed] */'
const TARGET =
  'node_modules/@open-mercato/core/dist/modules/communication_channels/commands/deliver-outbound-message.js'
const ROOT = process.env.OM_PATCH_REPO_ROOT || process.cwd()

const FROM = [
  '    if (!channel) {',
  '      throw new Error(',
  '        `[internal] Channel ${mapping.channelId} not found for tenant ${input.scope.tenantId} (or has been deleted)`',
  '      );',
  '    }',
  '    if (!channel.isActive) {',
  '      throw new Error(`[internal] Channel ${mapping.channelId} is inactive; refusing to deliver outbound`);',
  '    }',
].join('\n')

const TO = [
  '    if (!channel || !channel.isActive) {',
  '      const failureReason = channel ? "channel_inactive" : "channel_missing";',
  '      const failureMessage = channel ? `[internal] Channel ${mapping.channelId} is inactive; refusing to deliver outbound` : `[internal] Channel ${mapping.channelId} not found for tenant ${input.scope.tenantId} (or has been deleted)`;',
  `      ${MARKER}`,
  '      // A missing/inactive channel is terminal for this message. Without this',
  '      // the queued/pending link never leaves the in-flight state, so neither the',
  '      // UI nor a reconciler can see the failure. Mark the existing outbound',
  '      // link failed and stop. No link => keep the original throw.',
  '      let strandedLink = null;',
  '      try {',
  '        strandedLink = await findOneWithDecryption(',
  '          em,',
  '          MessageChannelLink,',
  '          {',
  '            messageId: message.id,',
  '            tenantId: input.scope.tenantId,',
  '            organizationId: input.scope.organizationId ?? null,',
  '            direction: "outbound"',
  '          },',
  '          void 0,',
  '          dscope',
  '        );',
  '      } catch (lookupError) {',
  '        strandedLink = null;',
  '      }',
  '      if (strandedLink) {',
  '        if (strandedLink.deliveryStatus === "sent" || strandedLink.deliveryStatus === "delivered" || strandedLink.deliveryStatus === "read") {',
  '          return {',
  '            status: "already_delivered",',
  '            messageId: message.id,',
  '            channelLinkId: strandedLink.id',
  '          };',
  '        }',
  '        strandedLink.deliveryStatus = "failed";',
  '        strandedLink.channelMetadata = {',
  '          ...strandedLink.channelMetadata ?? {},',
  '          lastError: failureReason,',
  '          lastErrorAt: (new Date()).toISOString(),',
  '          transient: false,',
  '          requiresReauth: false',
  '        };',
  '        await em.flush();',
  '        try {',
  '          await emitCommunicationChannelsEvent(',
  '            "communication_channels.message.delivery_failed",',
  '            {',
  '              messageId: message.id,',
  '              channelLinkId: strandedLink.id,',
  '              conversationId: mapping.externalConversationId,',
  '              channelId: mapping.channelId,',
  '              providerKey: channel?.providerKey ?? strandedLink.providerKey,',
  '              channelType: channel?.channelType ?? strandedLink.channelType ?? "unknown",',
  '              transient: false,',
  '              error: failureReason,',
  '              status: null,',
  '              tenantId: input.scope.tenantId,',
  '              organizationId: input.scope.organizationId ?? null',
  '            },',
  '            { persistent: true }',
  '          );',
  '        } catch {',
  '        }',
  '        return {',
  '          status: "failed",',
  '          messageId: message.id,',
  '          channelLinkId: strandedLink.id,',
  '          providerKey: channel?.providerKey ?? strandedLink.providerKey,',
  '          error: failureReason,',
  '          transient: false,',
  '          requiresReauth: false',
  '        };',
  '      }',
  '      throw new Error(failureMessage);',
  '    }',
].join('\n')

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8')
}

function replaceOnce(source, from, to, label) {
  const hits = source.split(from).length - 1
  if (hits !== 1) {
    throw new Error(`[patches] outbound-inactive-channel-failed: ${label}: expected exactly one anchor, found ${hits}`)
  }
  return source.replace(from, () => to)
}

let source = read(TARGET)
if (!source.includes(MARKER)) {
  source = replaceOnce(source, FROM, TO, 'channel guards')
  fs.writeFileSync(path.join(ROOT, TARGET), source)
}

console.log('sends to a missing/inactive channel mark their outbound link failed')
