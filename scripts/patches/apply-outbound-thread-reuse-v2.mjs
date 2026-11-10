#!/usr/bin/env node
/**
 * Managed patch (P6-v2): reuse the inbound conversation WITHOUT a mapping
 * unique-constraint conflict.
 *
 * The v1 reuse patch matched the parent conversation and the
 * `ChannelThreadMapping` with an exact `organizationId`. In the real shape —
 * channel `organization_id = O`, inbound conversation/link/mapping
 * `organization_id = NULL` — both reads miss:
 *   - the conversation upsert creates `outbound:<threadId>` (second
 *     conversation);
 *   - the mapping insert hits `channel_thread_mappings_ext_conv_uq`
 *     (`external_conversation_id`, `tenant_id`) → reply 500.
 *
 * This patch:
 *   (a) resolves the parent link with an org-scoped read then a tenant-only
 *       read, and the parent conversation the same way (channel + external key
 *       + tenant, org-scoped first, then tenant-only);
 *   (b) reads the conversation by `(channel, externalConversationId, tenant)`
 *       with the same org fallback, so a reused org-null row is found instead
 *       of duplicated;
 *   (c) reads `ChannelThreadMapping` by `(externalConversationId, tenantId)`
 *       only — matching the real unique key — and UPDATES
 *       externalThreadRef/messageThreadId/channelId/providerKey when found,
 *       instead of inserting;
 *   (d) keeps the legacy `outbound:<threadId>` key when no parent link exists.
 *
 * No schema/adapter/queue change. Idempotent; asserted by
 * scripts/verify-patches.mjs (while applied).
 * Proof hook: `OM_PATCH_REPO_ROOT`; default cwd.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:outbound-thread-reuse-v2] */'
const TARGET =
  'node_modules/@open-mercato/core/dist/modules/communication_channels/lib/send-as-user.js'
const ROOT = process.env.OM_PATCH_REPO_ROOT || process.cwd()

const REF_ANCHOR = '  const externalThreadRef = `outbound:${messageThreadId}`;'

const REF_REPLACEMENT = [
  '  let externalThreadRef = `outbound:${messageThreadId}`;',
  `  ${MARKER}`,
  '  // A reply must continue the conversation the parent message belongs to. The',
  '  // parent link / conversation may carry organization_id = null while the actor',
  '  // has a selected org, so every read falls back to a tenant-only scope. A miss',
  '  // keeps the legacy outbound:<threadId> key.',
  '  if (input.parentMessageId) {',
  '    try {',
  '      let parentLink = await findOneWithDecryption(',
  '        em,',
  '        MessageChannelLink,',
  '        {',
  '          messageId: input.parentMessageId,',
  '          tenantId,',
  '          organizationId,',
  '          direction: "inbound"',
  '        },',
  '        void 0,',
  '        dscope',
  '      );',
  '      if (!parentLink) {',
  '        parentLink = await findOneWithDecryption(',
  '          em,',
  '          MessageChannelLink,',
  '          {',
  '            messageId: input.parentMessageId,',
  '            tenantId,',
  '            direction: "inbound"',
  '          },',
  '          void 0,',
  '          dscope',
  '        );',
  '      }',
  '      if (parentLink?.externalConversationId) {',
  '        let parentConversation = await findOneWithDecryption(',
  '          em,',
  '          ExternalConversation,',
  '          {',
  '            id: parentLink.externalConversationId,',
  '            tenantId,',
  '            organizationId',
  '          },',
  '          void 0,',
  '          dscope',
  '        );',
  '        if (!parentConversation) {',
  '          parentConversation = await findOneWithDecryption(',
  '            em,',
  '            ExternalConversation,',
  '            {',
  '              id: parentLink.externalConversationId,',
  '              tenantId',
  '            },',
  '            void 0,',
  '            dscope',
  '          );',
  '        }',
  '        if (parentConversation && parentConversation.channelId === channel.id) {',
  '          externalThreadRef = parentConversation.externalConversationId;',
  '        }',
  '      }',
  '    } catch (lookupError) {',
  '      logger.warn("outbound thread reuse lookup failed; using outbound thread key", {',
  '        parentMessageId: input.parentMessageId,',
  '        err: lookupError',
  '      });',
  '    }',
  '  }',
].join('\n')

