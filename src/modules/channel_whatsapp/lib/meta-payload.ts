/**
 * WhatsApp Cloud API payload helpers.
 *
 * Pure parsing/normalisation: no network, no database. The adapter and its
 * future dedicated webhook route both use these so that message and status
 * handling stay identical to what the tests exercise.
 */

export type MetaMedia = {
  id: string
  mimeType?: string
  fileName?: string
  caption?: string
}

export type MetaMessageEvent = {
  externalMessageId: string
  from: string
  timestamp: Date
  type: string
  text?: string
  media?: MetaMedia
  raw: Record<string, unknown>
}

export type MetaStatusEvent = {
  externalMessageId: string
  recipientId: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: Date
  errors?: Array<{ code?: number; title?: string; message?: string }>
  raw: Record<string, unknown>
}

type MetaChange = {
  field?: string
  value?: {
    messaging_product?: string
    metadata?: { phone_number_id?: string; display_phone_number?: string }
    contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>
    messages?: Array<Record<string, unknown>>
    statuses?: Array<Record<string, unknown>>
  }
}

function timestampToDate(value: unknown): Date {
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000)
  return new Date()
}

function readMedia(message: Record<string, unknown>, type: string): MetaMedia | undefined {
  const node = message[type]
  if (!node || typeof node !== 'object') return undefined
  const media = node as Record<string, unknown>
  const id = typeof media.id === 'string' ? media.id : ''
  if (!id) return undefined
  return {
    id,
    mimeType: typeof media.mime_type === 'string' ? media.mime_type : undefined,
    fileName: typeof media.filename === 'string' ? media.filename : undefined,
    caption: typeof media.caption === 'string' ? media.caption : undefined,
  }
}

const MEDIA_TYPES = new Set(['image', 'audio', 'video', 'document', 'sticker'])

/**
 * Distinct provider account ids (`value.metadata.phone_number_id`) carried by a
 * webhook body. The HMAC proves the Meta APP, not the phone number; this is the
 * only field that says which connected account the event belongs to. Returns
 * every distinct id so a mixed payload can be rejected rather than misrouted.
 */
export function readWhatsAppAccountIds(payload: unknown): string[] {
  const root = payload as
    | { entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: unknown } } }> }> }
    | null
  const ids = new Set<string>()
  for (const entry of root?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const id = change?.value?.metadata?.phone_number_id
      if (typeof id === 'string' && id.length > 0) ids.add(id)
    }
  }
  return [...ids]
}

/** Split one webhook body into message and status events (may contain both). */
export function parseMetaEvents(payload: unknown): { messages: MetaMessageEvent[]; statuses: MetaStatusEvent[] } {  const messages: MetaMessageEvent[] = []
  const statuses: MetaStatusEvent[] = []
  const root = payload as { entry?: Array<{ changes?: MetaChange[] }> } | null
  for (const entry of root?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change?.value
      if (!value) continue
      for (const raw of value.messages ?? []) {
        const type = typeof raw.type === 'string' ? raw.type : 'unknown'
        const event: MetaMessageEvent = {
          externalMessageId: typeof raw.id === 'string' ? raw.id : '',
          from: typeof raw.from === 'string' ? raw.from : '',
          timestamp: timestampToDate(raw.timestamp),
          type,
          raw,
        }
        if (type === 'text' && raw.text && typeof raw.text === 'object') {
          const text = (raw.text as Record<string, unknown>).body
          if (typeof text === 'string') event.text = text
        }
        if (type === 'button' && raw.button && typeof raw.button === 'object') {
          const text = (raw.button as Record<string, unknown>).text
          if (typeof text === 'string') event.text = text
        }
        if (type === 'interactive' && raw.interactive && typeof raw.interactive === 'object') {
          const interactive = raw.interactive as Record<string, unknown>
          const reply = interactive.button_reply ?? interactive.list_reply
          if (reply && typeof reply === 'object' && typeof (reply as Record<string, unknown>).title === 'string') {
            event.text = (reply as Record<string, unknown>).title as string
          }
        }
        if (MEDIA_TYPES.has(type)) event.media = readMedia(raw, type)
        if (event.externalMessageId && event.from) messages.push(event)
      }
      for (const raw of value.statuses ?? []) {
        const status = typeof raw.status === 'string' ? raw.status : ''
        if (!['sent', 'delivered', 'read', 'failed'].includes(status)) continue
        statuses.push({
          externalMessageId: typeof raw.id === 'string' ? raw.id : '',
          recipientId: typeof raw.recipient_id === 'string' ? raw.recipient_id : '',
          status: status as MetaStatusEvent['status'],
          timestamp: timestampToDate(raw.timestamp),
          errors: Array.isArray(raw.errors)
            ? (raw.errors as Array<Record<string, unknown>>).map((error) => ({
                code: typeof error.code === 'number' ? error.code : undefined,
                title: typeof error.title === 'string' ? error.title : undefined,
                message: typeof error.message === 'string' ? error.message : undefined,
              }))
            : undefined,
          raw,
        })
      }
    }
  }
  return {messages, statuses}
}

