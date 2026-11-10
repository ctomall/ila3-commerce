#!/usr/bin/env node
/**
 * Managed patch: a reply sent through the web composer must continue the
 * inbound conversation it answers, not open a second `outbound:<threadId>` one.
 *
 * The installed `sendAsUser` computes
 *
 *     const externalThreadRef = `outbound:${messageThreadId}`
 *
 * and upserts `ExternalConversation` by `(channelId, externalConversationId)`.
 * For a reply, that key never matches the conversation created by inbound
 * ingest (`external_conversation_id` = the provider thread, e.g. a WhatsApp
 * wa_id or an e-mail address), so every reply creates a second conversation and
 * a second `ChannelThreadMapping`. The inbox then shows the inbound thread and
 * the reply separately.
 *
 * This patch keeps the legacy key as the fallback, but when the caller supplied
 * `parentMessageId` it resolves:
 *   1. the parent's `MessageChannelLink` (tenant/org scoped, direction
 *      `inbound` — the link ingest wrote for the message being answered);
 *   2. the `ExternalConversation` that link belongs to (tenant/org scoped);
 *   3. only if that conversation is on the SAME channel, reuses its
 *      `externalConversationId` as the conversation key.
 *
 * The upsert below then finds the existing conversation and its thread mapping,
 * so no conversation/mapping is created and the parent message/link is not
 * touched. Any lookup failure, a missing link/conversation, a different channel
 * or an outbound parent keeps the exact legacy behavior.
 *
 * Anchor (installed source): `src/modules/communication_channels/lib/send-as-user.ts:170`;
 * dist: `dist/modules/communication_channels/lib/send-as-user.js:133`.
 *
 * Proof hook: set `OM_PATCH_REPO_ROOT` to a directory containing a mirror of the
 * target path to dry-run the transform without touching the shared install.
 * Default is the current working directory (the repo root).
 *
 * Idempotent; asserted by scripts/verify-patches.mjs (while applied).
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:outbound-thread-reuse] */'
const TARGET =
  'node_modules/@open-mercato/core/dist/modules/communication_channels/lib/send-as-user.js'
const ROOT = process.env.OM_PATCH_REPO_ROOT || process.cwd()

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8')
}

function writeIfChanged(relative, next) {
  const file = path.join(ROOT, relative)
  const current = fs.readFileSync(file, 'utf8')
  if (next !== current) fs.writeFileSync(file, next)
}

function replaceOnce(source, from, to, label) {
  const hits = source.split(from).length - 1
  if (hits !== 1) {
    throw new Error(`[patches] outbound-thread-reuse: ${label}: expected exactly one anchor, found ${hits}`)
  }
  return source.replace(from, () => to)
}

const ANCHOR = '  const externalThreadRef = `outbound:${messageThreadId}`;'

const REPLACEMENT = `  let externalThreadRef = \`outbound:\${messageThreadId}\`;
  ${MARKER}
  // A reply must continue the conversation the parent message belongs to. The
  // composer above already ran messages.compose, so the parent's inbound
  // channel link is the authoritative routing key: reuse its conversation's
  // external key and the upsert below finds the existing conversation instead
  // of creating \`outbound:<threadId>\`.
  if (input.parentMessageId) {
    try {
      const parentLink = await findOneWithDecryption(
        em,
        MessageChannelLink,
        {
          messageId: input.parentMessageId,
          tenantId,
          organizationId,
          direction: "inbound"
        },
        void 0,
        dscope
      );
      if (parentLink?.externalConversationId) {
        const parentConversation = await findOneWithDecryption(
          em,
          ExternalConversation,
          {
            id: parentLink.externalConversationId,
            tenantId,
            organizationId
          },
          void 0,
          dscope
        );
        if (parentConversation && parentConversation.channelId === channel.id) {
          externalThreadRef = parentConversation.externalConversationId;
        }
      }
    } catch (lookupError) {
      // Best-effort: an unavailable parent link keeps the legacy routing.
      logger.warn("outbound thread reuse lookup failed; using outbound thread key", {
        parentMessageId: input.parentMessageId,
        err: lookupError
      });
    }
  }`

function patch(source) {
  if (source.includes(MARKER)) return source

  source = replaceOnce(source, ANCHOR, REPLACEMENT, 'externalThreadRef anchor')

  return source
}

writeIfChanged(TARGET, patch(read(TARGET)))
console.log('replies reuse the inbound conversation instead of creating an outbound one')
