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
  parseMetaEvents,
  parseSingleMessage,
  parseSingleStatus,
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
        channelPayload: {...event.raw, _meta: event.media ? {media: event.media} : undefined},
        channelContentType: described.contentType,
        channelMetadata: {providerKey: WHATSAPP_PROVIDER_KEY, type: event.type},
      }
    },

    async convertOutbound(input) {
      // Media/template conversion is a later slice (ADR-005 G3/G4); the adapter
      // refuses to pretend otherwise by sending only the text body.
      return {content: {text: input.body, bodyFormat: 'text'}}
    },

    async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
      const credentials = readCredentials(input.credentials)
      if (!credentials.accessToken || !credentials.phoneNumberId) {
        return {externalMessageId: '', status: 'failed', error: 'WHATSAPP_CREDENTIALS_MISSING'}
      }
      const to = typeof input.metadata?.to === 'string' ? (input.metadata.to as string) : ''
      if (!to) return {externalMessageId: '', status: 'failed', error: 'WHATSAPP_RECIPIENT_REQUIRED'}
      const template = input.metadata?.template as MetaTemplate | undefined
      const body = template
        ? buildTemplatePayload(to, template)
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
          return {
            externalMessageId: '',
            status: 'failed',
            error: `${error.code}: ${error.message}`,
            metadata: {transient: error.transient, httpStatus: error.status},
          }
        }
        return {externalMessageId: '', status: 'failed', error: 'WHATSAPP_SEND_FAILED', metadata: {transient: true}}
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
      return Object.keys(errors).length ? {ok: false, errors} : {ok: true}
    },
  }
}
