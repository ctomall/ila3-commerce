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

export function buildMessengerTextPayload(psid: string, text: string): Record<string, unknown> {
  return {
    recipient: {id: psid},
    messaging_type: 'RESPONSE',
    message: {text},
  }
}