/** Human-readable body for a normalized inbound message. */
export function describeInbound(event: MetaMessageEvent): { body: string; contentType: string } {
  if (event.text) return {body: event.text, contentType: 'text/plain'}
  if (event.media) {
    const label = `[${event.type}${event.media.fileName ? `: ${event.media.fileName}` : ''}]`
    return {body: event.media.caption ? `${label} ${event.media.caption}` : label, contentType: event.media.mimeType ?? 'application/octet-stream'}
  }
  return {body: `[${event.type}]`, contentType: 'text/plain'}
}

export function buildTextPayload(to: string, text: string): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: {preview_url: false, body: text},
  }
}

export type MetaOutboundMediaKind = 'image' | 'audio' | 'video' | 'document'

export type MetaOutboundMedia = {
  kind: MetaOutboundMediaKind
  id?: string
  link?: string
  fileName?: string
  caption?: string
}

export class MetaMediaError extends Error {
  readonly code = 'WHATSAPP_MEDIA_INVALID'
  constructor(message: string) {
    super(message)
    this.name = 'MetaMediaError'
  }
}

const MEDIA_KINDS = new Set(['image', 'audio', 'video', 'document'])

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!ipv4) return false
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
  return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

/**
 * Validate the caller-supplied outbound media descriptor.
 *
 * Meta accepts either an already-uploaded media id or a public https link it
 * fetches itself. Exactly one is allowed: sending both is ambiguous, and a
 * provider that picks one silently is a delivery bug waiting for a review. A
 * private/loopback link is refused here because this platform would otherwise
 * ask Meta to fetch an internal address on our behalf.
 */
export function normalizeOutboundMedia(value: unknown): MetaOutboundMedia {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MetaMediaError('media must be an object')
  }
  const record = value as Record<string, unknown>
  const kind = record.kind
  if (typeof kind !== 'string' || !MEDIA_KINDS.has(kind)) {
    throw new MetaMediaError('media.kind must be one of image, audio, video, document')
  }
  const id = typeof record.id === 'string' ? record.id.trim() : undefined
  const link = typeof record.link === 'string' ? record.link.trim() : undefined
  if ((id && link) || (!id && !link)) {
    throw new MetaMediaError('media must carry exactly one of id or link')
  }
  if (id && !/^\d{1,64}$/.test(id)) {
    throw new MetaMediaError('media.id must be the numeric provider media id')
  }
  if (link) {
    let url: URL
    try {
      url = new URL(link)
    } catch {
      throw new MetaMediaError('media.link must be a valid URL')
    }
    if (url.protocol !== 'https:') throw new MetaMediaError('media.link must use https')
    if (url.username || url.password) throw new MetaMediaError('media.link must not carry credentials')
    if (isPrivateHostname(url.hostname)) throw new MetaMediaError('media.link must be a public host')
  }
  const caption = typeof record.caption === 'string' ? record.caption : undefined
  if (caption && caption.length > 1024) throw new MetaMediaError('media.caption exceeds 1024 characters')
  if (caption && kind === 'audio') throw new MetaMediaError('audio messages do not support a caption')
  const fileName = typeof record.fileName === 'string' ? record.fileName.trim() : undefined
  const safeFileName = fileName
    ? fileName.split(/[\\/]/).pop()?.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 96)
    : undefined
  return {
    kind: kind as MetaOutboundMediaKind,
    ...(id ? {id} : {}),
    ...(link ? {link} : {}),
    ...(safeFileName ? {fileName: safeFileName} : {}),
    ...(caption ? {caption} : {}),
  }
}

export function buildMediaPayload(to: string, media: MetaOutboundMedia): Record<string, unknown> {
  const object: Record<string, unknown> = media.id ? {id: media.id} : {link: media.link}
  if (media.kind === 'document' && media.fileName) object.filename = media.fileName
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: media.kind,
    [media.kind]: object,
    ...(media.caption ? {caption: media.caption} : {}),
  }
}

