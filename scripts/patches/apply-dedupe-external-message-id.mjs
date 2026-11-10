#!/usr/bin/env node
/**
 * Managed patch: make a re-used provider message id idempotent.
 *
 * The hub inserts an ExternalMessage keyed by (channel, external_message_id)
 * AFTER the provider accepted the send. If the provider returns an id we already
 * stored — a crash between send and flush, a retried job, or a provider that
 * reuses ids — the insert violates the unique index, the delivery job throws and
 * the worker retries, re-sending the same message. The round-31 drill produced
 * five duplicate sends this way.
 *
 * This patch looks the row up first and reuses it, so the delivery completes as
 * `sent` with the existing external id instead of failing and re-sending.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'

const MARKER = '/* [patched:dedupe-external-id] */'
const TARGET =
  'node_modules/@open-mercato/core/dist/modules/communication_channels/commands/deliver-outbound-message.js'

let source = fs.readFileSync(TARGET, 'utf8')
if (!source.includes(MARKER)) {
  const anchor = '      const externalMessageRowId = randomUUID();'
  const hits = source.split(anchor).length - 1
  if (hits !== 1) throw new Error(`[patches] dedupe-external-id: expected one anchor, found ${hits}`)
  source = source.replace(
    anchor,
    `      ${MARKER}
      // Reuse a row that already carries this provider id instead of inserting a
      // duplicate (which would fail the job and make the worker re-send).
      const existingExternal = await em.findOne(ExternalMessage, {
        channelId: channel.id,
        externalMessageId: sendResult.externalMessageId
      });
      const externalMessageRowId = existingExternal?.id ?? randomUUID();`,
  )

  const createAnchor = '      const externalMessage = em.create(ExternalMessage, {'
  if (source.split(createAnchor).length - 1 !== 1) {
    throw new Error('[patches] dedupe-external-id: expected one create anchor')
  }
  source = source.replace(createAnchor, `      const externalMessage = existingExternal ?? em.create(ExternalMessage, {`)

  const persistAnchor = '      em.persist(externalMessage);'
  if (source.split(persistAnchor).length - 1 !== 1) {
    throw new Error('[patches] dedupe-external-id: expected one persist anchor')
  }
  source = source.replace(persistAnchor, `      if (!existingExternal) em.persist(externalMessage);`)

  fs.writeFileSync(TARGET, source)
}

console.log('re-used provider message ids are idempotent')