const CONVERSATION_ANCHOR = [
  '    let conversation = await findOneWithDecryption(',
  '      em,',
  '      ExternalConversation,',
  '      {',
  '        channelId: channel.id,',
  '        externalConversationId: externalThreadRef,',
  '        tenantId,',
  '        organizationId',
  '      },',
  '      void 0,',
  '      dscope',
  '    );',
].join('\n')

const CONVERSATION_REPLACEMENT = [
  CONVERSATION_ANCHOR,
  '    if (!conversation) {',
  '      // A reused inbound conversation can carry organization_id = null while',
  '      // the actor has a selected org. The unique key is (channel, external id),',
  '      // so a tenant-only second read is unambiguous and avoids a second row.',
  '      conversation = await findOneWithDecryption(',
  '        em,',
  '        ExternalConversation,',
  '        {',
  '          channelId: channel.id,',
  '          externalConversationId: externalThreadRef,',
  '          tenantId',
  '        },',
  '        void 0,',
  '        dscope',
  '      );',
  '    }',
].join('\n')

const MAPPING_ANCHOR = [
  '    const existingMapping = await findOneWithDecryption(',
  '      em,',
  '      ChannelThreadMapping,',
  '      {',
  '        externalConversationId: conversation.id,',
  '        tenantId,',
  '        organizationId',
  '      },',
  '      void 0,',
  '      dscope',
  '    );',
  '    if (!existingMapping) {',
  '      const mapping = em.create(ChannelThreadMapping, {',
  '        externalConversationId: conversation.id,',
  '        messageThreadId,',
  '        channelId: channel.id,',
  '        providerKey: channel.providerKey,',
  '        externalThreadRef,',
  '        assignedUserId: actor.userId,',
  '        tenantId,',
  '        organizationId',
  '      });',
  '      em.persist(mapping);',
  '    }',
].join('\n')

const MAPPING_REPLACEMENT = [
  '    const existingMapping = await findOneWithDecryption(',
  '      em,',
  '      ChannelThreadMapping,',
  '      {',
  '        externalConversationId: conversation.id,',
  '        tenantId',
  '      },',
  '      void 0,',
  '      dscope',
  '    );',
  '    if (!existingMapping) {',
  '      const mapping = em.create(ChannelThreadMapping, {',
  '        externalConversationId: conversation.id,',
  '        messageThreadId,',
  '        channelId: channel.id,',
  '        providerKey: channel.providerKey,',
  '        externalThreadRef,',
  '        assignedUserId: actor.userId,',
  '        tenantId,',
  '        organizationId',
  '      });',
  '      em.persist(mapping);',
  '    } else {',
  '      // The real unique key is (external_conversation_id, tenant_id); the',
  '      // inbound mapping may carry organization_id = null. Update it in place',
  '      // (no insert, no unique violation) so the reply joins the same thread.',
  '      existingMapping.externalThreadRef = externalThreadRef;',
  '      existingMapping.messageThreadId = messageThreadId;',
  '      existingMapping.channelId = channel.id;',
  '      existingMapping.providerKey = channel.providerKey;',
  '      await em.flush();',
  '    }',
].join('\n')

function replaceOnce(source, from, to, label) {
  const hits = source.split(from).length - 1
  if (hits !== 1) {
    throw new Error(`[patches] outbound-thread-reuse-v2: ${label}: expected exactly one anchor, found ${hits}`)
  }
  return source.replace(from, () => to)
}

function read() {
  return fs.readFileSync(path.join(ROOT, TARGET), 'utf8')
}

let source = read()
if (!source.includes(MARKER)) {
  source = replaceOnce(source, REF_ANCHOR, REF_REPLACEMENT, 'externalThreadRef')
  source = replaceOnce(source, CONVERSATION_ANCHOR, CONVERSATION_REPLACEMENT, 'conversation lookup')
  source = replaceOnce(source, MAPPING_ANCHOR, MAPPING_REPLACEMENT, 'mapping lookup')
  fs.writeFileSync(path.join(ROOT, TARGET), source)
}

console.log('replies reuse the inbound conversation without a mapping conflict')
