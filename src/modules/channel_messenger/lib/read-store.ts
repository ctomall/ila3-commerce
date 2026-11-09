import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import {
  ExternalConversation,
  ExternalMessage,
  MessageChannelLink,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import { shouldApplyStatus } from '../../channel_whatsapp/lib/status-store'

/**
 * Messenger reports reads as a per-conversation watermark (the timestamp up to
 * which the PSID has read), not as per-message receipts. Apply it to outbound
 * links whose provider timestamp is at or before the watermark — never to newer
 * messages, and never backwards (shouldApplyStatus keeps `read` sticky).
 */
export type ApplyReadResult = {
  updated: number
  skipped: number
  conversationFound: boolean
}

export async function applyMessengerReads(
  em: EntityManager,
  input: { tenantId: string; channelId: string; psid: string; watermark: number },
): Promise<ApplyReadResult> {
  const result: ApplyReadResult = {updated: 0, skipped: 0, conversationFound: false}
  if (!input.psid || !Number.isFinite(input.watermark)) return result
  const conversation = await em.findOne(ExternalConversation, {
    tenantId: input.tenantId,
    channelId: input.channelId,
    externalConversationId: input.psid,
  } as FilterQuery<ExternalConversation>)
  if (!conversation) return result
  result.conversationFound = true

  const readAt = new Date(input.watermark)
  const outbound = (await em.find(ExternalMessage, {
    tenantId: input.tenantId,
    channelId: input.channelId,
    conversationId: conversation.id,
    direction: 'outbound',
    providerTimestamp: {$lte: readAt},
  } as FilterQuery<ExternalMessage>)) as unknown as Array<{id: string}>
  if (!outbound.length) return result

  const ids = outbound.map((message) => message.id)
  const links = (await em.find(MessageChannelLink, {
    tenantId: input.tenantId,
    externalMessageId: {$in: ids},
  } as FilterQuery<MessageChannelLink>)) as unknown as Array<{deliveryStatus?: string | null}>
  for (const link of links) {
    if (!shouldApplyStatus(link.deliveryStatus, 'read')) {
      result.skipped++
      continue
    }
    link.deliveryStatus = 'read'
    result.updated++
  }
  if (result.updated) await em.flush()
  return result
}
