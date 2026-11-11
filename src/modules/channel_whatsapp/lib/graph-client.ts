/**
 * Minimal WhatsApp Cloud API client.
 *
 * `fetchImpl` and `baseUrl` are injectable so tests can assert the exact Graph
 * request without network access, and so a drill can point at a local fake.
 * Error classification is explicit: 429/5xx are transient (the hub's outbound
 * worker retries them), everything else is a permanent refusal.
 */
export class MetaGraphError extends Error {
  /** Classification status the hub reads: reauth codes are reported as 401. */
  readonly status: number
  /** Raw Graph HTTP status, kept for logs. */
  readonly httpStatus: number
  readonly code: string
  readonly transient: boolean
  readonly reauth: boolean

  constructor(status: number, code: string, message: string, transient: boolean, reauth = false) {
    super(reauth ? `requires_reauth: ${message}` : message)
    this.name = 'MetaGraphError'
    this.httpStatus = status
    this.status = reauth ? 401 : status
    this.code = code
    this.transient = transient
    this.reauth = reauth
  }
}

/**
 * Graph auth failures that mean the stored token is dead. WhatsApp/Messenger
 * return these as HTTP 400 with a body code, so the hub's `isReauthError` (which
 * keys on status 401 or `requires_reauth`) would otherwise treat them as a
 * permanent validation error and never prompt the operator to reconnect.
 */
const REAUTH_CODES = new Set(['190', '102', '463', '467'])

export type GraphMediaUploadInput = {
  baseUrl?: string
  phoneNumberId: string
  accessToken: string
  buffer: Buffer
  mimeType: string
  fileName: string
  fetchImpl?: typeof fetch
}

export const GRAPH_MEDIA_MAX_BYTES = 16 * 1024 * 1024

/**
 * Bounded Graph calls.
 *
 * A hung upload blocks the staff member's send request (the BFF uploads the
 * attachment before it accepts), and a hung message send pins a worker job until
 * the queue lock expires. Uploads are bounded and surfaced as a transient error
 * the caller can retry; a send timeout must stay a RAW abort so the hub's
 * unknown-outcome classifier sees a transport failure and never blind-retries.
 */
export const GRAPH_UPLOAD_TIMEOUT_MS = 60_000
export const GRAPH_SEND_TIMEOUT_MS = 30_000

/**
 * Upload bytes to the WhatsApp Cloud API media store and return the media id.
 *
 * This is the bridge between a CRM attachment (bytes in our storage) and the
 * provider-native payload the adapter can address by id — Meta has no "send this
 * URL on my behalf from a private host" mode, so the bytes must go up first.
 *
 * The ceiling mirrors Meta's documented 16 MB media limit; checking locally turns
 * a provider 413 into an actionable 413 the BFF can explain.
 */
export async function uploadWhatsAppMedia(input: GraphMediaUploadInput): Promise<{mediaId: string}> {
  if (input.buffer.byteLength === 0) throw new MetaGraphError(400, 'EMPTY_MEDIA', 'media file is empty', false)
  if (input.buffer.byteLength > GRAPH_MEDIA_MAX_BYTES) {
    throw new MetaGraphError(
      413,
      'MEDIA_TOO_LARGE',
      `media is ${input.buffer.byteLength} bytes, over the ${GRAPH_MEDIA_MAX_BYTES}-byte limit`,
      false,
    )
  }
  const base = (input.baseUrl || defaultBase()).replace(/\/$/, '')
  const doFetch = input.fetchImpl ?? fetch
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', input.mimeType)
  form.append('file', new Blob([new Uint8Array(input.buffer)], {type: input.mimeType}), input.fileName)
  let response: Response
  try {
    response = await doFetch(`${base}/${encodeURIComponent(input.phoneNumberId)}/media`, {
      method: 'POST',
      headers: {authorization: `Bearer ${input.accessToken}`},
      body: form,
      signal: AbortSignal.timeout(GRAPH_UPLOAD_TIMEOUT_MS),
    })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new MetaGraphError(504, 'GRAPH_UPLOAD_TIMEOUT', `media upload timed out after ${GRAPH_UPLOAD_TIMEOUT_MS}ms`, true)
    }
    throw error
  }
  const text = await response.text()
  let parsed: Record<string, unknown> = {}
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    parsed = {}
  }
  if (!response.ok) {
    const errorNode = (parsed.error ?? {}) as Record<string, unknown>
    const code = String(errorNode.code ?? errorNode.type ?? `HTTP_${response.status}`)
    const message = String(errorNode.message ?? text.slice(0, 200) ?? 'media upload failed')
    const reauth = response.status === 401 || REAUTH_CODES.has(code)
    const transient = !reauth && (response.status === 429 || response.status >= 500)
    throw new MetaGraphError(response.status, code, message, transient, reauth)
  }
  const mediaId = parsed.id
  if (typeof mediaId !== 'string' || mediaId.length === 0) {
    throw new MetaGraphError(502, 'NO_MEDIA_ID', 'media upload returned no id', true)
  }
  return {mediaId}
}

export type GraphSendResult = {externalMessageId: string}

export type SendGraphInput = {
  baseUrl?: string
  phoneNumberId: string
  accessToken: string
  body: Record<string, unknown>
  fetchImpl?: typeof fetch
}

function defaultBase(): string {
  return process.env.META_GRAPH_BASE_URL || 'https://graph.facebook.com/v21.0'
}

export async function sendWhatsAppMessage(input: SendGraphInput): Promise<GraphSendResult> {
  const base = (input.baseUrl || defaultBase()).replace(/\/$/, '')
  const url = `${base}/${encodeURIComponent(input.phoneNumberId)}/messages`
  const doFetch = input.fetchImpl ?? fetch
  // No catch here on purpose: an aborted send is a transport failure whose
  // outcome is unknown, and the hub classifies it from the raw error. Wrapping it
  // in MetaGraphError (which carries a status) would mark it definitive `failed`
  // and a retry could double-send.
  const response = await doFetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input.body),
    signal: AbortSignal.timeout(GRAPH_SEND_TIMEOUT_MS),
  })
  const text = await response.text()
  let parsed: Record<string, unknown> = {}
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    parsed = {}
  }
  if (!response.ok) {
    const errorNode = (parsed.error ?? {}) as Record<string, unknown>
    const code = String(errorNode.code ?? errorNode.type ?? `HTTP_${response.status}`)
    const message = String(errorNode.message ?? text.slice(0, 200) ?? 'graph request failed')
    const reauth = response.status === 401 || REAUTH_CODES.has(code)
    const transient = !reauth && (response.status === 429 || response.status >= 500 || code === '131056')
    throw new MetaGraphError(response.status, code, message, transient, reauth)
  }
  const messages = parsed.messages as Array<Record<string, unknown>> | undefined
  // WhatsApp Cloud API returns messages[0].id; Messenger returns message_id.
  const id = messages?.[0]?.id ?? parsed.message_id
  if (typeof id !== 'string' || id.length === 0) {
    throw new MetaGraphError(response.status, 'NO_MESSAGE_ID', 'graph response has no message id', false)
  }
  return {externalMessageId: id}
}
