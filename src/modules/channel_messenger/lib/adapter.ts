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
import {verifyMetaSignature} from '../../channel_whatsapp/lib/meta-signature'
import {MetaGraphError, sendWhatsAppMessage} from '../../channel_whatsapp/lib/graph-client'
import {
  buildMessengerTextPayload,
  describeMessengerMessage,
  parseMessengerEvents,
  type MessengerMessage,
} from './messenger-payload'

export const MESSENGER_PROVIDER_KEY = 'messenger'

export type MessengerCredentials = {
  pageAccessToken?: string
  pageId?: string
  appSecret?: string
  graphBaseUrl?: string
}

const CAPABILITIES: ChannelCapabilities = {
  threading: true,
  richText: false,
  fileSharing: true,
  readReceipts: true,
  // Messenger does not deliver per-message delivered/read webhooks with a
  // message id; it emits a `read` watermark per conversation. Declaring delivery
  // receipts would make the UI promise a status the platform never sends.
  deliveryReceipts: false,
  typingIndicators: false,
  reactions: false,
  multiReactionPerUser: false,
  editMessage: false,
  deleteMessage: false,
  presence: false,
  richBlocks: false,
  interactiveComponents: false,
  inlineImages: true,
  conversationHistory: false,
  contactCards: false,
  locationSharing: false,
  voiceNotes: true,
  stickers: false,
  supportedBodyFormats: ['text'],
  maxBodyLength: 2000,
  realtimePush: true,
  recipientFormat: 'provider-native',
}

function readCredentials(value: Record<string, unknown> | undefined): MessengerCredentials {
  const credentials = (value ?? {}) as Record<string, unknown>
  const pick = (key: string) => (typeof credentials[key] === 'string' ? (credentials[key] as string) : undefined)
  return {
    pageAccessToken: pick('pageAccessToken'),
    pageId: pick('pageId'),
    appSecret: pick('appSecret'),
    graphBaseUrl: pick('graphBaseUrl'),
  }
}

function firstMessage(raw: Record<string, unknown>): MessengerMessage | null {
  const wrapped = {entry: [{messaging: [raw]}]}
  return parseMessengerEvents(wrapped).messages[0] ?? null
}

export type MessengerAdapterOptions = {fetchImpl?: typeof fetch}

export function createMessengerAdapter(options: MessengerAdapterOptions = {}): ChannelAdapter {
  return {
    providerKey: MESSENGER_PROVIDER_KEY,
    channelType: 'messenger',
    channelScope: 'tenant',
    capabilities: CAPABILITIES,

    async verifyWebhook(input: VerifyWebhookInput): Promise<InboundMessage> {
      const credentials = readCredentials(input.credentials)
      if (!verifyMetaSignature(input.rawBody, input.headers['x-hub-signature-256'], credentials.appSecret ?? '')) {
        throw new Error('Messenger webhook signature verification failed')
      }
      let payload: unknown
      try {
        payload = typeof input.rawBody === 'string' ? JSON.parse(input.rawBody) : JSON.parse(input.rawBody.toString('utf8'))
      } catch {
        throw new Error('Messenger webhook body is not JSON')
      }
      const {messages, reads} = parseMessengerEvents(payload)
      if (messages[0]) return {raw: messages[0].raw, eventType: 'message'}
      if (reads[0]) return {raw: reads[0].raw, eventType: 'status_update'}
      return {raw: {}, eventType: 'other'}
    },

    async normalizeInbound(raw: InboundMessage): Promise<NormalizedInboundMessage> {
      const message = firstMessage(raw.raw)
      if (!message) throw new Error('Messenger inbound payload has no message')
      const described = describeMessengerMessage(message)
      return {
        externalMessageId: message.mid,
        externalConversationId: message.psid,
        senderIdentifier: message.psid,
        body: described.body,
        bodyFormat: 'text',
        timestamp: message.timestamp,
        channelPayload: message.raw,
        channelContentType: described.contentType,
        channelMetadata: {providerKey: MESSENGER_PROVIDER_KEY, type: message.attachments[0]?.type ?? 'text'},
      }
    },

    async convertOutbound(input) {
      return {content: {text: input.body, bodyFormat: 'text'}}
    },

    async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
      const credentials = readCredentials(input.credentials)
      if (!credentials.pageAccessToken || !credentials.pageId) {
        return {externalMessageId: '', status: 'failed', error: 'MESSENGER_CREDENTIALS_MISSING'}
      }
      const metadata = (input.metadata ?? {}) as Record<string, unknown>
      const explicitTo = typeof metadata.to === 'string' ? metadata.to : ''
      const threadRef = typeof metadata.thread_id === 'string' ? metadata.thread_id : ''
      const threadTo = threadRef && !threadRef.startsWith('outbound:') && !threadRef.includes(':') ? threadRef : ''
      const psid = explicitTo || threadTo
      if (!psid) return {externalMessageId: '', status: 'failed', error: 'MESSENGER_RECIPIENT_REQUIRED'}
      try {
        const result = await sendWhatsAppMessage({
          baseUrl: credentials.graphBaseUrl,
          phoneNumberId: credentials.pageId,
          accessToken: credentials.pageAccessToken,
          body: buildMessengerTextPayload(psid, input.content.text ?? ''),
          fetchImpl: options.fetchImpl,
        })
        return {externalMessageId: result.externalMessageId, status: 'sent'}
      } catch (error) {
        if (error instanceof MetaGraphError) throw error
        throw new Error('MESSENGER_SEND_FAILED')
      }
    },

    async getStatus(): Promise<MessageStatus> {
      // Read receipts arrive as `read` webhook events; no pollable status.
      throw new Error('MESSENGER_STATUS_WEBHOOK_ONLY')
    },

    async validateCredentials(input) {
      const credentials = readCredentials(input.credentials)
      const errors: Record<string, string> = {}
      if (!credentials.pageAccessToken) errors.pageAccessToken = 'required'
      if (!credentials.pageId) errors.pageId = 'required'
      if (!credentials.appSecret) errors.appSecret = 'required for webhook verification'
      return Object.keys(errors).length ? {ok: false, errors} : {ok: true}
    },
  }
}
