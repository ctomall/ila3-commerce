import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { hasChannelAdapter } from '@open-mercato/core/modules/communication_channels/lib/adapter-registry-singleton'
import {
  CommunicationChannel,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import { channelOrgScopeWhere } from '@open-mercato/core/modules/communication_channels/lib/access-control'
import { describeChannelAvailability } from '../../../lib/channel-availability'

/**
 * Account list for the inbox (design rev2 `F1-01` + `F8-05`).
 *
 * Channels the caller can use: tenant-wide (`userId: null`) plus the caller's own,
 * narrowed by the same organization scope the inbox uses. Each row carries an
 * explicit can-receive / can-send state so a channel that cannot receive never
 * looks like an empty inbox.
 */
export const metadata = {
  path: '/communications/me/channels',
  GET: {
    requireAuth: true,
    requireFeatures: ['communication_channels.view'],
  },
}

type ChannelRow = {
  id: string
  providerKey: string
  channelType: string
  displayName: string
  visibility: 'private' | 'shared'
  status: string | null
  externalIdentifier: string | null
  lastError: string | null
  lastConnectedAt: string | null
}

export async function GET(req: Request): Promise<Response> {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub || !auth.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = auth.tenantId as string
  const organizationId = (auth as { orgId?: string | null }).orgId ?? null
  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()

  const channels = await em.find(
    CommunicationChannel,
    {
      tenantId,
      deletedAt: null,
      $and: [
        { $or: [{ userId: null }, { userId: auth.sub as string }] },
        channelOrgScopeWhere(organizationId),
      ],
    } as FilterQuery<CommunicationChannel>,
    { orderBy: { createdAt: 'asc' } },
  )

  const items = channels.map((channel) => {
    const providerKey = String(channel.providerKey ?? '')
    const availability = describeChannelAvailability({
      providerKey,
      channelType: channel.channelType,
      status: channel.status,
      externalIdentifier: channel.externalIdentifier,
      // Process-level fact: the connector registers itself at boot; a missing
      // adapter means this process cannot send through it at all.
      adapterRegistered: providerKey ? hasChannelAdapter(providerKey) : false,
    })
    const row: ChannelRow = {
      id: channel.id,
      providerKey,
      channelType: String(channel.channelType ?? ''),
      displayName: String(channel.displayName ?? ''),
      visibility: channel.visibility === 'shared' ? 'shared' : 'private',
      status: channel.status ?? null,
      externalIdentifier: channel.externalIdentifier ?? null,
      lastError: (channel as { lastError?: string | null }).lastError ?? null,
      lastConnectedAt:
        (channel as { lastConnectedAt?: Date | null }).lastConnectedAt?.toISOString?.() ?? null,
    }
    return { ...row, availability }
  })

  return NextResponse.json({
    items,
    summary: {
      total: items.length,
      inboundUnavailable: items.filter((item) => !item.availability.inbound.available).length,
      outboundUnavailable: items.filter((item) => !item.availability.outbound.available).length,
    },
  })
}

export const openApi = {
  tags: ['Communications'],
  methods: {
    GET: {
      summary: 'List the caller\'s usable channels with can-receive/can-send state',
      responses: [
        { status: 200, description: 'Channels with availability codes and hints' },
        { status: 401, description: 'Unauthorized' },
      ],
    },
  },
}
