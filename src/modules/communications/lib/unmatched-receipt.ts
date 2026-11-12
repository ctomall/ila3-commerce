import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { ChannelIngestDeadLetter } from '@open-mercato/core/modules/communication_channels/data/entities'

/**
 * Persist a provider receipt that could not be matched to a local message.
 *
 * Receipts (`delivered`/`read`/`failed`) are the only evidence the customer side
 * shows the true state of an outbound message, and they are not replayable by
 * our code: Meta sends them once and retries only on a non-2xx response. When a
 * receipt arrives before our own commit landed (the send/commit window), or for
 * a conversation we no longer have, the current code drops it and the link stays
 * "sent" forever — a UI lie nobody can correct.
 *
 * We do NOT answer non-2xx to force a provider retry: one unmatched receipt in a
 * batch would make Meta redeliver every event in it, repeatedly, and a genuinely
 * foreign receipt would retry forever. Instead the receipt is written to the hub
 * dead-letter table that already exists for ingest failures, so it is visible and
 * can be replayed by an operator once the link exists.
 *
 * Never throws: a webhook must not fail because its bookkeeping failed.
 */
const RAW_BODY_MAX_BYTES = 32 * 1024

export type UnmatchedReceiptInput = {
  em: EntityManager
  tenantId: string
  organizationId: string | null
  channelId: string
  providerKey: string
  errorClass: 'receipt_unmatched' | 'receipt_unmatched_link' | 'read_unmatched_conversation'
  errorMessage: string
  externalMessageId?: string | null
  externalUid?: string | null
  raw?: unknown
}

export type UnmatchedReceiptResult = 'recorded' | 'duplicate' | 'skipped'

function serializedRaw(value: unknown): string | null {
  try {
    const text = JSON.stringify(value ?? null)
    if (text === undefined || text === 'null') return null
    if (Buffer.byteLength(text, 'utf8') <= RAW_BODY_MAX_BYTES) return text
    return `${Buffer.from(text, 'utf8').subarray(0, RAW_BODY_MAX_BYTES).toString('utf8')}…[truncated]`
  } catch {
    return null
  }
}

export async function recordUnmatchedReceipt(input: UnmatchedReceiptInput): Promise<UnmatchedReceiptResult> {
  const {
    em,
    tenantId,
    organizationId,
    channelId,
    providerKey,
    errorClass,
    errorMessage,
    externalMessageId,
    externalUid,
    raw,
  } = input
  try {
    const scope: Record<string, unknown> = {
      tenantId,
      organizationId: organizationId ?? null,
      channelId,
      errorClass,
    }
    if (externalMessageId) scope.externalMessageId = externalMessageId
    else if (externalUid) scope.externalUid = externalUid
    else return 'skipped'

    const existing = await em.findOne(
      ChannelIngestDeadLetter,
      scope as FilterQuery<ChannelIngestDeadLetter>,
    )
    if (existing) return 'duplicate'

    const row = em.create(ChannelIngestDeadLetter, {
      tenantId,
      organizationId: organizationId ?? null,
      channelId,
      providerKey,
      externalUid: externalUid ?? null,
      externalMessageId: externalMessageId ?? null,
      errorClass,
      errorMessage,
      rawBody: serializedRaw(raw),
    })
    em.persist(row)
    await em.flush()
    return 'recorded'
  } catch {
    // Visible in the webhook's own logs only through the absence of a row; the
    // caller must keep serving 200 so the provider does not redeliver the batch.
    return 'skipped'
  }
}
