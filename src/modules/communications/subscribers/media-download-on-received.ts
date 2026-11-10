import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { MessageChannelLink } from '@open-mercato/core/modules/communication_channels/data/entities'
import { getCommunicationChannelsQueue } from '@open-mercato/core/modules/communication_channels/lib/queue'
import { createLogger } from '@open-mercato/shared/lib/logger'
import {
  MEDIA_DOWNLOAD_QUEUE,
  readMediaDescriptor,
  readMessengerAttachment,
  type MediaDownloadJobPayload,
} from '../lib/media-download'

const logger = createLogger('communications').child({subscriber: 'media-download-on-received'})

/**
 * Bridge the hub's inbound event onto the media-download worker.
 *
 * The webhook path must stay fast and the ingest command must not depend on the
 * provider's CDN, so the download is a separate queue hop: this subscriber only
 * checks whether the stored payload HAS a media descriptor that is not yet
 * downloaded, and enqueues ids. It never fetches bytes itself.
 *
 * Persistent: the event is already durable; a lost notification would leave the
 * attachment permanently "未下载", and the queue gives the retry the event store
 * cannot.
 */
export const metadata = {
  event: 'communication_channels.message.received',
  persistent: true,
  id: 'communications:media-download-on-received',
}

type ReceivedPayload = {
  channelLinkId?: unknown
  channelId?: unknown
  channelType?: unknown
  tenantId?: unknown
  organizationId?: unknown
}

export default async function handler(payload: ReceivedPayload): Promise<void> {
  const channelLinkId = typeof payload?.channelLinkId === 'string' ? payload.channelLinkId : ''
  const tenantId = typeof payload?.tenantId === 'string' ? payload.tenantId : ''
  const organizationId = typeof payload?.organizationId === 'string' ? payload.organizationId : null
  const channelType = typeof payload?.channelType === 'string' ? payload.channelType.toLowerCase() : ''
  if (!channelLinkId || !tenantId) return
  // Only providers whose media this build can fetch. Mailbox attachments arrive
  // as MIME parts already; Messenger media download is a later slice.
  if (channelType !== 'whatsapp' && channelType !== 'messenger') return

  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()
  const link = await em.findOne(MessageChannelLink, {
    id: channelLinkId,
    tenantId,
    organizationId,
  } as never)
  if (!link) return

  const descriptor = readMediaDescriptor(link.channelPayload)
  const messengerAttachment = channelType === 'messenger' ? readMessengerAttachment(link.channelPayload) : null
  if (channelType === 'messenger') {
    if (!messengerAttachment) return
  } else {
    if (!descriptor || typeof descriptor.id !== 'string') return
    if (descriptor.download && typeof descriptor.download === 'object') return
  }

  const job: MediaDownloadJobPayload = {channelLinkId, scope: {tenantId, organizationId}}
  try {
    await getCommunicationChannelsQueue(MEDIA_DOWNLOAD_QUEUE).enqueue(job as unknown as Record<string, unknown>)
  } catch (error) {
    // The message is already in the CRM; a failed enqueue degrades to "未下载"
    // and is visible in logs instead of failing the ingest notification.
    logger.warn('failed to enqueue media download', {
      channelLinkId,
      reason: error instanceof Error ? error.message : String(error),
    })
  }
}
