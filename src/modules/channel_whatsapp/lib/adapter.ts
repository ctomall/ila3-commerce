import type {
  ChannelAdapter,
  ChannelCapabilities,
  InboundMessage,
  MessageStatus,
  NormalizedInboundMessage,
  SendMessageInput,
  SendMessageResult,
  VerifyWebhookInput,
} from '@open-mercato/core/modules/communication_channels/lib/adapter'
import {verifyMetaSignature} from './meta-signature'
import {
  buildTemplatePayload,
  buildTextPayload,
  describeInbound,
  normalizeTemplate,
  parseMetaEvents,
  parseSingleMessage,
  parseSingleStatus,
  buildMediaPayload,
  normalizeOutboundMedia,
  MetaMediaError,
  MetaTemplateError,
  type MetaOutboundMedia,
  type MetaTemplate,
} from './meta-payload'
import {MetaGraphError, sendWhatsAppMessage} from './graph-client'

export const WHATSAPP_PROVIDER_KEY = 'whatsapp-business'

export type MetaCredentials = {
  appSecret?: string
  accessToken?: string
  phoneNumberId?: string
  graphBaseUrl?: string
}

const CAPABILITIES: ChannelCapabilities = {
  threading: true,
  richText: false,
  fileSharing: true,
  readReceipts: true,
  deliveryReceipts: true,
  typingIndicators: false,
  reactions: false,
  multiReactionPerUser: false,
  editMessage: false,
  deleteMessage: false,
  presence: false,
  richBlocks: false,
  interactiveComponents: true,
  inlineImages: true,
  conversationHistory: false,
  contactCards: false,
  locationSharing: false,
  voiceNotes: true,
  stickers: true,
  supportedBodyFormats: ['text'],
  maxBodyLength: 4096,
  realtimePush: true,
  recipientFormat: 'provider-native',
}

function readCredentials(value: Record<string, unknown> | undefined): MetaCredentials {
  const credentials = (value ?? {}) as Record<string, unknown>
  return {
    appSecret: typeof credentials.appSecret === 'string' ? credentials.appSecret : undefined,
    accessToken: typeof credentials.accessToken === 'string' ? credentials.accessToken : undefined,
    phoneNumberId: typeof credentials.phoneNumberId === 'string' ? credentials.phoneNumberId : undefined,
    graphBaseUrl: typeof credentials.graphBaseUrl === 'string' ? credentials.graphBaseUrl : undefined,
  }
}

export type WhatsAppAdapterOptions = {
  fetchImpl?: typeof fetch
}

