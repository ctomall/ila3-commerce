import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CommunicationChannel } from '@open-mercato/core/modules/communication_channels/data/entities'
import {
  COMMUNICATION_CHANNELS_QUEUES,
  getCommunicationChannelsQueue,
} from '@open-mercato/core/modules/communication_channels/lib/queue'
import { parseMessengerEvents } from '../../../../channel_messenger/lib/messenger-payload'
import { createMessengerAdapter } from '../../../../channel_messenger/lib/adapter'
import { applyMessengerReads } from '../../../../channel_messenger/lib/read-store'

export const metadata = {
  path: '/communications/webhook/messenger',
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
 * Dedicated Messenger webhook. Same reasoning as the WhatsApp route: the hub's
 * generic route acknowledges and drops read events, and node_modules is
 * off-limits. Signature verification picks the tenant; messages join the hub
 * inbound queue; reads update the existing outbound links.
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

  const adapter = createMessengerAdapter()
  const candidates = await em.find(CommunicationChannel, {
    providerKey: 'messenger',
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
          (await credentialsService.resolve('channel_messenger', {
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
    return NextResponse.json(
      {error: 'verification_failed', detail: verificationError ? 'signature' : 'no_channel'},
      {status: 401},
    )
  }

  const parsed = parseMessengerEvents(JSON.parse(raw))
  const scope = {tenantId: matched.tenantId, organizationId: matched.organizationId ?? null}
  let queued = 0
  if (parsed.messages.length) {
    const queue = getCommunicationChannelsQueue(COMMUNICATION_CHANNELS_QUEUES.inbound)
    for (const message of parsed.messages) {
      await queue.enqueue({
        providerKey: 'messenger',
        channelId: matched.id,
        channelType: matched.channelType,
        raw: {raw: message.raw, eventType: 'message'},
        scope,
      })
      queued++
    }
  }

  let readUpdates = 0
  let skippedReads = 0
  for (const read of parsed.reads) {
    if (typeof read.watermark !== 'number') continue
    const applied = await applyMessengerReads(em, {
      tenantId: matched.tenantId,
      channelId: matched.id,
      psid: read.psid,
      watermark: read.watermark,
    })
    readUpdates += applied.updated
    skippedReads += applied.skipped
  }

  return NextResponse.json(
    {received: true, messages: queued, reads: parsed.reads.length, readUpdates, skippedReads},
    {status: 202},
  )
}

export const openApi = {
  tags: ['Communications'],
  methods: {
    POST: {
      summary: 'Receive Facebook Page Messenger webhook events (messages and read watermarks)',
      tags: ['Communications'],
      responses: [
        {status: 202, description: 'Events accepted; messages queued and read watermarks applied'},
        {status: 400, description: 'Empty body'},
        {status: 401, description: 'No channel verified the signature'},
        {status: 413, description: 'Payload too large'},
      ],
    },
  },
}
