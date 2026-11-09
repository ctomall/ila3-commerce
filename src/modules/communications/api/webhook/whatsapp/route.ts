import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CommunicationChannel } from '@open-mercato/core/modules/communication_channels/data/entities'
import {
  COMMUNICATION_CHANNELS_QUEUES,
  getCommunicationChannelsQueue,
} from '@open-mercato/core/modules/communication_channels/lib/queue'
import { parseMetaEvents } from '../../../../channel_whatsapp/lib/meta-payload'
import { createWhatsAppAdapter } from '../../../../channel_whatsapp/lib/adapter'
import { applyStatusEvents } from '../../../../channel_whatsapp/lib/status-store'

export const metadata = {
  path: '/communications/webhook/whatsapp',
  POST: { requireAuth: false },
}

const MAX_BODY_BYTES = 1024 * 1024

type Channel = InstanceType<typeof CommunicationChannel>
type CredentialsServiceLike = {
  resolve: (
    providerOrIntegrationId: string,
    scope: { organizationId: string; tenantId: string; userId?: string | null },
  ) => Promise<Record<string, unknown> | null>
}

/**
 * Dedicated WhatsApp webhook.
 *
 * Why not the hub's generic route: it acknowledges `status_update` events with
 * "not yet handled" and drops them, and node_modules is off-limits. This route
 * keeps the hub's security model — signature verification selects the tenant,
 * never the payload — and reuses the hub's inbound queue and entities for
 * everything else. Message events become the same `InboundProcessorPayload` the
 * generic route enqueues; status events update the existing MessageChannelLink.
 */
export async function POST(req: Request): Promise<Response> {
  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({error: 'payload_too_large'}, {status: 413})
  if (!raw) return NextResponse.json({error: 'empty_body'}, {status: 400})

  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()
  let credentialsService: CredentialsServiceLike | null = null
  try {
    credentialsService = container.resolve<CredentialsServiceLike>('integrationCredentialsService')
  } catch {
    credentialsService = null
  }

  const adapter = createWhatsAppAdapter()
  const candidates = await em.find(CommunicationChannel, {
    providerKey: 'whatsapp-business',
    isActive: true,
    deletedAt: null,
  } as FilterQuery<CommunicationChannel>)

  let matched: Channel | null = null
  let verificationError: unknown = null
  for (const candidate of candidates as Channel[]) {
    let credentials: Record<string, unknown> = {}
    if (candidate.credentialsRef && credentialsService) {
      try {
        credentials =
          (await credentialsService.resolve('channel_whatsapp-business', {
            tenantId: candidate.tenantId,
            organizationId: candidate.organizationId ?? candidate.tenantId,
            userId: candidate.userId ?? null,
          })) ?? {}
      } catch {
        credentials = {}
      }
    }
    try {
      const event = await adapter.verifyWebhook({
        rawBody: raw,
        headers: {'x-hub-signature-256': req.headers.get('x-hub-signature-256') ?? undefined},
        credentials,
        scope: {tenantId: candidate.tenantId, organizationId: candidate.organizationId ?? candidate.tenantId},
      })
      if (event.eventType === 'message' || event.eventType === 'status_update') {
        matched = candidate
        break
      }
    } catch (error) {
      verificationError = error
    }
  }

  if (!matched) {
    // Never echo verification internals to an unauthenticated caller.
    return NextResponse.json({error: 'verification_failed', detail: verificationError ? 'signature' : 'no_channel'}, {status: 401})
  }

  const parsed = parseMetaEvents(JSON.parse(raw))
  const scope = {tenantId: matched.tenantId, organizationId: matched.organizationId ?? null}
  let queued = 0
  if (parsed.messages.length) {
    const queue = getCommunicationChannelsQueue(COMMUNICATION_CHANNELS_QUEUES.inbound)
    for (const message of parsed.messages) {
      await queue.enqueue({
        providerKey: 'whatsapp-business',
        channelId: matched.id,
        channelType: matched.channelType,
        raw: {raw: message.raw, eventType: 'message'},
        scope,
      })
      queued++
    }
  }

  const statuses = parsed.statuses.length
    ? await applyStatusEvents(em, {tenantId: matched.tenantId, channelId: matched.id, statuses: parsed.statuses})
    : {updated: [], skipped: []}

  return NextResponse.json(
    {
      received: true,
      messages: queued,
      statuses: parsed.statuses.length,
      statusUpdates: statuses.updated.length,
      skippedStatuses: statuses.skipped.length,
    },
    {status: 202},
  )
}

export const openApi = {
  tags: ['Communications'],
  methods: {
    POST: {
      summary: 'Receive WhatsApp Cloud API webhook events (messages and status receipts)',
      tags: ['Communications'],
      responses: [
        {status: 202, description: 'Events accepted; messages queued and receipts applied'},
        {status: 400, description: 'Empty body'},
        {status: 401, description: 'No channel verified the signature'},
        {status: 413, description: 'Payload too large'},
      ],
    },
  },
}
