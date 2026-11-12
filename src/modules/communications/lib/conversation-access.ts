/**
 * Conversation access for the product surfaces (notes, customer link, …).
 *
 * Extracted from the notes/customer routes so the authorization rule lives in one
 * place: the conversation must be in the caller's tenant + NULL-inclusive
 * organization scope, its channel must be undeleted, and a personal channel must
 * belong to the caller. A failure is always the same masked "not found" — an
 * inaccessible conversation must not confirm that it exists.
 *
 * Kept free of HTTP concerns so the real-DB runner can exercise the exact query
 * shape against Postgres.
 */
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import {
  CommunicationChannel,
  ExternalConversation,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import { channelOrgScopeWhere } from '@open-mercato/core/modules/communication_channels/lib/access-control'

export type ConversationCallerScope = {
  tenantId: string
  organizationId: string | null
  userId: string
}

const UUID_PATTERN = /^[0-9a-f-]{36}$/i

export async function resolveConversationForCaller(
  em: EntityManager,
  scope: ConversationCallerScope,
  conversationId: string,
): Promise<ExternalConversation | null> {
  // A malformed uuid would otherwise reach the cast and surface as a 500.
  if (!UUID_PATTERN.test(conversationId)) return null
  let conversation: ExternalConversation | null
  try {
    conversation = await em.findOne(ExternalConversation, {
      id: conversationId,
      tenantId: scope.tenantId,
      ...channelOrgScopeWhere(scope.organizationId),
    } as FilterQuery<ExternalConversation>)
  } catch (err) {
    if ((err as { code?: string }).code === '22P02') return null
    throw err
  }
  if (!conversation) return null

  const channel = await em.findOne(CommunicationChannel, {
    id: conversation.channelId,
    tenantId: scope.tenantId,
    deletedAt: null,
    ...channelOrgScopeWhere(scope.organizationId),
  } as FilterQuery<CommunicationChannel>)
  if (!channel) return null
  // A deleted channel read as "no channel" would silently orphan its history.
  if (channel.userId != null && channel.userId !== scope.userId) return null
  return conversation
}
