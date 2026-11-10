/**
 * Facebook Page Messenger payload helpers.
 *
 * Pure parsing/building: no network, no database. The shape differs from the
 * WhatsApp Cloud API even though both are Meta webhooks — Messenger nests events
 * under entry[].messaging[] and addresses recipients by PSID.
 */

export type MessengerAttachment = {type: string; url?: string}

export type MessengerMessage = {
  mid: string
  psid: string
  pageId: string
  timestamp: Date
  text?: string
  attachments: MessengerAttachment[]
  postback?: {title?: string; payload?: string}
  raw: Record<string, unknown>
}

export type MessengerRead = {psid: string; watermark?: number; raw: Record<string, unknown>}

function toDate(value: unknown): Date {
  const ms = Number(value)
  if (Number.isFinite(ms) && ms > 0) return new Date(ms)
  return new Date()
}

/**
 * Distinct provider account ids (the Page id on `entry[].id`) carried by a
 * Messenger webhook body. The HMAC proves the Meta APP, not the Page; this is
 * what pins an event to the channel that connected the Page. Returns every
 * distinct id so a mixed payload is rejected rather than misrouted.
 */
export function readMessengerAccountIds(payload: unknown): string[] {
  const root = payload as { entry?: Array<{ id?: unknown }> } | null
  const ids = new Set<string>()
  for (const entry of root?.entry ?? []) {
    if (typeof entry.id === 'string' && entry.id.length > 0) ids.add(entry.id)
  }
  return [...ids]
}

export function parseMessengerEvents(payload: unknown): {messages: MessengerMessage[]; reads: MessengerRead[]} {
  const messages: MessengerMessage[] = []
  const reads: MessengerRead[] = []
  const root = payload as {entry?: Array<{id?: string; messaging?: Array<Record<string, unknown>>}>} | null
  for (const entry of root?.entry ?? []) {
    const pageId = typeof entry.id === 'string' ? entry.id : ''
    for (const event of entry.messaging ?? []) {
      const sender = event.sender as {id?: string} | undefined
      const psid = typeof sender?.id === 'string' ? sender.id : ''
      if (event.read && typeof event.read === 'object') {
        const watermark = (event.read as {watermark?: unknown}).watermark
        reads.push({psid, watermark: typeof watermark === 'number' ? watermark : undefined, raw: event})
        continue
      }
      const message = event.message as Record<string, unknown> | undefined
      const postback = event.postback as Record<string, unknown> | undefined
      if (!message && !postback) continue
      const mid = message && typeof message.mid === 'string' ? message.mid : ''
      const text = message && typeof message.text === 'string' ? message.text : undefined
      const attachments = Array.isArray(message?.attachments)
        ? (message!.attachments as Array<Record<string, unknown>>).map((attachment) => {
            const payloadNode = (attachment.payload ?? {}) as Record<string, unknown>
            return {
              type: typeof attachment.type === 'string' ? attachment.type : 'unknown',
              url: typeof payloadNode.url === 'string' ? payloadNode.url : undefined,
            }
          })
        : []
      if (!mid && !postback) continue
      messages.push({
        mid: mid || `postback:${psid}:${toDate(event.timestamp).getTime()}`,
        psid,
        pageId,
        timestamp: toDate(event.timestamp),
        text,
        attachments,
        postback: postback
          ? {
              title: typeof postback.title === 'string' ? postback.title : undefined,
              payload: typeof postback.payload === 'string' ? postback.payload : undefined,
            }
          : undefined,
        raw: event,
      })
    }
  }
  return {messages, reads}
}

export function describeMessengerMessage(message: MessengerMessage): {body: string; contentType: string} {
  if (message.text) return {body: message.text, contentType: 'text/plain'}
  if (message.attachments.length) {
    const first = message.attachments[0]
    return {
      body: `[${first.type}]`,
      contentType: first.type === 'image' ? 'image/*' : first.type === 'video' ? 'video/*' : first.type === 'audio' ? 'audio/*' : 'application/octet-stream',
    }
  }
  if (message.postback) return {body: message.postback.title ?? `[postback:${message.postback.payload ?? ''}]`, contentType: 'text/plain'}
  return {body: '[unsupported]', contentType: 'text/plain'}
}

export type MessengerOutboundMediaKind = 'image' | 'audio' | 'video' | 'file'

export class MessengerMediaError extends Error {
  readonly code = 'MESSENGER_MEDIA_INVALID'
  constructor(message: string) {
    super(message)
    this.name = 'MessengerMediaError'
  }
}

const MESSENGER_KINDS = new Set(['image', 'audio', 'video', 'document', 'file'])

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!ipv4) return false
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
  return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

/**
 * Messenger media is link-only: the Send API takes `attachment.payload.url` and
 * fetches it itself. There is no provider media-id store for Pages (message
 * attachments are a separate, deprecated flow), so this connector accepts only a
 * public https link and refuses an id or a 404-producing private address instead
 * of silently sending text.
 */
export function normalizeMessengerMedia(value: unknown): {kind: MessengerOutboundMediaKind; url: string} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MessengerMediaError('media must be an object')
  }
  const record = value as Record<string, unknown>
  const kind = typeof record.kind === 'string' ? record.kind : ''
  if (!MESSENGER_KINDS.has(kind)) {
    throw new MessengerMediaError('media.kind must be one of image, audio, video, document')
  }
  if (typeof record.id === 'string' || typeof record.attachmentId === 'string') {
    throw new MessengerMediaError('Messenger media requires a public https link (no media id upload)')
  }
  const rawLink = record.link
  if (typeof rawLink !== 'string') throw new MessengerMediaError('media.link is required')
  let url: URL
  try {
    url = new URL(rawLink)
  } catch {
    throw new MessengerMediaError('media.link must be a valid URL')
  }
  if (url.protocol !== 'https:') throw new MessengerMediaError('media.link must use https')
  if (url.username || url.password) throw new MessengerMediaError('media.link must not carry credentials')
  if (isPrivateHost(url.hostname)) throw new MessengerMediaError('media.link must be a public host')
  return {kind: (kind === 'document' ? 'file' : kind) as MessengerOutboundMediaKind, url: url.toString()}
}

export function buildMessengerMediaPayload(
  psid: string,
  media: {kind: MessengerOutboundMediaKind; url: string},
): Record<string, unknown> {
  return {
    recipient: {id: psid},
    messaging_type: 'RESPONSE',
    message: {attachment: {type: media.kind, payload: {url: media.url, is_reusable: false}}},
  }
}

export function buildMessengerTextPayload(psid: string, text: string): Record<string, unknown> {
  return {
    recipient: {id: psid},
    messaging_type: 'RESPONSE',
    message: {text},
  }
}