export function createWhatsAppAdapter(options: WhatsAppAdapterOptions = {}): ChannelAdapter {
  return {
    providerKey: WHATSAPP_PROVIDER_KEY,
    channelType: 'whatsapp',
    channelScope: 'tenant',
    capabilities: CAPABILITIES,

    async verifyWebhook(input: VerifyWebhookInput): Promise<InboundMessage> {
      const credentials = readCredentials(input.credentials)
      // Fail closed: the generic route treats a normal return as "verified".
      if (!verifyMetaSignature(input.rawBody, input.headers['x-hub-signature-256'], credentials.appSecret ?? '')) {
        throw new Error('WhatsApp webhook signature verification failed')
      }
      let payload: unknown
      try {
        payload = typeof input.rawBody === 'string' ? JSON.parse(input.rawBody) : JSON.parse(input.rawBody.toString('utf8'))
      } catch {
        throw new Error('WhatsApp webhook body is not JSON')
      }
      const {messages, statuses} = parseMetaEvents(payload)
      if (messages[0]) return {raw: messages[0].raw, eventType: 'message'}
      if (statuses[0]) return {raw: statuses[0].raw, eventType: 'status_update'}
      return {raw: {}, eventType: 'other'}
    },

    async normalizeInbound(raw: InboundMessage): Promise<NormalizedInboundMessage> {
      const event = parseSingleMessage(raw.raw)
      if (!event) throw new Error('WhatsApp inbound payload has no message')
      const described = describeInbound(event)
      return {
        externalMessageId: event.externalMessageId,
        externalConversationId: event.from,
        senderIdentifier: event.from,
        body: described.body,
        bodyFormat: 'text',
        timestamp: event.timestamp,
        channelPayload: {
          ...event.raw,
          // `kind` is the Meta message type (image/audio/…): the CRM labels the
          // attachment from it instead of guessing from the MIME type.
          _meta: event.media ? {media: {...event.media, kind: event.type}} : undefined,
        },
        channelContentType: described.contentType,
        channelMetadata: {providerKey: WHATSAPP_PROVIDER_KEY, type: event.type},
      }
    },

    async convertOutbound(input) {
      // Media conversion is a later slice (ADR-005 G3); template intent is
      // carried through (G4) and validated in sendMessage before any request.
      //
      // The hub hands the recipient and any template intent through
      // `channelMetadata` (send-as-user stores them on the link, deliver-outbound
      // re-injects `to` for provider-native adapters). They must survive into
      // `metadata`, because that is what the hub passes to sendMessage — dropping
      // them here is exactly the G7 shape where a chat send has no addressee.
      const channelMetadata = (input.channelMetadata ?? {}) as Record<string, unknown>
      return {
        content: {text: input.body, bodyFormat: 'text'},
        metadata: {
          ...(typeof channelMetadata.to === 'string' ? {to: channelMetadata.to} : {}),
          ...(channelMetadata.template ? {template: channelMetadata.template} : {}),
          ...(channelMetadata.media ? {media: channelMetadata.media} : {}),
        },
      }
    },

    async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
      const credentials = readCredentials(input.credentials)
      if (!credentials.accessToken || !credentials.phoneNumberId) {
        return {externalMessageId: '', status: 'failed', error: 'WHATSAPP_CREDENTIALS_MISSING'}
      }
      // The hub passes `metadata.to` only when the adapter declared
      // provider-native recipients; for a reply into an inbound thread it passes
      // the thread ref, which IS the customer wa_id. A brand-new outbound thread
      // is ref'd as `outbound:<uuid>` and carries no recipient — refuse instead
      // of guessing (ADR-005 G7).
      const metadata = (input.metadata ?? {}) as Record<string, unknown>
      const explicitTo = typeof metadata.to === 'string' ? metadata.to : ''
      const threadRef = typeof metadata.thread_id === 'string' ? metadata.thread_id : ''
      const threadTo = threadRef && !threadRef.startsWith('outbound:') && !threadRef.includes(':') ? threadRef : ''
      const to = explicitTo || threadTo
      if (!to) return {externalMessageId: '', status: 'failed', error: 'WHATSAPP_RECIPIENT_REQUIRED'}
      // A template is validated before it reaches the network: the hub stores
      // the caller's object verbatim, and Graph answers a malformed template
      // with a 400 that tells the operator nothing actionable.
      let template: MetaTemplate | undefined
      if (input.metadata?.template !== undefined) {
        try {
          template = normalizeTemplate(input.metadata.template)
        } catch (error) {
          if (error instanceof MetaTemplateError) {
            return {externalMessageId: '', status: 'failed', error: error.message}
          }
          throw error
        }
      }
      // Media (G3 outbound): the caller supplies an already-uploaded provider
      // media id or a public https link; validate before any request so a typo
      // or an internal address never reaches Graph.
      let outboundMedia: MetaOutboundMedia | undefined
      if (!template && input.metadata?.media !== undefined) {
        try {
          outboundMedia = normalizeOutboundMedia(input.metadata.media)
        } catch (error) {
          if (error instanceof MetaMediaError) {
            return {externalMessageId: '', status: 'failed', error: error.message}
          }
          throw error
        }
      }
      if (outboundMedia) {
        const text = (input.content.text ?? '').trim()
        const caption =
          outboundMedia.caption ?? (outboundMedia.kind !== 'audio' && text.length > 0 ? text : undefined)
        outboundMedia = caption ? {...outboundMedia, caption} : outboundMedia
      }
      const body = template
        ? buildTemplatePayload(to, template)
        : outboundMedia
          ? buildMediaPayload(to, outboundMedia)
          : buildTextPayload(to, input.content.text ?? '')
      try {
        const result = await sendWhatsAppMessage({
          baseUrl: credentials.graphBaseUrl,
          phoneNumberId: credentials.phoneNumberId,
          accessToken: credentials.accessToken,
          body,
          fetchImpl: options.fetchImpl,
        })
        return {externalMessageId: result.externalMessageId, status: 'sent'}
      } catch (error) {
        if (error instanceof MetaGraphError) {
          // Throw so the hub's classifyOutboundError sees the explicit
          // transient/status hint; a returned `failed` result is re-thrown as a
          // plain Error and loses that classification.
          throw error
        }
        // Preserve the transport error: the hub's unknown-outcome classifier
        // needs the network cause (`fetch failed`, ECONNRESET, UND_ERR_SOCKET)
        // to tell a definitive provider rejection from an unresolved send.
        const wrapped = new Error('WHATSAPP_SEND_FAILED')
        ;(wrapped as Error & {cause?: unknown}).cause = error
        throw wrapped
      }
    },

    async getStatus(): Promise<MessageStatus> {
      // Delivery receipts arrive as webhook status events; there is no pollable
      // status API for Cloud API messages.
      throw new Error('WHATSAPP_STATUS_WEBHOOK_ONLY')
    },

    async validateCredentials(input) {
      const credentials = readCredentials(input.credentials)
      const errors: Record<string, string> = {}
      if (!credentials.accessToken) errors.accessToken = 'required'
      if (!credentials.phoneNumberId) errors.phoneNumberId = 'required'
      if (!credentials.appSecret) errors.appSecret = 'required for webhook verification'
      if (Object.keys(errors).length) return {ok: false, errors}
      // Pin the connected account. The hub's connect command stores this as
      // `CommunicationChannel.externalIdentifier`, which the webhook route uses
      // to compare the payload's `metadata.phone_number_id` — the HMAC alone
      // only proves the Meta app, not which phone number the event belongs to.
      return {ok: true, externalIdentifier: credentials.phoneNumberId}
    },
  }
}
