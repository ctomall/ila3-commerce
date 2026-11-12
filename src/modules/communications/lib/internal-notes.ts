/**
 * Internal notes (design rev2 `F3-06`): read query + compose input builder.
 *
 * A note is a `messages.message` row with `visibility: 'internal'` and NO channel
 * link; the installed delivery command treats a thread without a
 * `ChannelThreadMapping` as internal-only and stops, so nothing reaches the
 * customer. The two facts that make that true are pinned here instead of being
 * spread through the route:
 *
 *  - the read is scoped to tenant + NULL-inclusive organization + this
 *    conversation, and never returns public or deleted rows;
 *  - the compose input never carries a sender channel, channel metadata or
 *    `sendViaEmail`, and addresses the note to its author (internal visibility
 *    requires at least one recipient in the installed schema).
 */
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { Message } from '@open-mercato/core/modules/messages/data/entities'
import { nullInclusiveOrgWhere } from './org-scope'

export const CONVERSATION_SOURCE = 'communication_channels.conversation'
export const MAX_NOTE_LENGTH = 4000
export const NOTE_LIST_LIMIT = 200

export type InternalNoteView = {
  id: string
  body: string
  bodyFormat: string
  subject: string
  authorUserId: string
  threadId: string | null
  createdAt: string | null
}

export async function listInternalNotes(
  em: EntityManager,
  input: { tenantId: string; organizationId: string | null; conversationId: string; limit?: number },
): Promise<InternalNoteView[]> {
  const notes = await em.find(
    Message,
    {
      tenantId: input.tenantId,
      visibility: 'internal',
      sourceEntityType: CONVERSATION_SOURCE,
      sourceEntityId: input.conversationId,
      deletedAt: null,
      ...nullInclusiveOrgWhere(input.organizationId),
    } as FilterQuery<Message>,
    {
      orderBy: { createdAt: 'asc' },
      limit: Math.min(Math.max(input.limit ?? NOTE_LIST_LIMIT, 1), NOTE_LIST_LIMIT),
    },
  )
  return notes.map((note) => ({
    id: note.id,
    body: note.body,
    bodyFormat: note.bodyFormat,
    subject: note.subject,
    authorUserId: note.senderUserId,
    threadId: note.threadId ?? null,
    createdAt: note.createdAt?.toISOString?.() ?? null,
  }))
}

/**
 * Compose command input for one note. Pure so the "never delivered" properties
 * can be asserted without a database or a command bus.
 */
export function buildInternalNoteInput(input: {
  tenantId: string
  organizationId: string | null
  userId: string
  conversationId: string
  subject: string | null | undefined
  body: string
  parentMessageId?: string | null
}): Record<string, unknown> {
  return {
    visibility: 'internal' as const,
    // Internal visibility requires at least one recipient in the installed
    // schema; the note is authored by and addressed to the same staff member.
    recipients: [{ userId: input.userId, type: 'to' as const }],
    subject: input.subject?.trim() || '内部备注',
    body: input.body,
    bodyFormat: 'text' as const,
    type: 'note',
    isDraft: false,
    // No platform delivery: no sender channel, no email, no caller metadata.
    sendViaEmail: false,
    sourceEntityType: CONVERSATION_SOURCE,
    sourceEntityId: input.conversationId,
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    tenantId: input.tenantId,
    organizationId: input.organizationId,
    userId: input.userId,
  }
}
