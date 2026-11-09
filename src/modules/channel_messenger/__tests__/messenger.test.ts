import { describe, expect, it } from '@jest/globals'
import crypto from 'node:crypto'
import {buildMessengerTextPayload, describeMessengerMessage, parseMessengerEvents} from '../lib/messenger-payload'
import {createMessengerAdapter} from '../lib/adapter'
import {MetaGraphError} from '../../channel_whatsapp/lib/graph-client'

const SECRET = 'page-secret'

function sign(body: string, secret = SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
}

function textWebhook(text = 'hi', psid = 'psid-1'): string {
  return JSON.stringify({
    object: 'page',
    entry: [{id: 'page-1', time: 1700000000000, messaging: [{sender: {id: psid}, recipient: {id: 'page-1'}, timestamp: 1700000000000, message: {mid: 'mid.1', text}}]}],
  })
}

const credentials = {appSecret: SECRET, pageAccessToken: 'page-token', pageId: 'page-1', graphBaseUrl: 'https://graph.test/v21.0'}

describe('parseMessengerEvents', () => {
  it('parses a text message with psid and page id', () => {
    const {messages, reads} = parseMessengerEvents(JSON.parse(textWebhook('hello', 'psid-9')))
    expect(reads).toHaveLength(0)
    expect(messages[0]).toMatchObject({mid: 'mid.1', psid: 'psid-9', pageId: 'page-1', text: 'hello', attachments: []})
  })

  it('parses attachments with type and url', () => {
    const payload = {entry: [{id: 'page-1', messaging: [{sender: {id: 'p'}, message: {mid: 'mid.2', attachments: [{type: 'image', payload: {url: 'https://cdn.test/x.jpg'}}]}}]}]}
    const {messages} = parseMessengerEvents(payload)
    expect(messages[0].attachments).toEqual([{type: 'image', url: 'https://cdn.test/x.jpg'}])
    expect(describeMessengerMessage(messages[0])).toEqual({body: '[image]', contentType: 'image/*'})
  })

  it('parses postbacks and read watermarks separately', () => {
    const payload = {
      entry: [{id: 'page-1', messaging: [
        {sender: {id: 'p'}, timestamp: 1700000000000, postback: {title: 'Get started', payload: 'START'}},
        {sender: {id: 'p'}, timestamp: 1700000001000, read: {watermark: 1700000000000}},
      ]}],
    }
    const {messages, reads} = parseMessengerEvents(payload)
    expect(messages[0]).toMatchObject({postback: {title: 'Get started', payload: 'START'}})
    expect(describeMessengerMessage(messages[0])).toEqual({body: 'Get started', contentType: 'text/plain'})
    expect(reads[0]).toMatchObject({psid: 'p', watermark: 1700000000000})
  })

  it('ignores entries without a message or postback and missing text', () => {
    const {messages} = parseMessengerEvents({entry: [{id: 'p', messaging: [{sender: {id: 'x'}, delivery: {}}]}]})
    expect(messages).toHaveLength(0)
  })

  it('builds the Messenger send payload with recipient.id', () => {
    expect(buildMessengerTextPayload('psid-1', 'hello')).toEqual({
      recipient: {id: 'psid-1'},
      messaging_type: 'RESPONSE',
      message: {text: 'hello'},
    })
  })
})

describe('messenger adapter', () => {
  const adapter = createMessengerAdapter()
  const scope = {tenantId: 't', organizationId: 'o'}

  it('fails closed on a bad signature', async () => {
    await expect(
      adapter.verifyWebhook({rawBody: textWebhook(), headers: {'x-hub-signature-256': 'sha256=' + '0'.repeat(64)}, credentials, scope}),
    ).rejects.toThrow(/signature/)
  })

  it('verifies a message, a read-only body and an empty body', async () => {
    const body = textWebhook()
    await expect(adapter.verifyWebhook({rawBody: body, headers: {'x-hub-signature-256': sign(body)}, credentials, scope})).resolves.toMatchObject({eventType: 'message'})
    const readBody = JSON.stringify({entry: [{id: 'page-1', messaging: [{sender: {id: 'p'}, read: {watermark: 1}}]}]})
    await expect(adapter.verifyWebhook({rawBody: readBody, headers: {'x-hub-signature-256': sign(readBody)}, credentials, scope})).resolves.toMatchObject({eventType: 'status_update'})
    const empty = JSON.stringify({entry: []})
    await expect(adapter.verifyWebhook({rawBody: empty, headers: {'x-hub-signature-256': sign(empty)}, credentials, scope})).resolves.toMatchObject({eventType: 'other'})
  })

  it('normalizes a message into the hub shape', async () => {
    const {messages} = parseMessengerEvents(JSON.parse(textWebhook('hello', 'psid-9')))
    const normalized = await adapter.normalizeInbound({raw: messages[0].raw, eventType: 'message'})
    expect(normalized).toMatchObject({
      externalMessageId: 'mid.1',
      externalConversationId: 'psid-9',
      senderIdentifier: 'psid-9',
      body: 'hello',
      bodyFormat: 'text',
      channelContentType: 'text/plain',
    })
  })

  it('sends text to the page endpoint and keeps rate limits transient', async () => {
    let captured: {url?: string; body?: unknown} = {}
    const adapterWithFetch = createMessengerAdapter({
      fetchImpl: (async (url: string, init: {body?: string}) => {
        captured = {url: String(url), body: JSON.parse(init.body as string)}
        return new Response(JSON.stringify({message_id: 'mid.1'}), {status: 200})
      }) as unknown as typeof fetch,
    })
    const sent = await adapterWithFetch.sendMessage({content: {text: 'hello'}, credentials, metadata: {to: 'psid-9'}, scope} as never)
    expect(sent).toMatchObject({status: 'sent'})
    expect(captured.url).toBe('https://graph.test/v21.0/page-1/messages')
    expect(captured.body).toEqual({recipient: {id: 'psid-9'}, messaging_type: 'RESPONSE', message: {text: 'hello'}})

    const limited = createMessengerAdapter({
      fetchImpl: (async () => new Response(JSON.stringify({error: {code: 4, message: 'rate limit'}}), {status: 429})) as unknown as typeof fetch,
    })
    await expect(limited.sendMessage({content: {text: 'hi'}, credentials, metadata: {to: 'psid-9'}, scope} as never)).rejects.toBeInstanceOf(MetaGraphError)
  })

  it('refuses a send without credentials or recipient', async () => {
    const noCreds = await adapter.sendMessage({content: {text: 'x'}, credentials: {}, scope} as never)
    expect(noCreds).toMatchObject({status: 'failed', error: 'MESSENGER_CREDENTIALS_MISSING'})
    const noRecipient = await adapter.sendMessage({content: {text: 'x'}, credentials, metadata: {}, scope} as never)
    expect(noRecipient).toMatchObject({status: 'failed', error: 'MESSENGER_RECIPIENT_REQUIRED'})
  })

  it('declares tenant scope, native recipients and no delivery receipts', () => {
    expect(adapter.channelScope).toBe('tenant')
    expect(adapter.capabilities.recipientFormat).toBe('provider-native')
    expect(adapter.capabilities.realtimePush).toBe(true)
    expect(adapter.capabilities.deliveryReceipts).toBe(false)
    expect(adapter.capabilities.supportedBodyFormats).toEqual(['text'])
  })

  it('registers itself with the hub registry', async () => {
    const registry = await import('@open-mercato/core/modules/communication_channels/lib/adapter-registry-singleton')
    await import('../setup')
    expect(registry.hasChannelAdapter('messenger')).toBe(true)
  })
})
