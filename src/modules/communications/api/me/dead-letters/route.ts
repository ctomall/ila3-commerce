import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import {
  ChannelIngestDeadLetter,
  CommunicationChannel,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import { nullInclusiveOrgWhere } from '../../../lib/org-scope'

/**
 * Inbound dead letters (design rev2 `F8-03`).
 *
 * Webhook/poll payloads the hub could not ingest land in
 * `channel_ingest_dead_letters`; without a list they are invisible to operators.
 * This endpoint exposes the metadata needed to act (what failed, on which channel,
 * when) and never the captured body: `rawBody` is truncated provider content and
 * stays out of every response, so the page cannot leak message payloads.
 *
 * Gated on `communication_channels.manage` like the reconciliation surface.
 */
export const metadata = {
  path: '/communications/me/dead-letters',
  GET: { requireAuth: true, requireFeatures: ['communication_channels.manage'] },
}

const MAX_ROWS = 100

export async function GET(req: Request): Promise<Response> {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub || !auth.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = auth.tenantId as string
  const organizationId = (auth as { orgId?: string | null }).orgId ?? null
  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()

  const rows = await em.find(
    ChannelIngestDeadLetter,
    {
      tenantId,
      ...nullInclusiveOrgWhere(organizationId),
    } as never,
    { orderBy: { createdAt: 'desc' }, limit: MAX_ROWS },
  )

  const channelIds = [...new Set(rows.map((row) => row.channelId).filter(Boolean))]
  const channels = channelIds.length
    ? await em.find(CommunicationChannel, { id: { $in: channelIds }, tenantId } as never)
    : []
  const channelById = new Map(channels.map((channel) => [channel.id, channel] as const))

  return NextResponse.json({
    items: rows.map((row) => ({
      id: row.id,
      channelId: row.channelId,
      channelDisplayName: channelById.get(row.channelId)?.displayName ?? '',
      providerKey: row.providerKey,
      errorClass: row.errorClass,
      // Provider text, not customer content; still capped so a huge stack trace
      // cannot bloat the response.
      errorMessage: String(row.errorMessage ?? '').slice(0, 500),
      externalUid: row.externalUid ?? null,
      externalMessageId: row.externalMessageId ?? null,
      createdAt: row.createdAt?.toISOString?.() ?? null,
    })),
    total: rows.length,
  })
}

export const openApi = {
  tags: ['Communications'],
  methods: {
    GET: {
      summary: 'List inbound dead letters in the caller scope (metadata only, never the captured body)',
      responses: [
        { status: 200, description: 'Up to 100 dead letters, newest first' },
        { status: 401, description: 'Unauthorized' },
      ],
    },
  },
}
