import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import {
  CommunicationChannel,
  ExternalConversation,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import {
  RECONCILIATION_OUTCOMES,
  ReconciliationError,
  listUnknownLinks,
  recordReconciliation,
} from '../../../lib/unknown-reconciliation'

/**
 * Product surface for `unknown` outbound results (design rev2 `F8-03`).
 *
 * Until now the only way to close an unknown was the CLI. This endpoint lists the
 * unresolved ones and records the same human finding the CLI writes, without ever
 * changing `delivery_status` or re-sending. Gated on `communication_channels.manage`
 * (an operator action, not a read of the inbox) — design F8-03 "管理/管理范围".
 */
export const metadata = {
  path: '/communications/me/reconciliation',
  GET: { requireAuth: true, requireFeatures: ['communication_channels.manage'] },
  POST: { requireAuth: true, requireFeatures: ['communication_channels.manage'] },
}

const recordSchema = z.object({
  linkId: z.string().uuid(),
  outcome: z.enum(RECONCILIATION_OUTCOMES),
  note: z.string().trim().min(8).max(2000),
})

export async function GET(req: Request): Promise<Response> {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub || !auth.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = auth.tenantId as string
  const organizationId = (auth as { orgId?: string | null }).orgId ?? null
  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()

  const rows = await listUnknownLinks(em, { tenantId, organizationId })

  // Labels only: a conversation subject and the channel name make the row
  // actionable. No message body is read here.
  const conversationIds = [...new Set(rows.map((row) => row.conversationId))]
  const conversations = conversationIds.length
    ? await em.find(ExternalConversation, {
        id: { $in: conversationIds },
        tenantId,
      } as never)
    : []
  const conversationById = new Map(
    conversations.map((conversation) => [conversation.id, conversation] as const),
  )
  const channelIds = [
    ...new Set(conversations.map((conversation) => conversation.channelId).filter(Boolean)),
  ]
  const channels = channelIds.length
    ? await em.find(CommunicationChannel, { id: { $in: channelIds }, tenantId } as never)
    : []
  const channelById = new Map(channels.map((channel) => [channel.id, channel] as const))

  return NextResponse.json({
    items: rows.map((row) => {
      const conversation = conversationById.get(row.conversationId)
      const channel = conversation ? channelById.get(conversation.channelId) : undefined
      return {
        linkId: row.id,
        messageId: row.messageId,
        conversationId: row.conversationId,
        conversationLabel: conversation
          ? conversation.subject?.trim() || conversation.externalConversationId
          : row.conversationId.slice(0, 8),
        externalConversationId: conversation?.externalConversationId ?? null,
        channelDisplayName: channel?.displayName ?? '',
        providerKey: row.providerKey,
        channelType: row.channelType,
        createdAt: row.createdAt,
        lastAttemptAt: row.lastAttemptAt,
        reconciliation: row.reconciliation,
      }
    }),
    total: rows.length,
  })
}

export async function POST(req: Request): Promise<Response> {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub || !auth.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = recordSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'linkId、outcome 与至少 8 个字符的 note 都是必填',
        code: 'RECONCILIATION_INVALID',
      },
      { status: 422 },
    )
  }
  const organizationId = (auth as { orgId?: string | null }).orgId ?? null
  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()
  try {
    const result = await recordReconciliation(em, {
      tenantId: auth.tenantId as string,
      organizationId,
      linkId: parsed.data.linkId,
      outcome: parsed.data.outcome,
      note: parsed.data.note,
      operatorUserId: auth.sub as string,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ReconciliationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    throw error
  }
}

export const openApi = {
  tags: ['Communications'],
  methods: {
    GET: {
      summary: 'List unresolved unknown outbound results in the caller scope',
      responses: [
        { status: 200, description: 'Unknown links with labels and any recorded verdict' },
        { status: 401, description: 'Unauthorized' },
      ],
    },
    POST: {
      summary: 'Record a human verdict for one unknown result (never sends, never changes status)',
      responses: [
        { status: 200, description: 'Record appended to link metadata' },
        { status: 401, description: 'Unauthorized' },
        { status: 404, description: 'Link not found in scope' },
        { status: 409, description: 'Link is not unknown, or already reconciled' },
        { status: 422, description: 'Invalid payload' },
      ],
    },
  },
}
