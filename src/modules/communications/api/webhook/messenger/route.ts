import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import {
  WebhookBodyTooLargeError,
  readBoundedWebhookBody,
} from '../../../lib/bounded-body'
import { CommunicationChannel } from '@open-mercato/core/modules/communication_channels/data/entities'
import {
  COMMUNICATION_CHANNELS_QUEUES,
  getCommunicationChannelsQueue,
} from '@open-mercato/core/modules/communication_channels/lib/queue'
import { parseMessengerEvents, readMessengerAccountIds } from '../../../../channel_messenger/lib/messenger-payload'
import { createMessengerAdapter } from '../../../../channel_messenger/lib/adapter'
import { applyMessengerReads } from '../../../../channel_messenger/lib/read-store'

const logger = createLogger('communications').child({component: 'webhook-messenger'})

export const metadata = {
  path: '/communications/webhook/messenger',
  POST: { requireAuth: false },
}


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
  let raw: string
  try {
    // Bounded before it is materialised: an unauthenticated caller must not be
    // able to make this process hold an arbitrarily large body. The limit is in
    // bytes, and an oversized request is refused before its body is read.
    raw = await readBoundedWebhookBody(req)
  } catch (error) {
    if (error instanceof WebhookBodyTooLargeError) {
      return NextResponse.json({error: 'payload_too_large'}, {status: 413})
    }
    throw error
  }
  if (!raw) return NextResponse.json({error: 'empty_body'}, {status: 400})

  // Parsed once for account pinning, reused by the event splitter after a
  // channel matches. Invalid JSON falls through to the adapter verifier.
  let payload: unknown = null
  try {
    payload = JSON.parse(raw)
  } catch {
    payload = null
  }
  const accountIds = payload ? readMessengerAccountIds(payload) : []

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
  let accountMismatch = false
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
        // The HMAC proves the Meta APP, not the Page. When the payload names its
        // Page (`entry[].id`), the candidate must own it; a mismatch moves on to
        // the next candidate instead of misattributing the event.
        const expectedAccountId = candidate.externalIdentifier?.trim() || null
        if (accountIds.length > 0 && expectedAccountId) {
          if (accountIds.some((id) => id !== expectedAccountId)) {
            accountMismatch = true
            continue
          }
        } else if (accountIds.length > 0) {
          logger.warn('messenger channel has no external_identifier; accepting without account pin', {
            channelId: candidate.id,
            providerAccountIdCount: accountIds.length,
          })
        }
        matched = candidate
        break
      }
    } catch (error) {
      verificationError = error
    }
  }

  if (!matched) {
    return NextResponse.json(
      {
        error: 'verification_failed',
        detail: verificationError ? 'signature' : accountMismatch ? 'account' : 'no_channel',
      },
      { status: 401 },
    )
  }

  const parsed = parseMessengerEvents(payload ?? JSON.parse(raw))
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
