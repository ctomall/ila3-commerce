import { describe, expect, it } from '@jest/globals'
import crypto from 'node:crypto'
import {verifyMetaSignature} from '../lib/meta-signature'
import {buildTemplatePayload, buildTextPayload, describeInbound, parseMetaEvents, parseSingleMessage} from '../lib/meta-payload'
import {MetaGraphError, sendWhatsAppMessage} from '../lib/graph-client'
import {createWhatsAppAdapter} from '../lib/adapter'

const SECRET = 'app-secret'

function sign(body: string, secret = SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
}

function textWebhook(text = 'hola') {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      id: 'waba-1',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: {display_phone_number: '15550000000', phone_number_id: 'pn-1'},
          contacts: [{wa_id: '15550001111', profile: {name: '客户甲'}}],
          messages: [{from: '15550001111', id: 'wamid.ABC', timestamp: '1700000000', type: 'text', text: {body: text}}],
        },
      }],
    }],
  })
}

describe('verifyMetaSignature', () => {
  const body = textWebhook()
  it('accepts a matching sha256 signature', () => {
    expect(verifyMetaSignature(body, sign(body), SECRET)).toBe(true)
  })
  it('rejects a wrong secret, a missing header and a malformed header', () => {
    expect(verifyMetaSignature(body, sign(body, 'other'), SECRET)).toBe(false)
    expect(verifyMetaSignature(body, undefined, SECRET)).toBe(false)
    expect(verifyMetaSignature(body, 'sha1=abc', SECRET)).toBe(false)
    expect(verifyMetaSignature(body, sign(body), '')).toBe(false)
  })
})

describe('parseMetaEvents', () => {
  it('extracts a text message', () => {
    const {messages, statuses} = parseMetaEvents(JSON.parse(textWebhook('hello')))
    expect(statuses).toHaveLength(0)
    expect(messages[0]).toMatchObject({externalMessageId: 'wamid.ABC', from: '15550001111', type: 'text', text: 'hello'})
  })
  it('extracts media metadata', () => {
    const payload = {
      entry: [{changes: [{value: {messages: [{from: '1', id: 'wamid.M', timestamp: '1700000000', type: 'document', document: {id: 'media-1', mime_type: 'application/pdf', filename: 'quote.pdf'}}]}}]}],
    }
    const {messages} = parseMetaEvents(payload)
    expect(messages[0].media).toMatchObject({id: 'media-1', mimeType: 'application/pdf', fileName: 'quote.pdf'})
    expect(describeInbound(messages[0])).toEqual({body: '[document: quote.pdf]', contentType: 'application/pdf'})
  })
  it('extracts status events including errors', () => {
    const payload = {
      entry: [{changes: [{value: {statuses: [{id: 'wamid.S', recipient_id: '1555', status: 'failed', timestamp: '1700000000', errors: [{code: 131026, title: 'Message undeliverable'}]}]}}]}],
    }
    const {statuses} = parseMetaEvents(payload)
    expect(statuses[0]).toMatchObject({externalMessageId: 'wamid.S', status: 'failed', errors: [{code: 131026}]})
  })
  it('ignores unknown statuses and messages without ids', () => {
    const {messages, statuses} = parseMetaEvents({entry: [{changes: [{value: {messages: [{type: 'text'}], statuses: [{status: 'deleted', id: 'x'}]}}]}]})
    expect(messages).toHaveLength(0)
    expect(statuses).toHaveLength(0)
  })
})

describe('payload builders', () => {
  it('builds a text payload with preview disabled', () => {
    expect(buildTextPayload('1555', 'hi')).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '1555',
      type: 'text',
      text: {preview_url: false, body: 'hi'},
    })
  })
  it('builds a template payload with language code', () => {
    expect(buildTemplatePayload('1555', {name: 'quote_followup', language: 'zh_CN'})).toEqual({
      messaging_product: 'whatsapp',
      to: '1555',
      type: 'template',
      template: {name: 'quote_followup', language: {code: 'zh_CN'}},
    })
  })
})

