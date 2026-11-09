#!/usr/bin/env node
/**
 * Managed patch (ADR-006 A): provider-native recipients in the send-as-user facade.
 *
 * The hub's `sendAsUser` facade was written for email only: it forwarded
 * `input.to[0]` into `messages.compose` as `externalEmail`, whose validator is
 * `z.string().email()`. Handing it a WhatsApp wa_id or a Messenger PSID therefore
 * failed inside compose and surfaced as an opaque 500 — the round-17 drill caught
 * it as G8, and the CRM module had to answer 422 OUTBOUND_RECIPIENT_UNSUPPORTED.
 *
 * Upstream already ships the primitives this patch wires together:
 *   - `validateOutboundRecipient(recipient, capabilities)` follows the adapter's
 *     `capabilities.recipientFormat` (`'email'` default, `'provider-native'` opt-in)
 *     and fails closed on unexpected characters;
 *   - `channelTypeRequiresExternalEmail` already knows `whatsapp` / `messenger`
 *     are non-email sender channels, so the compose validator accepts a message
 *     with no `externalEmail` when `sourceChannelType` says so.
 *
 * Two edits, both in the hub's own vocabulary:
 *   1. resolve the adapter, validate the recipient against ITS shape, and for a
 *      provider-native adapter compose with `sourceChannelType` (derived from the
 *      channel row, never from caller input) instead of a fake email address;
 *   2. pass the stored recipient to the adapter as `channelMetadata.to`, which is
 *      the key provider-native adapters already read (G7).
 *
 * No recipient is invented: an e-mail channel keeps byte-identical behaviour
 * because `providerNative` is false for it.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'

const MARKER = '/* [patched:provider-native-recipient] */'
const SEND_AS_USER =
  'node_modules/@open-mercato/core/dist/modules/communication_channels/lib/send-as-user.js'
const DELIVER =
  'node_modules/@open-mercato/core/dist/modules/communication_channels/commands/deliver-outbound-message.js'

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function writeIfChanged(file, next) {
  if (next !== read(file)) fs.writeFileSync(file, next)
}

function replaceOnce(source, from, to, label) {
  const hits = source.split(from).length - 1
  if (hits !== 1) {
    throw new Error(`[patches] ${label}: expected exactly one match, found ${hits}`)
  }
  return source.replace(from, to)
}

// ── 1. send-as-user: validate against the adapter's recipient shape ──────────
let source = read(SEND_AS_USER)
if (!source.includes(MARKER)) {
  source = replaceOnce(
    source,
    'import { htmlToText } from "./email-mime.js";',
    `import { htmlToText } from "./email-mime.js";
${MARKER}
import { validateOutboundRecipient } from "./outbound-recipient.js";`,
    'send-as-user import',
  )

  source = replaceOnce(
    source,
    `  const composeInput = {`,
    `  ${MARKER}
  // The recipient is validated against the adapter's declared shape. A
  // provider-native adapter (WhatsApp wa_id, Messenger PSID) must not be forced
  // through the e-mail validator, and an e-mail adapter keeps the exact old rule.
  let adapterCapabilities = null;
  try {
    const adapterRegistry = container.resolve("channelAdapterRegistry");
    adapterCapabilities = adapterRegistry?.get?.(channel.providerKey)?.capabilities ?? null;
  } catch {
    adapterCapabilities = null;
  }
  const providerNative = adapterCapabilities?.recipientFormat === "provider-native";
  const recipientCheck = validateOutboundRecipient(input.to[0], adapterCapabilities);
  if (!recipientCheck.ok) {
    return {
      ok: false,
      status: 422,
      error: recipientCheck.error,
      fieldErrors: { to: recipientCheck.error }
    };
  }
  const composeInput = {`,
    'send-as-user recipient resolution',
  )

  source = replaceOnce(
    source,
    `    externalEmail: input.to[0],`,
    `    externalEmail: providerNative ? void 0 : input.to[0],`,
    'send-as-user externalEmail',
  )

  source = replaceOnce(
    source,
    `    sourceEntityId: channel.id,`,
    `    sourceEntityId: channel.id,
    // Derived from the channel row, never from caller input: the compose
    // validator waives the e-mail requirement only for a non-e-mail channel type.
    ...providerNative ? { sourceChannelType: channel.channelType } : {},`,
    'send-as-user sourceChannelType',
  )

  writeIfChanged(SEND_AS_USER, source)
}

// ── 2. deliver-outbound: hand the stored recipient to the adapter ────────────
let deliver = read(DELIVER)
if (!deliver.includes(MARKER)) {
  deliver = replaceOnce(
    deliver,
    `          references: mergedReferences,
          ...threadToken ? { omThreadToken: threadToken } : {},
          ...replyToExternalId ? { replyToExternalId } : {}
        }`,
    `          references: mergedReferences,
          ...threadToken ? { omThreadToken: threadToken } : {},
          ...replyToExternalId ? { replyToExternalId } : {},
          ${MARKER}
          // G7: the adapter cannot guess a recipient. For a provider-native
          // channel the address is the one send-as-user stored on the link
          // (\`to[0]\`); e-mail adapters keep receiving the full metadata they
          // already had and ignore this key.
          ...(adapter.capabilities?.recipientFormat === "provider-native" && Array.isArray(baseMetadata.to) && typeof baseMetadata.to[0] === "string" ? { to: baseMetadata.to[0] } : {})
        }`,
    'deliver-outbound recipient',
  )

  writeIfChanged(DELIVER, deliver)
}

console.log('provider-native recipient wired: send-as-user + deliver-outbound')
