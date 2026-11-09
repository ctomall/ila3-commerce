/**
 * Minimal WhatsApp Cloud API client.
 *
 * `fetchImpl` and `baseUrl` are injectable so tests can assert the exact Graph
 * request without network access, and so a drill can point at a local fake.
 * Error classification is explicit: 429/5xx are transient (the hub's outbound
 * worker retries them), everything else is a permanent refusal.
 */
export class MetaGraphError extends Error {
  readonly status: number
  readonly code: string
  readonly transient: boolean

  constructor(status: number, code: string, message: string, transient: boolean) {
    super(message)
    this.name = 'MetaGraphError'
    this.status = status
    this.code = code
    this.transient = transient
  }
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
  const response = await doFetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input.body),
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
    const transient = response.status === 429 || response.status >= 500 || code === '131056'
    throw new MetaGraphError(response.status, code, message, transient)
  }
  const messages = parsed.messages as Array<Record<string, unknown>> | undefined
  const id = messages?.[0]?.id
  if (typeof id !== 'string' || id.length === 0) {
    throw new MetaGraphError(response.status, 'NO_MESSAGE_ID', 'graph response has no message id', false)
  }
  return {externalMessageId: id}
}