export type MetaTemplate = {name: string; language: string; components?: unknown[]}

/**
 * Template payload validation (ADR-005 G4).
 *
 * The BFF accepts a caller-supplied template and the hub stores it on the link
 * verbatim, so by the time the adapter builds a Graph request the only thing
 * standing between a typo and a provider 400 is this function. Validating here
 * turns "Meta rejected it with code 132000" into a local, actionable failure
 * before any network call — and it never guesses: an unknown component type or
 * a parameter without its required field is refused, not coerced.
 */
export class MetaTemplateError extends Error {
  readonly code = 'WHATSAPP_TEMPLATE_INVALID'
  constructor(message: string) {
    super(message)
    this.name = 'MetaTemplateError'
  }
}

const TEMPLATE_COMPONENT_TYPES = new Set(['header', 'body', 'button'])
const TEMPLATE_PARAMETER_TYPES = new Set([
  'text',
  'image',
  'document',
  'video',
  'location',
  'currency',
  'date_time',
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function normalizeTemplate(value: unknown): MetaTemplate {
  const template = asRecord(value)
  if (!template) throw new MetaTemplateError('template must be an object')
  const name = template.name
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 512) {
    throw new MetaTemplateError('template.name is required (max 512 characters)')
  }
  const language = template.language
  if (typeof language !== 'string' || language.trim().length === 0 || language.length > 32) {
    throw new MetaTemplateError('template.language is required (max 32 characters)')
  }
  const rawComponents = template.components
  if (rawComponents === undefined) return {name, language}
  if (!Array.isArray(rawComponents) || rawComponents.length > 20) {
    throw new MetaTemplateError('template.components must be an array of at most 20 entries')
  }
  const components = rawComponents.map((entry, index) => {
    const component = asRecord(entry)
    if (!component) throw new MetaTemplateError(`components[${index}] must be an object`)
    const type = component.type
    if (typeof type !== 'string' || !TEMPLATE_COMPONENT_TYPES.has(type)) {
      throw new MetaTemplateError(
        `components[${index}].type must be one of header, body, button (got ${String(type)})`,
      )
    }
    const rawParameters = component.parameters
    if (rawParameters === undefined) return {type}
    if (!Array.isArray(rawParameters) || rawParameters.length > 10) {
      throw new MetaTemplateError(`components[${index}].parameters must be an array of at most 10 entries`)
    }
    const parameters = rawParameters.map((param, paramIndex) => {
      const record = asRecord(param)
      if (!record) throw new MetaTemplateError(`components[${index}].parameters[${paramIndex}] must be an object`)
      const paramType = record.type
      if (typeof paramType !== 'string' || !TEMPLATE_PARAMETER_TYPES.has(paramType)) {
        throw new MetaTemplateError(
          `components[${index}].parameters[${paramIndex}].type is not a supported parameter type`,
        )
      }
      if (paramType === 'text') {
        if (typeof record.text !== 'string' || record.text.length === 0) {
          throw new MetaTemplateError(
            `components[${index}].parameters[${paramIndex}].text is required for a text parameter`,
          )
        }
        return {type: paramType, text: record.text}
      }
      // Non-text parameters carry their media/location object; forward it as-is
      // after asserting it is an object, so a malformed payload fails here.
      const payload = record[paramType]
      if (!asRecord(payload)) {
        throw new MetaTemplateError(
          `components[${index}].parameters[${paramIndex}].${paramType} must be an object`,
        )
      }
      return {type: paramType, [paramType]: payload}
    })
    return {type, parameters}
  })
  return {name, language, components}
}

export function buildTemplatePayload(to: string, template: MetaTemplate): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: template.name,
      language: {code: template.language},
      ...(template.components ? {components: template.components} : {}),
    },
  }
}


/** Parse one raw message object (the shape stored on InboundMessage.raw). */
export function parseSingleMessage(raw: Record<string, unknown>): MetaMessageEvent | null {
  const wrapped = {entry: [{changes: [{value: {messages: [raw]}}]}]}
  const parsed = parseMetaEvents(wrapped)
  return parsed.messages[0] ?? null
}

/** Parse one raw status object. */
export function parseSingleStatus(raw: Record<string, unknown>): MetaStatusEvent | null {
  const wrapped = {entry: [{changes: [{value: {statuses: [raw]}}]}]}
  const parsed = parseMetaEvents(wrapped)
  return parsed.statuses[0] ?? null
}
