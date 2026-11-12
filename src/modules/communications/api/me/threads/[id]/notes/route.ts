import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import {
  CommunicationChannel,
  ExternalConversation,
  MessageChannelLink,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import { channelOrgScopeWhere } from '@open-mercato/core/modules/communication_channels/lib/access-control'
import { Message } from '@open-mercato/core/modules/messages/data/entities'
import { canActorReply } from '../../../../../lib/reply-permission-server'

/**
 * Internal notes for one inbox conversation (design rev2 `F3-06`).
 *
 * A note is a `messages.message` row with `visibility: 'internal'` and **no
 * channel link**, which the installed delivery command treats as internal-only
 * (`deliver-outbound-message.ts` returns `no_channel_link` and stops), so nothing
 * is ever sent to the platform. No new table and no migration: the installed
 * messages module already carries visibility, body, author and thread.
 *
 * Association is `sourceEntityType`/`sourceEntityId` = this conversation, not the
 * hub thread id: the thread only exists once the conversation has a message, and
 * an internal note must stay retrievable (and attached to the right customer)
 * even on a brand-new conversation. When a message already exists, the note also
 * inherits its thread so the hub view stays coherent.
 *
 * Read gate is the inbox read grant (the conversation is authorized below);
 * writing needs the reply grant, because a note is a staff action on a
 * conversation, not a read.
 */
export const metadata = {
  path: '/communications/me/threads/[id]/notes',
  GET: { requireAuth: true, requireFeatures: ['communication_channels.view'] },
  POST: { requireAuth: true, requireFeatures: ['communication_channels.view'] },
}

const CONVERSATION_SOURCE = 'communication_channels.conversation'
const MAX_NOTE_LENGTH = 4000

const noteSchema = z.object({
  body: z.string().trim().min(1).max(MAX_NOTE_LENGTH),
})

type ConversationScope = {
  em: EntityManager
  conversation: ExternalConversation
  organizationId: string | null
  tenantId: string
}

/** Resolve the conversation and its channel for the caller, or `null` (masked 404). */
async function resolveConversation(
  em: EntityManager,
  tenantId: string,
  organizationId: string | null,
  userId: string,
  conversationId: string,
): Promise<ConversationScope | null> {
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return null
  let conversation: ExternalConversation | null
  try {
    conversation = await em.findOne(ExternalConversation, {
      id: conversationId,
      tenantId,
      ...channelOrgScopeWhere(organizationId),
    } as FilterQuery<ExternalConversation>)
  } catch (err) {
    // A malformed uuid must not surface as a 500 from the cast.
    if ((err as { code?: string }).code === '22P02') return null
    throw err
  }
  if (!conversation) return null
  const channel = await em.findOne(CommunicationChannel, {
    id: conversation.channelId,
    tenantId,
    deletedAt: null,
    ...channelOrgScopeWhere(organizationId),
  } as FilterQuery<CommunicationChannel>)
  if (!channel || (channel.userId != null && channel.userId !== userId)) return null
  return { em, conversation, organizationId, tenantId }
}

function notFound() {
  return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
}

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
  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()

  const scope = await resolveConversation(em, tenantId, organizationId, auth.sub as string, params.id)
  if (!scope) return notFound()

  const notes = await em.find(
    Message,
    {
      tenantId,
      visibility: 'internal',
      sourceEntityType: CONVERSATION_SOURCE,
      sourceEntityId: scope.conversation.id,
      deletedAt: null,
      ...(organizationId ? { organizationId: { $in: [organizationId, null] } } : {}),
    } as FilterQuery<Message>,
    { orderBy: { createdAt: 'asc' }, limit: 200 },
  )

  return NextResponse.json({
    items: notes.map((note) => ({
      id: note.id,
      body: note.body,
      bodyFormat: note.bodyFormat,
      subject: note.subject,
      authorUserId: note.senderUserId,
      threadId: note.threadId ?? null,
      createdAt: note.createdAt?.toISOString?.() ?? null,
    })),
  })
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub || !auth.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = noteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: `备注正文不能为空，且不超过 ${MAX_NOTE_LENGTH} 字符`, code: 'NOTE_INVALID' },
      { status: 422 },
    )
  }

  const tenantId = auth.tenantId as string
  const organizationId = (auth as { orgId?: string | null }).orgId ?? null
  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()

  const scope = await resolveConversation(em, tenantId, organizationId, auth.sub as string, params.id)
  if (!scope) return notFound()

  const allowed = await canActorReply(
    { sub: auth.sub as string, tenantId, orgId: organizationId },
    container,
    { organizationId },
  )
  if (!allowed) {
    return NextResponse.json(
      { error: 'You do not have permission to write notes in this inbox', code: 'REPLY_FORBIDDEN' },
      { status: 403 },
    )
  }

  // Inherit the conversation's thread when one exists, so the note lands in the
  // same hub thread. Absent (brand-new conversation) the note stands alone and is
  // still attached through sourceEntityId above.
  const latestLink = await em.findOne(
    MessageChannelLink,
    { tenantId, externalConversationId: scope.conversation.id } as never,
    { orderBy: { createdAt: 'desc' } } as never,
  )
  const parentMessageId = (latestLink as { messageId?: string | null } | null)?.messageId ?? undefined

  const commandBus = container.resolve('commandBus') as CommandBus
  const { result } = await commandBus.execute('messages.messages.compose', {
    input: {
      visibility: 'internal' as const,
      // An internal message needs at least one recipient; the note is authored by
      // and addressed to the same staff member, and access is decided by the
      // conversation scope above, not by this routing field.
      recipients: [{ userId: auth.sub as string, type: 'to' as const }],
      subject: scope.conversation.subject?.trim() || '内部备注',
      body: parsed.data.body,
      bodyFormat: 'text' as const,
      type: 'note',
      isDraft: false,
      sendViaEmail: false,
      sourceEntityType: CONVERSATION_SOURCE,
      sourceEntityId: scope.conversation.id,
      ...(parentMessageId ? { parentMessageId } : {}),
      tenantId,
      organizationId,
      userId: auth.sub as string,
    },
    ctx: {
      container,
      auth,
      organizationScope: null,
      selectedOrganizationId: organizationId,
      organizationIds: organizationId ? [organizationId] : null,
      request: req,
    },
  })

  const created = result as unknown as { id: string; threadId: string | null }
  return NextResponse.json({ id: created.id, threadId: created.threadId ?? null }, { status: 201 })
}

export const openApi = {
  tags: ['Communications'],
  methods: {
    GET: {
      summary: 'List internal notes of one conversation',
      responses: [
        { status: 200, description: 'Internal notes, oldest first' },
        { status: 401, description: 'Unauthorized' },
        { status: 404, description: 'Conversation not found or not visible' },
      ],
    },
    POST: {
      summary: 'Add an internal note to one conversation (never sent to the customer)',
      responses: [
        { status: 201, description: 'Note created' },
        { status: 401, description: 'Unauthorized' },
        { status: 403, description: 'Missing reply grant' },
        { status: 404, description: 'Conversation not found or not visible' },
        { status: 422, description: 'Empty or over-long note' },
      ],
    },
  },
}
