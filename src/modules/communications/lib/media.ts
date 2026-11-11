/**
 * Normalize the provider-specific attachment metadata our adapters keep on
 * `ExternalMessage.channelPayload` into one shape for the inbox.
 *
 * Bytes are downloaded by the media worker (G3) and stored as a real Attachment
 * linked to the ExternalMessage row; when that has happened the descriptor gains
 * `_meta.media.download` and this summary reports `downloaded: true` instead of
 * pretending a remote file is local.
 */
export type MediaSummary = {
  kind: string
  fileName?: string
  mimeType?: string
  externalId?: string
  downloaded: boolean
  attachmentId?: string
  fileSize?: number
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function extractMediaSummary(channelPayload: unknown): MediaSummary | null {
  if (!channelPayload || typeof channelPayload !== 'object') return null
  const payload = channelPayload as Record<string, unknown>

  // WhatsApp: adapter keeps the full event and `_meta.media`.
  const meta = payload._meta as Record<string, unknown> | undefined
  const media = meta?.media as Record<string, unknown> | undefined
  if (media) {
    const download = media.download as Record<string, unknown> | undefined
    const attachmentId = str(download?.attachmentId)
    return {
      kind: str(media.kind) ?? 'document',
      fileName: str(download?.fileName) ?? str(media.fileName),
      mimeType: str(download?.mimeType) ?? str(media.mimeType),
      externalId: str(media.id),
      downloaded: Boolean(attachmentId),
      ...(attachmentId ? {attachmentId} : {}),
      ...(typeof download?.fileSize === 'number' ? {fileSize: download.fileSize} : {}),
    }
  }

  // Messenger: the raw event carries `message.attachments[]`.
  const message = payload.message as Record<string, unknown> | undefined
  const attachments = message?.attachments
  if (Array.isArray(attachments) && attachments[0] && typeof attachments[0] === 'object') {
    const first = attachments[0] as Record<string, unknown>
    return {
      kind: str(first.type) ?? 'file',
      downloaded: false,
    }
  }

  // Email: channel-imap stores parsed attachment descriptors under `attachments`.
  const emailAttachments = payload.attachments
  if (Array.isArray(emailAttachments) && emailAttachments[0] && typeof emailAttachments[0] === 'object') {
    const first = emailAttachments[0] as Record<string, unknown>
    return {
      kind: 'document',
      fileName: str(first.filename) ?? str(first.fileName),
      mimeType: str(first.contentType) ?? str(first.mimeType),
      downloaded: false,
    }
  }
  return null
}

export function describeMedia(media: MediaSummary): string {
  const label = media.fileName
    ? `${media.kind}「${media.fileName}」`
    : media.mimeType
      ? `${media.kind}（${media.mimeType}）`
      : media.kind
  if (media.downloaded) {
    const size = typeof media.fileSize === 'number' ? ` · ${formatBytes(media.fileSize)}` : ''
    return `附件：${label} · 已下载${size}`
  }
  return `附件：${label} · 未下载`
}

/**
 * Browser URL for an inbound attachment the media worker already persisted.
 *
 * The installed attachments module serves bytes at `/api/attachments/file/{id}`
 * and enforces the tenant/organization scope itself, so the inbox only needs to
 * link to it. `null` when the bytes were never downloaded: a provider URL would
 * expire, and rendering one would pretend the CRM has the file.
 */
export function mediaHref(media: MediaSummary): string | null {
  if (!media.downloaded || !media.attachmentId) return null
  return `/api/attachments/file/${encodeURIComponent(media.attachmentId)}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
