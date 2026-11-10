import type { EntityManager } from '@mikro-orm/postgresql'
import { uploadWhatsAppMedia, MetaGraphError, GRAPH_MEDIA_MAX_BYTES } from '../../channel_whatsapp/lib/graph-client'
import { assertAllowedMime, MediaDownloadError } from './media-download'

/**
 * Bridge a CRM attachment to a provider-native media send.
 *
 * Meta cannot fetch bytes from our private storage, so the BFF uploads them to
 * the Cloud API media store and hands the hub the returned numeric id. This is
 * the only path that lets a staff member reply with a file they already have in
 * the CRM; the alternative (a public link) only works for documents already
 * hosted elsewhere.
 *
 * Authorization is the attachments module's own `readScoped`: the caller must
 * pass the same auth context and the expected owner, so a user cannot upload
 * bytes from another tenant's attachment by guessing an id.
 */

export type OutboundMediaErrorCode =
  | 'ATTACHMENT_NOT_FOUND'
  | 'ATTACHMENT_UNREADABLE'
  | 'MEDIA_MIME_UNSUPPORTED'
  | 'MEDIA_TOO_LARGE'
  | 'MEDIA_UPLOAD_FAILED'

export class OutboundMediaError extends Error {
  readonly status: number
  readonly code: OutboundMediaErrorCode
  constructor(status: number, code: OutboundMediaErrorCode, message: string) {
    super(message)
    this.name = 'OutboundMediaError'
    this.status = status
    this.code = code
  }
}

export type OutboundMediaKind = 'image' | 'audio' | 'video' | 'document'

export function inferMediaKind(mimeType: string): OutboundMediaKind {
  const mime = mimeType.split(';')[0].trim().toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  return 'document'
}

export type AttachmentRow = {
  id: string
  entityId: string
  recordId: string
  fileName: string
  mimeType: string
  fileSize: number
  partitionCode: string
}

/**
 * Read the attachment row over the module boundary by SQL, not ORM: the
 * attachments entities are not in our package export surface, and the project
 * rule is "cross-module references by id, no ORM relationship". The query is
 * tenant-scoped, so a foreign id simply returns no row.
 */
export async function loadAttachmentRow(
  em: EntityManager,
  attachmentId: string,
  tenantId: string,
): Promise<AttachmentRow | null> {
  const rows = (await em.getConnection().execute(
    `select id, entity_id, record_id, file_name, mime_type, file_size, partition_code
       from attachments
      where id = ? and tenant_id = ?
      limit 1`,
    [attachmentId, tenantId],
  )) as Array<Record<string, unknown>>
  const row = rows[0]
  if (!row) return null
  return {
    id: String(row.id),
    entityId: String(row.entity_id),
    recordId: String(row.record_id),
    fileName: String(row.file_name ?? 'attachment'),
    mimeType: String(row.mime_type ?? 'application/octet-stream'),
    fileSize: Number(row.file_size ?? 0),
    partitionCode: String(row.partition_code ?? 'privateAttachments'),
  }
}

type AttachmentServiceLike = {
  readScoped(input: {
    attachmentId: string
    auth: unknown
    expectedOwner: {entityId: string; recordId: string}
    expectedPartitionCode?: string
  }): Promise<{buffer: Buffer; contentType: string; fileName: string; mimeType: string}>
}

type CredentialsServiceLike = {
  resolve: (
    integrationId: string,
    scope: {organizationId: string; tenantId: string; userId?: string | null},
  ) => Promise<Record<string, unknown> | null>
}

export type ResolvedOutboundMedia = {
  kind: OutboundMediaKind
  id: string
  fileName: string
  caption?: string
}

export async function uploadAttachmentAsMedia(input: {
  em: EntityManager
  auth: unknown
  attachmentService: AttachmentServiceLike
  credentialsService: CredentialsServiceLike
  channel: {
    providerKey: string
    organizationId: string | null
    tenantId: string
    userId: string | null
  }
  attachmentId: string
  tenantId: string
  caption?: string
  fetchImpl?: typeof fetch
}): Promise<ResolvedOutboundMedia> {
  const row = await loadAttachmentRow(input.em, input.attachmentId, input.tenantId)
  if (!row) {
    throw new OutboundMediaError(404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found in this tenant')
  }
  try {
    assertAllowedMime(row.mimeType)
  } catch (error) {
    if (error instanceof MediaDownloadError) {
      throw new OutboundMediaError(415, 'MEDIA_MIME_UNSUPPORTED', error.message)
    }
    throw error
  }
  if (row.fileSize > GRAPH_MEDIA_MAX_BYTES) {
    throw new OutboundMediaError(
      413,
      'MEDIA_TOO_LARGE',
      `Attachment is ${row.fileSize} bytes, over the ${GRAPH_MEDIA_MAX_BYTES}-byte provider limit`,
    )
  }

  let bytes: Buffer
  try {
    const read = await input.attachmentService.readScoped({
      attachmentId: row.id,
      auth: input.auth,
      expectedOwner: {entityId: row.entityId, recordId: row.recordId},
      expectedPartitionCode: row.partitionCode,
    })
    bytes = read.buffer
  } catch {
    // The attachments module refused: wrong tenant, missing assignment, or
    // storage unreadable. Do not leak which, and never fall back to raw storage.
    throw new OutboundMediaError(404, 'ATTACHMENT_UNREADABLE', 'Attachment is not readable by this user')
  }

  let credentials: Record<string, unknown> = {}
  try {
    credentials = (await input.credentialsService.resolve(`channel_${input.channel.providerKey}`, {
      tenantId: input.tenantId,
      organizationId: input.channel.organizationId ?? input.tenantId,
      userId: input.channel.userId,
    })) ?? {}
  } catch {
    credentials = {}
  }
  const accessToken = typeof credentials.accessToken === 'string' ? credentials.accessToken : ''
  const phoneNumberId = typeof credentials.phoneNumberId === 'string' ? credentials.phoneNumberId : ''
  if (!accessToken || !phoneNumberId) {
    throw new OutboundMediaError(503, 'MEDIA_UPLOAD_FAILED', 'Channel credentials are incomplete for media upload')
  }
  const baseUrl = typeof credentials.graphBaseUrl === 'string' ? credentials.graphBaseUrl : undefined

  try {
    const uploaded = await uploadWhatsAppMedia({
      baseUrl,
      phoneNumberId,
      accessToken,
      buffer: bytes,
      mimeType: row.mimeType,
      fileName: row.fileName,
      fetchImpl: input.fetchImpl,
    })
    return {
      kind: inferMediaKind(row.mimeType),
      id: uploaded.mediaId,
      fileName: row.fileName,
      ...(input.caption ? {caption: input.caption} : {}),
    }
  } catch (error) {
    if (error instanceof MetaGraphError) {
      if (error.httpStatus === 413 || error.code === 'MEDIA_TOO_LARGE') {
        throw new OutboundMediaError(413, 'MEDIA_TOO_LARGE', error.message)
      }
      throw new OutboundMediaError(
        error.transient ? 503 : 422,
        'MEDIA_UPLOAD_FAILED',
        `Provider media upload failed (${error.code}): ${error.message}`,
      )
    }
    throw new OutboundMediaError(503, 'MEDIA_UPLOAD_FAILED', 'Provider media upload failed')
  }
}
