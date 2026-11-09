import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import {
  CommunicationChannel,
  ExternalConversation,
  ExternalMessage,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import { channelOrgScopeWhere } from '@open-mercato/core/modules/communication_channels/lib/access-control'
import { evaluateSendPolicy, type SendPolicyResult } from './send-policy'

export type WindowCheckInput = {
  em: EntityManager
  tenantId: string
  organizationId: string | null
  actorUserId: string
  channelId: string
  recipient: string
  hasTemplate: boolean
  now?: Date
}

/**
 * Load the facts the window policy needs and evaluate it.
 *
 * Returns `allowed: true` when the channel cannot be read in the caller's scope
 * or belongs to another user: the hub facade already answers 404/403 for those,
 * and this check must not become an existence oracle that differs from it.
 */
export async function checkCustomerWindow(input: WindowCheckInput): Promise<SendPolicyResult> {
  const channel = await input.em.findOne(CommunicationChannel, {
    id: input.channelId,
    tenantId: input.tenantId,
    deletedAt: null,
    ...channelOrgScopeWhere(input.organizationId),
  } as FilterQuery<CommunicationChannel>)
  if (!channel) return {allowed: true, reason: 'no_window'}
  if (channel.userId != null && channel.userId !== input.actorUserId) {
    return {allowed: true, reason: 'no_window'}
  }
  const channelType = channel.channelType || null
  if (channelType !== 'whatsapp' && channelType !== 'messenger') {
    return evaluateSendPolicy({channelType, lastInboundAt: null, hasTemplate: input.hasTemplate})
  }

  const conversation = await input.em.findOne(ExternalConversation, {
    channelId: channel.id,
    externalConversationId: input.recipient,
    tenantId: input.tenantId,
    ...channelOrgScopeWhere(input.organizationId),
  } as FilterQuery<ExternalConversation>)
  let lastInboundAt: Date | null = null
  if (conversation) {
    const lastInbound = await input.em.findOne(
      ExternalMessage,
      {
        conversationId: conversation.id,
        direction: 'inbound',
        tenantId: input.tenantId,
        ...channelOrgScopeWhere(input.organizationId),
      } as FilterQuery<ExternalMessage>,
      {orderBy: {createdAt: 'desc'}},
    )
    lastInboundAt = lastInbound?.createdAt ?? null
  }
  return evaluateSendPolicy({channelType, lastInboundAt, hasTemplate: input.hasTemplate, now: input.now})
}
