import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import {
  CommunicationChannel,
  ExternalConversation,
  ExternalMessage,
  MessageChannelLink,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import { channelOrgScopeWhere } from '@open-mercato/core/modules/communication_channels/lib/access-control'
import { CustomerEntity } from '@open-mercato/core/modules/customers/data/entities'
import { extractMediaSummary } from '../../../../../lib/media'

export const metadata = {
  path: '/communications/me/threads/[id]/messages',
  GET: {
    requireAuth: true,
    requireFeatures: ['communication_channels.connect_user_channel'],
  },
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/**
 * GET /api/communications/me/threads/{externalConversationId}/messages
 *
 * Message metadata for one hub conversation. The body itself is NOT copied into
 * the hub (canonical bodies live in `messages.message`), so each item carries
 * `messageId` — the platform message id — which the client resolves through the
 * installed `/api/messages/{id}` route, where the messages module applies its
 * own participant/channel-thread authorization. Returning a hub-side copy of the
 * body here would create a second message store, which this integration forbids.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub || !auth.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = auth.tenantId as string
  const organizationId = (auth as { orgId?: string | null }).orgId ?? null
  const url = new URL(req.url)
  const limitRaw = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), MAX_LIMIT)
    : DEFAULT_LIMIT
  const afterRaw = url.searchParams.get('after')
  const after = afterRaw ? new Date(afterRaw) : null
  if (afterRaw && (!after || Number.isNaN(after.getTime()))) {
    return NextResponse.json({ error: 'after must be an ISO timestamp' }, { status: 422 })
  }

  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()

  const conversation = await em.findOne(ExternalConversation, {
    id: params.id,
    tenantId,
    ...channelOrgScopeWhere(organizationId),
  } as FilterQuery<ExternalConversation>)
  if (!conversation) {
    // Masked 404: an inaccessible conversation must not confirm its existence.
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const channel = await em.findOne(CommunicationChannel, {
    id: conversation.channelId,
    tenantId,
    deletedAt: null,
    ...channelOrgScopeWhere(organizationId),
  } as FilterQuery<CommunicationChannel>)
  if (!channel || (channel.userId != null && channel.userId !== auth.sub)) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const customer = conversation.contactPersonId
    ? await em.findOne(CustomerEntity, {
        id: conversation.contactPersonId,
        tenantId,
      } as never).catch(() => null)
    : null

  const messageWhere: Record<string, unknown> = {
    tenantId,
    conversationId: conversation.id,
    ...channelOrgScopeWhere(organizationId),
  }
  if (after) {
    messageWhere.createdAt = { $gt: after }
  }

  const messages = await em.find(
    ExternalMessage,
    messageWhere as FilterQuery<ExternalMessage>,
    { orderBy: { createdAt: 'asc' }, limit: limit + 1 },
  )
  const page = messages.slice(0, limit)
  const nextAfter =
    messages.length > limit ? (page[page.length - 1]?.createdAt?.toISOString() ?? null) : null

  const messageIds = page.map((message) => message.id)
  const links = messageIds.length
    ? await em.find(MessageChannelLink, {
        tenantId,
        externalMessageId: { $in: messageIds },
      })
    : []
  const linkByExternalMessage = new Map<string, MessageChannelLink>()
  for (const link of links) {
    if (link.externalMessageId && !linkByExternalMessage.has(link.externalMessageId)) {
      linkByExternalMessage.set(link.externalMessageId, link)
    }
  }

  const items = page.map((message) => {
    const link = linkByExternalMessage.get(message.id)
    return {
      id: message.id,
      direction: message.direction,
      externalMessageId: message.externalMessageId,
      senderIdentifier: message.senderIdentifier ?? null,
      senderDisplayName: message.senderDisplayName ?? null,
      providerTimestamp: message.providerTimestamp?.toISOString?.() ?? null,
      createdAt: message.createdAt.toISOString(),
      /** Platform message id; resolve the body via the installed messages API. */
      messageId: link?.messageId ?? null,
      deliveryStatus: link?.deliveryStatus ?? null,
      channelContentType: link?.channelContentType ?? null,
      /** Attachment metadata only; bytes are never downloaded (G3). */
      media: extractMediaSummary(link?.channelPayload),
    }
  })

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      channelId: conversation.channelId,
      externalConversationId: conversation.externalConversationId,
      subject: conversation.subject ?? null,
      contactPersonId: conversation.contactPersonId ?? null,
      assignedUserId: conversation.assignedUserId ?? null,
      customer: customer
        ? {
            id: String((customer as {id: unknown}).id),
            displayName: (customer as {displayName?: string | null}).displayName ?? '',
            kind: (customer as {kind?: string | null}).kind ?? 'person',
          }
        : null,
    },
    channel: {
      id: channel.id,
      providerKey: channel.providerKey,
      channelType: channel.channelType,
      displayName: channel.displayName,
      status: channel.status,
      visibility: channel.visibility === 'shared' ? 'shared' : 'private',
      /** Drives capability gating in the inbox (media/template). */
      capabilities: (channel.capabilities as Record<string, unknown> | undefined) ?? {},
    },
    items,
    nextAfter,
  })
}

export const openApi = {
  tags: ['Communications'],
  methods: {
    GET: {
      summary: 'List message metadata for one visible external conversation',
      tags: ['Communications'],
      responses: [
        { status: 200, description: 'Message page ordered oldest-first' },
        { status: 401, description: 'Unauthorized' },
        { status: 404, description: 'Conversation not found or not accessible' },
        { status: 422, description: 'Invalid after cursor' },
      ],
    },
  },
}
