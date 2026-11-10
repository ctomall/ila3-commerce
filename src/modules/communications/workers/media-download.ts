import type { JobContext, QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import {
  CommunicationChannel,
  ExternalMessage,
  MessageChannelLink,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import { createLogger } from '@open-mercato/shared/lib/logger'
import {
  MEDIA_DOWNLOAD_QUEUE,
  downloadInboundWhatsAppMedia,
  downloadMediaByUrl,
  readMessengerAttachment,
  requiresGraphToken,
  withMessengerMedia,
  withPersistedMedia,
  type AttachmentServiceLike,
  type MediaDownloadJobPayload,
} from '../lib/media-download'

const logger = createLogger('communications').child({worker: 'media-download'})

export const metadata: WorkerMeta = {
  queue: MEDIA_DOWNLOAD_QUEUE,
  id: 'communications:media-download',
  // Media downloads are I/O-bound and each request carries a provider token;
  // four in flight is enough for one tenant without turning a webhook burst into
  // a fan-out that hammers Graph's media endpoints.
  concurrency: 4,
}

type CredentialsServiceLike = {
  resolve: (
    integrationId: string,
    scope: {organizationId: string; tenantId: string; userId?: string | null},
  ) => Promise<Record<string, unknown> | null>
}

/**
 * One inbound media attachment per ExternalMessage.
 *
 * The job carries ids only and re-reads every row: a persistent event may have
 * been queued long before the worker ran, and the link may have been deleted or
 * already downloaded (another worker, another retry). Idempotency lives in
 * `downloadInboundWhatsAppMedia` (it returns the persisted summary instead of
 * storing the bytes twice) and is checked again here before doing any I/O.
 */
export default async function handle(
  job: QueuedJob<MediaDownloadJobPayload>,
  _ctx: JobContext,
): Promise<void> {
  const {channelLinkId, scope} = job.payload
  if (!channelLinkId || !scope?.tenantId) return

  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()

  const link = await em.findOne(MessageChannelLink, {
    id: channelLinkId,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
  } as never)
  if (!link || !link.externalMessageId) return

  const external = await em.findOne(ExternalMessage, {
    id: link.externalMessageId,
    tenantId: scope.tenantId,
  } as never)
  if (!external) return

  const channel = await em.findOne(CommunicationChannel, {
    id: external.channelId,
    tenantId: scope.tenantId,
    deletedAt: null,
  } as never)
  const channelType = channel?.channelType.toLowerCase() ?? ''
  if (!channel || (channelType !== 'whatsapp' && channelType !== 'messenger')) return

  let credentialsService: CredentialsServiceLike | null = null
  try {
    credentialsService = container.resolve('integrationCredentialsService') as CredentialsServiceLike
  } catch {
    credentialsService = null
  }
  let credentials: Record<string, unknown> = {}
  if (channel.credentialsRef && credentialsService) {
    try {
      credentials = (await credentialsService.resolve(`channel_${channel.providerKey}`, {
        tenantId: scope.tenantId,
        organizationId: channel.organizationId ?? scope.tenantId,
        userId: channel.userId ?? null,
      })) ?? {}
    } catch {
      credentials = {}
    }
  }
  // Messenger attachments are fetched from a provider-signed URL and need no
  // Graph token; only the WhatsApp media-id lookup does. The token gate therefore
  // lives on the WhatsApp branch below.
  const accessToken = typeof credentials.accessToken === 'string' ? credentials.accessToken : ''
  const graphBaseUrl = typeof credentials.graphBaseUrl === 'string' ? credentials.graphBaseUrl : undefined

  let attachmentService: AttachmentServiceLike | null = null
  try {
    attachmentService = container.resolve('attachmentService') as AttachmentServiceLike
  } catch {
    attachmentService = null
  }
  if (!attachmentService) {
    // Attachments module disabled: the descriptor stays "未下载" by design.
    logger.warn('media download skipped: attachment service unavailable', {channelLinkId})
    return
  }

  if (channelType === 'messenger') {
    const attachment = readMessengerAttachment(link.channelPayload)
    if (!attachment) return
    try {
      const downloaded = await downloadMediaByUrl({url: attachment.url})
      const created = await attachmentService.createScoped({
        tenantId: scope.tenantId,
        organizationId: link.organizationId ?? scope.organizationId ?? scope.tenantId,
        entityId: 'communication_channels.external_message',
        recordId: external.id,
        partitionCode: 'privateAttachments',
        fileName: downloaded.fileName,
        declaredMimeType: downloaded.mimeType,
        buffer: downloaded.buffer,
      })
      link.channelPayload = withMessengerMedia(
        link.channelPayload,
        {
          attachmentId: created.id,
          fileName: created.fileName,
          mimeType: created.mimeType,
          fileSize: created.fileSize,
          sha256: downloaded.sha256,
          url: created.url,
        },
        {kind: attachment.kind, mimeType: downloaded.mimeType, fileName: created.fileName},
      )
      await em.flush()
      logger.info('inbound messenger media stored', {
        channelLinkId,
        attachmentId: created.id,
        fileSize: created.fileSize,
      })
    } catch (error) {
      const code = (error as {code?: string}).code ?? 'MEDIA_DOWNLOAD_FAILED'
      logger.warn('inbound messenger media download failed', {
        channelLinkId,
        code,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
    return
  }

  if (requiresGraphToken(channelType) && !accessToken) {
    // No token means the channel is not connected; the message stays with its
    // descriptor ("未下载") rather than failing a delivery that already landed.
    logger.warn('media download skipped: channel has no access token', {
      channelLinkId,
      channelId: channel.id,
    })
    return
  }

  try {
    const persisted = await downloadInboundWhatsAppMedia({
      attachmentService,
      tenantId: scope.tenantId,
      organizationId: link.organizationId ?? scope.organizationId ?? null,
      externalMessageRowId: external.id,
      channelPayload: link.channelPayload,
      accessToken,
      baseUrl: graphBaseUrl,
    })
    if (!persisted) return
    link.channelPayload = withPersistedMedia(link.channelPayload, persisted)
    await em.flush()
    logger.info('inbound media stored', {
      channelLinkId,
      attachmentId: persisted.attachmentId,
      fileSize: persisted.fileSize,
      mimeType: persisted.mimeType,
    })
  } catch (error) {
    // A media failure must never fail the message: the text/descriptor is
    // already delivered to the CRM, and the operator can retry by re-sending the
    // download job. Log with the machine code so the failure is diagnosable.
    const code = (error as {code?: string}).code ?? 'MEDIA_DOWNLOAD_FAILED'
    logger.warn('inbound media download failed', {
      channelLinkId,
      channelId: channel.id,
      code,
      reason: error instanceof Error ? error.message : String(error),
    })
  }
}
