/**
 * Normalize the provider-specific attachment metadata our adapters keep on
 * `ExternalMessage.channelPayload` into one shape for the inbox.
 *
 * This slice intentionally does NOT download bytes: the hub never persists
 * inbound attachments and the attachments module's authorization/quota
 * semantics are a separate decision (ADR-005 G3). Exposing the metadata lets
 * staff see that a file arrived without pretending it is stored locally.
 */
export type MediaSummary = {
  kind: string
  fileName?: string
  mimeType?: string
  externalId?: string
  downloaded: false
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
    return {
      kind: str(media.kind) ?? 'document',
      fileName: str(media.fileName),
      mimeType: str(media.mimeType),
      externalId: str(media.id),
      downloaded: false,
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
  return `附件：${label} · 未下载`
}
