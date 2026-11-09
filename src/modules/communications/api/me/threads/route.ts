import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import {
  ChannelThreadMapping,
  CommunicationChannel,
  ExternalConversation,
  MessageChannelLink,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import { channelOrgScopeWhere } from '@open-mercato/core/modules/communication_channels/lib/access-control'
import { CustomerEntity } from '@open-mercato/core/modules/customers/data/entities'

export const metadata = {
  path: '/communications/me/threads',
  GET: {
    requireAuth: true,
    // Same own-channel feature the hub gates "connect my mailbox" on. Listing is
    // still narrowed to channels the caller owns plus tenant-wide channels, so a
    // personal mailbox never appears to another employee.
    requireFeatures: ['communication_channels.connect_user_channel'],
  },
}

const DEFAULT_LIMIT = 30
const MAX_LIMIT = 100

type ThreadRow = {
  id: string
  channelId: string
  externalConversationId: string
  subject: string | null
  contactPersonId: string | null
  assignedUserId: string | null
  lastMessageAt: string | null
  lastMessageId: string | null
  lastMessageThreadId: string | null
  customer: {id: string; displayName: string; kind: string} | null
  channel: {
    id: string
    providerKey: string
    channelType: string
    displayName: string
    visibility: 'private' | 'shared'
  }
}

/**
 * GET /api/communications/me/threads
 *
 * Mobile-first conversation list over the installed hub. Reads only existing
 * hub entities — no second conversation/message table and no cross-module ORM
 * relation: the CRM person is carried as `contactPersonId` (an id), and the
 * message-thread anchor as `lastMessageThreadId`.
 */
export async function GET(req: Request): Promise<Response> {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub || !auth.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const channelIdFilter = url.searchParams.get('channelId')
  const beforeRaw = url.searchParams.get('before')
  const limitRaw = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), MAX_LIMIT)
    : DEFAULT_LIMIT

  const before = beforeRaw ? new Date(beforeRaw) : null
  if (beforeRaw && (!before || Number.isNaN(before.getTime()))) {
    return NextResponse.json({ error: 'before must be an ISO timestamp' }, { status: 422 })
  }

  const tenantId = auth.tenantId as string
  const organizationId = (auth as { orgId?: string | null }).orgId ?? null
  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()

  const channelWhere: Record<string, unknown> = {
    tenantId,
    deletedAt: null,
    $and: [
      { $or: [{ userId: null }, { userId: auth.sub as string }] },
      channelOrgScopeWhere(organizationId),
    ],
  }
  if (channelIdFilter) {
    if (!/^[0-9a-f-]{36}$/i.test(channelIdFilter)) {
      return NextResponse.json({ error: 'channelId must be a uuid' }, { status: 422 })
    }
    channelWhere.id = channelIdFilter
  }

  const channels = await em.find(
    CommunicationChannel,
    channelWhere as FilterQuery<CommunicationChannel>,
  )
  if (channels.length === 0) {
    return NextResponse.json({ items: [], nextBefore: null, total: 0 })
  }

  const channelById = new Map(channels.map((channel) => [channel.id, channel]))
  const conversationWhere: Record<string, unknown> = {
    tenantId,
    channelId: { $in: [...channelById.keys()] },
    ...channelOrgScopeWhere(organizationId),
  }
  if (before) {
    conversationWhere.lastMessageAt = { $lt: before }
  }

  const conversations = await em.find(
    ExternalConversation,
    conversationWhere as FilterQuery<ExternalConversation>,
    { orderBy: { lastMessageAt: 'desc', createdAt: 'desc' }, limit: limit + 1 },
  )
  const page = conversations.slice(0, limit)
  const nextBefore =
    conversations.length > limit
      ? (page[page.length - 1]?.lastMessageAt?.toISOString() ?? null)
      : null

  const conversationIds = page.map((conversation) => conversation.id)
  const links = conversationIds.length
    ? await em.find(
        MessageChannelLink,
        { tenantId, externalConversationId: { $in: conversationIds } },
        { orderBy: { createdAt: 'desc' } },
      )
    : []
  const latestLinkByConversation = new Map<string, MessageChannelLink>()
  for (const link of links) {
    if (!latestLinkByConversation.has(link.externalConversationId)) {
      latestLinkByConversation.set(link.externalConversationId, link)
    }
  }

  const threadIdsByConversation = new Map<string, string>()
  if (conversationIds.length) {
    const mappings = await em.find(ChannelThreadMapping, {
      tenantId,
      externalConversationId: { $in: conversationIds },
    })
    for (const mapping of mappings) {
      threadIdsByConversation.set(mapping.externalConversationId, mapping.messageThreadId)
    }
  }

  // Customer display name for the inbox row. Read by id only (no ORM relation,
  // per the module rule); the thread list already authorized the conversation.
  const contactIds = [...new Set(page.map((c) => c.contactPersonId).filter((id): id is string => Boolean(id)))]
  const customersById = new Map<string, {id: string; displayName: string; kind: string}>()
  if (contactIds.length) {
    const customers = await em.find(CustomerEntity, {
      id: {$in: contactIds},
      tenantId,
      ...(organizationId ? {organizationId: {$in: [organizationId, null]}} : {}),
    } as never)
    for (const customer of customers as unknown as Array<{id: string; displayName?: string | null; kind?: string | null}>) {
      customersById.set(String(customer.id), {
        id: String(customer.id),
        displayName: customer.displayName ?? '',
        kind: customer.kind ?? 'person',
      })
    }
  }

  const items: ThreadRow[] = page.map((conversation) => {
    const channel = channelById.get(conversation.channelId)
    const latestLink = latestLinkByConversation.get(conversation.id)
    return {
      id: conversation.id,
      channelId: conversation.channelId,
      externalConversationId: conversation.externalConversationId,
      subject: conversation.subject ?? null,
      contactPersonId: conversation.contactPersonId ?? null,
      assignedUserId: conversation.assignedUserId ?? null,
      lastMessageAt: conversation.lastMessageAt?.toISOString?.() ?? null,
      lastMessageId: latestLink?.messageId ?? null,
      customer: conversation.contactPersonId
        ? customersById.get(conversation.contactPersonId) ?? {id: conversation.contactPersonId, displayName: '', kind: 'unknown'}
        : null,
      lastMessageThreadId: threadIdsByConversation.get(conversation.id) ?? null,
      channel: {
        id: conversation.channelId,
        providerKey: channel?.providerKey ?? 'unknown',
        channelType: channel?.channelType ?? 'unknown',
        displayName: channel?.displayName ?? '',
        visibility: channel?.visibility === 'shared' ? 'shared' : 'private',
      },
    }
  })

  return NextResponse.json({ items, nextBefore, total: items.length })
}

export const openApi = {
  tags: ['Communications'],
  methods: {
    GET: {
      summary: 'List external conversations visible to the current user',
      tags: ['Communications'],
      responses: [
        { status: 200, description: 'Conversation page ordered by last message time' },
        { status: 401, description: 'Unauthorized' },
        { status: 422, description: 'Invalid channelId or before cursor' },
      ],
    },
  },
}
