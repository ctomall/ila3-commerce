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
import { Message } from '@open-mercato/core/modules/messages/data/entities'
import { sanitizeChannelHtml } from '@open-mercato/core/modules/communication_channels/lib/sanitize-channel-html'
import { htmlToPlainText } from '@open-mercato/shared/lib/html/htmlToPlainText'
import { extractMediaSummary } from '../../../../../lib/media'
import { describeChannelAvailability } from '../../../../../lib/channel-availability'
import { hasChannelAdapter } from '@open-mercato/core/modules/communication_channels/lib/adapter-registry-singleton'

export const metadata = {
  path: '/communications/me/threads/[id]/messages',
  GET: {
    requireAuth: true,
    // Read gate only; a caller needs `view` to read a thread, not the permission
    // to connect a channel. Per-channel ownership/visibility is still enforced
    // below, so this grants no new reach.
    requireFeatures: ['communication_channels.view'],
  },
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

type LinkedBodyProjection = {
  body: string | null
  bodyText: string | null
  bodyFormat: 'text' | 'markdown' | 'html' | null
  subject: string | null
}

/**
 * Project the linked platform message for display.
 *
 * The hub's `messages.message` row is the only copy of the conversation text,
 * so the inbox reads it through `MessageChannelLink.messageId` — never a second
 * store. HTML bodies are sanitized server-side and flattened to plain text: the
 * response never carries raw HTML that a chat bubble might render directly.
 * A link whose message row is absent (deleted link, foreign tenant) yields
 * nulls instead of failing the whole page.
 */
function projectLinkedMessage(message: Message | undefined): LinkedBodyProjection {
  if (!message) return { body: null, bodyText: null, bodyFormat: null, subject: null }
  const subject =
    typeof message.subject === 'string' && message.subject.trim() !== '' ? message.subject : null
  const raw = typeof message.body === 'string' ? message.body : ''
  const format = String(message.bodyFormat ?? 'text').toLowerCase()
  if (format === 'html') {
    return {
      body: null,
      bodyText: htmlToPlainText(sanitizeChannelHtml(raw)) || null,
      bodyFormat: 'html',
      subject,
    }
  }
  const body = raw === '' ? null : raw
  return { body, bodyText: body, bodyFormat: format === 'markdown' ? 'markdown' : 'text', subject }
}

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
  // Older-page cursor. Additive to `after`: callers that never send it keep the
  // existing ascending window unchanged.
  const beforeRaw = url.searchParams.get('before')
  const before = beforeRaw ? new Date(beforeRaw) : null
  if (beforeRaw && (!before || Number.isNaN(before.getTime()))) {
    return NextResponse.json({ error: 'before must be an ISO timestamp' }, { status: 422 })
  }
  if (before && after) {
    return NextResponse.json({ error: 'before and after cannot be combined' }, { status: 422 })
  }

  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()

  // The path segment is an internal conversation uuid. A malformed value would
  // otherwise reach the uuid cast and fail as a 500 (Postgres 22P02); answer with
  // the same masked 404 as an inaccessible id, so a validation failure never
  // confirms or distinguishes existence.
  let conversation: ExternalConversation | null
  try {
    conversation = await em.findOne(ExternalConversation, {
      id: params.id,
      tenantId,
      ...channelOrgScopeWhere(organizationId),
    } as FilterQuery<ExternalConversation>)
  } catch (err) {
    if ((err as { code?: string }).code === '22P02') {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }
    throw err
  }
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
  if (before) {
    messageWhere.createdAt = { $lt: before }
  }

  // Two window modes:
  //  - `after` (incremental sync): oldest-first window plus a `nextAfter` cursor.
  //  - default/before (inbox reading): newest-first fetch, displayed ascending,
  //    plus a `nextBefore` cursor for older pages. Without this the inbox
  //    showed only the first N messages ever and never the newest ones.
  const newestWindow = !after
  const messages = await em.find(
    ExternalMessage,
    messageWhere as FilterQuery<ExternalMessage>,
    { orderBy: { createdAt: newestWindow ? 'desc' : 'asc' }, limit: limit + 1 },
  )
  const page = messages.slice(0, limit)
  if (newestWindow) page.reverse()
  const hasMore = messages.length > limit
  const nextAfter = newestWindow
    ? (page[page.length - 1]?.createdAt?.toISOString() ?? null)
    : hasMore
      ? (page[page.length - 1]?.createdAt?.toISOString() ?? null)
      : null
  const nextBefore = newestWindow && hasMore ? (page[0]?.createdAt?.toISOString() ?? null) : null

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

  // One batched read (no N+1) for the bodies behind this page's links. Scoped
  // by tenant, and by the caller's organization plus tenant-wide (null) rows
  // when the session carries one — the same scope the conversation passed.
  const linkedMessageIds = [
    ...new Set(
      page
        .map((message) => linkByExternalMessage.get(message.id)?.messageId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ]
  const platformMessages = linkedMessageIds.length
    ? await em.find(
        Message,
        {
          id: { $in: linkedMessageIds },
          tenantId,
          ...(organizationId ? { organizationId: { $in: [organizationId, null] } } : {}),
          deletedAt: null,
        } as FilterQuery<Message>,
      )
    : []
  const platformMessageById = new Map(platformMessages.map((message) => [String(message.id), message]))

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
      // Body + subject come from the linked platform message (additive fields).
      ...projectLinkedMessage(link?.messageId ? platformMessageById.get(link.messageId) : undefined),
    }
  })

  // Design rev2 F8-05: the conversation itself must say whether this account can
  // currently receive/send, so an outbound-only email account is not rendered as
  // an empty thread with no explanation.
  const availability = describeChannelAvailability({
    providerKey: channel.providerKey,
    channelType: channel.channelType,
    status: channel.status,
    externalIdentifier: channel.externalIdentifier,
    adapterRegistered: channel.providerKey ? hasChannelAdapter(channel.providerKey) : false,
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
      /** F8-05: can this account receive / send right now, and why not. */
      availability,
    },
    items,
    nextAfter,
    nextBefore,
  })
}

export const openApi = {
  tags: ['Communications'],
  methods: {
    GET: {
      summary: 'List message metadata for one visible external conversation',
      tags: ['Communications'],
      responses: [
        {
          status: 200,
          description:
            'Message page ordered oldest-first. Each item additionally carries body/bodyText/bodyFormat/subject from the linked platform message: bodyText is the display text (for bodyFormat=html it is sanitized plain text and body is null, so raw HTML is never returned for chat render); all four are null when no message row is linked.',
        },
        { status: 401, description: 'Unauthorized' },
        { status: 404, description: 'Conversation not found or not accessible' },
        { status: 422, description: 'Invalid after cursor' },
      ],
    },
  },
}