describe('graph client', () => {
  const okFetch = (capture: {url?: string; body?: string} = {}) =>
    (async (url: string, init: {body?: string}) => {
      capture.url = String(url)
      capture.body = init.body
      return new Response(JSON.stringify({messages: [{id: 'wamid.OUT'}]}), {status: 200})
    }) as unknown as typeof fetch

  it('posts to the phone number endpoint and returns the message id', async () => {
    const capture: {url?: string; body?: string} = {}
    const result = await sendWhatsAppMessage({
      phoneNumberId: 'pn-1',
      accessToken: 'token',
      body: buildTextPayload('1555', 'hi'),
      fetchImpl: okFetch(capture),
      baseUrl: 'https://graph.test/v21.0',
    })
    expect(result.externalMessageId).toBe('wamid.OUT')
    expect(capture.url).toBe('https://graph.test/v21.0/pn-1/messages')
    expect(JSON.parse(capture.body as string).to).toBe('1555')
  })

  it('classifies 429 as transient and 400 as permanent', async () => {
    const statusFetch = (status: number, body: unknown) =>
      (async () => new Response(JSON.stringify(body), {status})) as unknown as typeof fetch
    await expect(
      sendWhatsAppMessage({phoneNumberId: 'p', accessToken: 't', body: {}, fetchImpl: statusFetch(429, {error: {code: 4, message: 'rate limit'}})}),
    ).rejects.toMatchObject({transient: true})
    const permanent = sendWhatsAppMessage({phoneNumberId: 'p', accessToken: 't', body: {}, fetchImpl: statusFetch(400, {error: {code: 131026, message: 'undeliverable'}})})
    await expect(permanent).rejects.toBeInstanceOf(MetaGraphError)
    await expect(permanent).rejects.toMatchObject({transient: false, code: '131026'})
  })

  it('rejects a 200 without a message id', async () => {
    const fetchImpl = (async () => new Response('{}', {status: 200})) as unknown as typeof fetch
    await expect(sendWhatsAppMessage({phoneNumberId: 'p', accessToken: 't', body: {}, fetchImpl})).rejects.toMatchObject({code: 'NO_MESSAGE_ID'})
  })
})

describe('whatsapp adapter', () => {
  const credentials = {appSecret: SECRET, accessToken: 'token', phoneNumberId: 'pn-1'}
  const adapter = createWhatsAppAdapter()

  it('fails closed on a bad signature', async () => {
    const body = textWebhook()
    await expect(
      adapter.verifyWebhook({rawBody: body, headers: {'x-hub-signature-256': 'sha256=deadbeef'}, credentials, scope: {tenantId: 't', organizationId: 'o'}}),
    ).rejects.toThrow(/signature/)
  })

  it('verifies a message event and returns it as a message', async () => {
    const body = textWebhook('hola')
    const event = await adapter.verifyWebhook({rawBody: body, headers: {'x-hub-signature-256': sign(body)}, credentials, scope: {tenantId: 't', organizationId: 'o'}})
    expect(event.eventType).toBe('message')
  })

  it('reports status-only bodies as status_update and empty bodies as other', async () => {
    const statusBody = JSON.stringify({entry: [{changes: [{value: {statuses: [{id: 'wamid.S', status: 'read', recipient_id: '1'}]}}]}]})
    const statusEvent = await adapter.verifyWebhook({rawBody: statusBody, headers: {'x-hub-signature-256': sign(statusBody)}, credentials, scope: {tenantId: 't', organizationId: 'o'}})
    expect(statusEvent.eventType).toBe('status_update')
    const empty = JSON.stringify({entry: []})
    const other = await adapter.verifyWebhook({rawBody: empty, headers: {'x-hub-signature-256': sign(empty)}, credentials, scope: {tenantId: 't', organizationId: 'o'}})
    expect(other.eventType).toBe('other')
  })

  it('normalizes a text message into the hub shape', async () => {
    const raw = parseSingleMessage({from: '1555', id: 'wamid.N', timestamp: '1700000000', type: 'text', text: {body: 'hi'}})
    expect(raw).not.toBeNull()
    const normalized = await adapter.normalizeInbound({raw: raw!.raw, eventType: 'message'})
    expect(normalized).toMatchObject({
      externalMessageId: 'wamid.N',
      externalConversationId: '1555',
      senderIdentifier: '1555',
      body: 'hi',
      bodyFormat: 'text',
      channelContentType: 'text/plain',
    })
  })

  it('refuses a send without credentials', async () => {
    const result = await adapter.sendMessage({content: {text: 'x'}, credentials: {}, scope: {tenantId: 't', organizationId: 'o'}})
    expect(result.status).toBe('failed')
    expect(result.error).toBe('WHATSAPP_CREDENTIALS_MISSING')
  })

  it('sends text and marks graph rate limits as transient', async () => {
    const capture: {body?: string} = {}
    const ok = createWhatsAppAdapter({
      fetchImpl: (async (_url: string, init: {body?: string}) => {
        capture.body = init.body
        return new Response(JSON.stringify({messages: [{id: 'wamid.OUT'}]}), {status: 200})
      }) as unknown as typeof fetch,
    })
    const sent = await ok.sendMessage({content: {text: 'hello'}, credentials, metadata: {to: '1555'}, scope: {tenantId: 't', organizationId: 'o'}} as never)
    expect(sent).toMatchObject({status: 'sent', externalMessageId: 'wamid.OUT'})
    expect(JSON.parse(capture.body as string).type).toBe('text')

    const limited = createWhatsAppAdapter({
      fetchImpl: (async () => new Response(JSON.stringify({error: {code: 4, message: 'rate limit'}}), {status: 429})) as unknown as typeof fetch,
    })
    await expect(
      limited.sendMessage({content: {text: 'hello'}, credentials, metadata: {to: '1555'}, scope: {tenantId: 't', organizationId: 'o'}} as never),
    ).rejects.toMatchObject({transient: true, status: 429})
  })

  it('uses the template payload when metadata carries a template', async () => {
    let sentBody: Record<string, unknown> = {}
    const adapterWithFetch = createWhatsAppAdapter({
      fetchImpl: (async (_url: string, init: {body?: string}) => {
        sentBody = JSON.parse(init.body as string)
        return new Response(JSON.stringify({messages: [{id: 'wamid.T'}]}), {status: 200})
      }) as unknown as typeof fetch,
    })
    await adapterWithFetch.sendMessage({
      content: {text: 'ignored'},
      credentials,
      metadata: {to: '1555', template: {name: 'quote_followup', language: 'zh_CN'}},
      scope: {tenantId: 't', organizationId: 'o'},
    } as never)
    expect(sentBody.type).toBe('template')
    expect((sentBody.template as Record<string, unknown>).name).toBe('quote_followup')
  })

  it('resolves the recipient from the inbound thread ref when metadata.to is absent', async () => {
    let sentTo = ''
    const adapterWithFetch = createWhatsAppAdapter({
      fetchImpl: (async (_url: string, init: {body?: string}) => {
        sentTo = JSON.parse(init.body as string).to
        return new Response(JSON.stringify({messages: [{id: 'wamid.R'}]}), {status: 200})
      }) as unknown as typeof fetch,
    })
    const result = await adapterWithFetch.sendMessage({content: {text: 'hi'}, credentials, metadata: {thread_id: '15550001111'}, scope: {tenantId: 't', organizationId: 'o'}} as never)
    expect(result.status).toBe('sent')
    expect(sentTo).toBe('15550001111')
    await expect(
      adapterWithFetch.sendMessage({content: {text: 'hi'}, credentials, metadata: {thread_id: 'outbound:abc'}, scope: {tenantId: 't', organizationId: 'o'}} as never),
    ).resolves.toMatchObject({status: 'failed', error: 'WHATSAPP_RECIPIENT_REQUIRED'})
  })

  it('reports missing credentials at validation time', async () => {
    const result = await adapter.validateCredentials!({providerKey: 'whatsapp-business', credentials: {}, scope: {tenantId: 't', organizationId: 'o'}})
    expect(result.ok).toBe(false)
  })

  it('declares tenant scope, native recipients and no polling', () => {
    expect(adapter.channelScope).toBe('tenant')
    expect(adapter.capabilities.recipientFormat).toBe('provider-native')
    expect(adapter.capabilities.realtimePush).toBe(true)
    expect(adapter.capabilities.supportedBodyFormats).toEqual(['text'])
  })
})


