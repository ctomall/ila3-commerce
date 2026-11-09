import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import {
  ExternalMessage,
  MessageChannelLink,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import type { MetaStatusEvent } from './meta-payload'

/**
 * Delivery-receipt persistence for providers that push status events.
 *
 * The hub's generic webhook route deliberately drops `status_update` events
 * ("not yet handled"), and the hub forbids editing node_modules — so the provider
 * owns a dedicated route and writes the receipt onto the existing
 * `MessageChannelLink.delivery_status` column. No new table, no new message row.
 *
 * Ordering: providers retry and reorder callbacks, so a stale `sent` must never
 * move a link backwards from `read`. `failed` is applied only while the message
 * is not yet delivered/read (a late failure after delivery is noise, not truth).
 */
const RANK: Record<string, number> = {pending: 0, sent: 1, delivered: 2, read: 3}

export function shouldApplyStatus(current: string | null | undefined, next: string): boolean {
  const before = RANK[current ?? 'pending'] ?? 0
  if (next === 'failed') return before < RANK.delivered
  const after = RANK[next]
  if (after === undefined) return false
  return after > before
}

export type ApplyStatusResult = {
  updated: Array<{ externalMessageId: string; from: string; to: string }>
  skipped: Array<{ externalMessageId: string; reason: 'not-found' | 'out-of-order' }>
}

export async function applyStatusEvents(
  em: EntityManager,
  input: { tenantId: string; channelId: string; statuses: MetaStatusEvent[] },
): Promise<ApplyStatusResult> {
  const result: ApplyStatusResult = {updated: [], skipped: []}
  for (const event of input.statuses) {
    if (!event.externalMessageId) {
      result.skipped.push({externalMessageId: '', reason: 'not-found'})
      continue
    }
    // The receipt carries the PROVIDER id (wamid); MessageChannelLink's
    // external_message_id is the UUID of the ExternalMessage row. Resolve first,
    // or every real receipt would be skipped as "not-found".
    const external = await em.findOne(
      ExternalMessage,
      {
        tenantId: input.tenantId,
        channelId: input.channelId,
        externalMessageId: event.externalMessageId,
      } as FilterQuery<ExternalMessage>,
    )
    if (!external) {
      result.skipped.push({externalMessageId: event.externalMessageId, reason: 'not-found'})
      continue
    }
    // MessageChannelLink has no channelId column: the channel is proven by the
    // ExternalMessage lookup above (scoped by tenant + channel). Scoping the link
    // query by a nonexistent property throws at runtime.
    const link = await em.findOne(
      MessageChannelLink,
      {
        tenantId: input.tenantId,
        externalMessageId: external.id,
      } as FilterQuery<MessageChannelLink>,
    )
    if (!link) {
      result.skipped.push({externalMessageId: event.externalMessageId, reason: 'not-found'})
      continue
    }
    if (!shouldApplyStatus(link.deliveryStatus, event.status)) {
      result.skipped.push({externalMessageId: event.externalMessageId, reason: 'out-of-order'})
      continue
    }
    result.updated.push({
      externalMessageId: event.externalMessageId,
      from: link.deliveryStatus ?? 'pending',
      to: event.status,
    })
    link.deliveryStatus = event.status
  }
  if (result.updated.length) await em.flush()
  return result
}