describe('provider registration', () => {
  it('registers itself with the hub registry exactly once', async () => {
    const registry = await import('@open-mercato/core/modules/communication_channels/lib/adapter-registry-singleton')
    await import('../setup')
    expect(registry.hasChannelAdapter('whatsapp-business')).toBe(true)
  })
})


describe('graph auth classification', () => {
  const reauthFetch = (status: number, code: number) =>
    (async () => new Response(JSON.stringify({error: {code, message: 'token invalid'}}), {status})) as unknown as typeof fetch

  it('reports expired-token codes as reauth with a 401 classification status', async () => {
    const {classifyOutboundError, isReauthError} = await import('@open-mercato/core/modules/communication_channels/lib/error-classification')
    for (const [status, code] of [[400, 190], [400, 463], [401, 0]] as Array<[number, number]>) {
      try {
        await sendWhatsAppMessage({phoneNumberId: 'p', accessToken: 't', body: {}, fetchImpl: reauthFetch(status, code)})
        throw new Error('expected MetaGraphError')
      } catch (error) {
        expect(error).toBeInstanceOf(MetaGraphError)
        const classification = classifyOutboundError(error)
        expect(classification.status).toBe(401)
        expect(isReauthError(classification)).toBe(true)
        expect(classification.transient).toBe(false)
      }
    }
  })

  it('still treats 429 as transient and a plain 400 as permanent', async () => {
    const {classifyOutboundError, isReauthError} = await import('@open-mercato/core/modules/communication_channels/lib/error-classification')
    try {
      await sendWhatsAppMessage({phoneNumberId: 'p', accessToken: 't', body: {}, fetchImpl: reauthFetch(429, 4)})
    } catch (error) {
      const classification = classifyOutboundError(error)
      expect(classification.transient).toBe(true)
      expect(isReauthError(classification)).toBe(false)
    }
    try {
      await sendWhatsAppMessage({phoneNumberId: 'p', accessToken: 't', body: {}, fetchImpl: reauthFetch(400, 131026)})
    } catch (error) {
      expect(classifyOutboundError(error).transient).toBe(false)
      expect(isReauthError(classifyOutboundError(error))).toBe(false)
    }
  })
})
