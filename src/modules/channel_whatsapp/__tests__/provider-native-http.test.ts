import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createWhatsAppAdapter } from '../lib/adapter'
import { createMessengerAdapter } from '../../channel_messenger/lib/adapter'

/**
 * G7/G8 close-out, adapter half: the recipient the hub now injects must survive
 * `convertOutbound` and reach the provider over a REAL HTTP socket.
 *
 * The Graph server here is a local `http.createServer`, not a mocked `fetch`:
 * the request body, bearer header and path are asserted from bytes that actually
 * crossed the loopback interface, so the test would fail if `metadata.to` were
 * dropped on the way (the G7 shape) or if the payload were email-shaped.
 */
type Captured = { path: string; auth: string; body: Record<string, unknown> }

const requests: Captured[] = []
let server: http.Server
let baseUrl = ''

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk as Buffer))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      requests.push({
        path: req.url ?? '',
        auth: String(req.headers.authorization ?? ''),
        body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
      })
      const wamid = req.url?.includes('pn-1') ? 'wamid.SENT_1' : 'mid.SENT_1'
      res.writeHead(200, {'content-type': 'application/json'})
      res.end(JSON.stringify({messages: [{id: wamid}]}))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('provider-native outbound over a real HTTP socket', () => {
  it('WhatsApp: carries the wa_id and the reply text to Graph', async () => {
    requests.length = 0
    const adapter = createWhatsAppAdapter()
    const converted = await adapter.convertOutbound({
      body: '已收到，今天下午给您回电。',
      bodyFormat: 'text',
      channelMetadata: {to: '15550001111', thread_id: '15550001111'},
    })
    expect(converted.metadata).toMatchObject({to: '15550001111'})

    const result = await adapter.sendMessage({
      conversationId: '15550001111',
      content: converted.content,
      credentials: {
        accessToken: 'token-wa',
        phoneNumberId: 'pn-1',
        appSecret: 'secret',
        graphBaseUrl: baseUrl,
      },
      scope: {tenantId: 't1', organizationId: 't1'},
      metadata: converted.metadata,
    })

    expect(result).toMatchObject({status: 'sent', externalMessageId: 'wamid.SENT_1'})
    expect(requests).toHaveLength(1)
    expect(requests[0].path).toBe('/pn-1/messages')
    expect(requests[0].auth).toBe('Bearer token-wa')
    expect(requests[0].body).toMatchObject({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '15550001111',
      type: 'text',
      text: {body: '已收到，今天下午给您回电。'},
    })
  })

  it('Messenger: carries the PSID and opens no email-shaped address', async () => {
    requests.length = 0
    const adapter = createMessengerAdapter()
    const converted = await adapter.convertOutbound({
      body: 'Thanks — shipping today.',
      bodyFormat: 'text',
      channelMetadata: {to: '9876543210', thread_id: '9876543210'},
    })
    expect(converted.metadata).toMatchObject({to: '9876543210'})

    const result = await adapter.sendMessage({
      conversationId: '9876543210',
      content: converted.content,
      credentials: {pageAccessToken: 'token-page', pageId: 'page-1', appSecret: 'secret', graphBaseUrl: baseUrl},
      scope: {tenantId: 't1', organizationId: 't1'},
      metadata: converted.metadata,
    })

    expect(result).toMatchObject({status: 'sent', externalMessageId: 'mid.SENT_1'})
    expect(requests).toHaveLength(1)
    expect(requests[0].path).toBe('/page-1/messages')
    expect(JSON.stringify(requests[0].body)).not.toContain('@')
    expect(requests[0].body).toMatchObject({
      messaging_type: 'RESPONSE',
      recipient: {id: '9876543210'},
      message: {text: 'Thanks — shipping today.'},
    })
  })

  it('WhatsApp template: sends type=template with name, language code and body parameters', async () => {
    requests.length = 0
    const adapter = createWhatsAppAdapter()
    const template = {
      name: 'quote_followup',
      language: 'zh_CN',
      components: [{type: 'body', parameters: [{type: 'text', text: '张三'}]}],
    }
    const converted = await adapter.convertOutbound({
      body: '模板发送（会话记录用）',
      bodyFormat: 'text',
      channelMetadata: {to: '15550001111', template},
    })
    expect(converted.metadata).toMatchObject({to: '15550001111', template})

    const result = await adapter.sendMessage({
      conversationId: '15550001111',
      content: converted.content,
      credentials: {accessToken: 'token-wa', phoneNumberId: 'pn-1', appSecret: 'secret', graphBaseUrl: baseUrl},
      scope: {tenantId: 't1', organizationId: 't1'},
      metadata: converted.metadata,
    })

    expect(result).toMatchObject({status: 'sent'})
    expect(requests).toHaveLength(1)
    expect(requests[0].path).toBe('/pn-1/messages')
    expect(requests[0].body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '15550001111',
      type: 'template',
      template: {
        name: 'quote_followup',
        language: {code: 'zh_CN'},
        components: [{type: 'body', parameters: [{type: 'text', text: '张三'}]}],
      },
    })
  })

  it('refuses an invalid template before any network call', async () => {
    requests.length = 0
    const adapter = createWhatsAppAdapter()
    const result = await adapter.sendMessage({
      conversationId: '15550001111',
      content: {text: '', bodyFormat: 'text'},
      credentials: {accessToken: 'token-wa', phoneNumberId: 'pn-1', appSecret: 'secret', graphBaseUrl: baseUrl},
      scope: {tenantId: 't1', organizationId: 't1'},
      metadata: {to: '15550001111', template: {name: 'quote_followup'}},
    })
    expect(result.status).toBe('failed')
    expect(result.error).toContain('template.language is required')
    expect(requests).toHaveLength(0)
  })

  it('WhatsApp media: sends type=image by public link with the text as caption', async () => {
    requests.length = 0
    const adapter = createWhatsAppAdapter()
    const converted = await adapter.convertOutbound({
      body: '这是产品图',
      bodyFormat: 'text',
      channelMetadata: {to: '15550001111', media: {kind: 'image', link: 'https://cdn.example.test/a.png'}},
    })
    const result = await adapter.sendMessage({
      conversationId: '15550001111',
      content: converted.content,
      credentials: {accessToken: 'token-wa', phoneNumberId: 'pn-1', appSecret: 'secret', graphBaseUrl: baseUrl},
      scope: {tenantId: 't1', organizationId: 't1'},
      metadata: converted.metadata,
    })
    expect(result).toMatchObject({status: 'sent'})
    expect(requests[0].body).toMatchObject({
      type: 'image',
      image: {link: 'https://cdn.example.test/a.png'},
      caption: '这是产品图',
    })
  })

  it('WhatsApp media: sends a document by provider id with a file name', async () => {
    requests.length = 0
    const adapter = createWhatsAppAdapter()
    const result = await adapter.sendMessage({
      conversationId: '15550001111',
      content: {text: '合同见附件', bodyFormat: 'text'},
      credentials: {accessToken: 'token-wa', phoneNumberId: 'pn-1', appSecret: 'secret', graphBaseUrl: baseUrl},
      scope: {tenantId: 't1', organizationId: 't1'},
      metadata: {to: '15550001111', media: {kind: 'document', id: '1234567890', fileName: '合同.pdf'}},
    })
    expect(result).toMatchObject({status: 'sent'})
    expect(requests[0].body).toMatchObject({
      type: 'document',
      document: {id: '1234567890', filename: '合同.pdf'},
      caption: '合同见附件',
    })
  })

  it('refuses an invalid media descriptor before any request', async () => {
    requests.length = 0
    const adapter = createWhatsAppAdapter()
    const result = await adapter.sendMessage({
      conversationId: '15550001111',
      content: {text: '', bodyFormat: 'text'},
      credentials: {accessToken: 'token-wa', phoneNumberId: 'pn-1', appSecret: 'secret', graphBaseUrl: baseUrl},
      scope: {tenantId: 't1', organizationId: 't1'},
      metadata: {to: '15550001111', media: {kind: 'image', link: 'http://127.0.0.1/a.png'}},
    })
    expect(result.status).toBe('failed')
    expect(String(result.error)).toMatch(/https|public host/)
    expect(requests).toHaveLength(0)
  })

  it('refuses to guess a recipient when the hub supplied none', async () => {
    requests.length = 0
    const adapter = createWhatsAppAdapter()
    const result = await adapter.sendMessage({
      conversationId: 'outbound:3f1c-uuid',
      content: {text: 'hello', bodyFormat: 'text'},
      credentials: {accessToken: 't', phoneNumberId: 'pn-1', appSecret: 's', graphBaseUrl: baseUrl},
      scope: {tenantId: 't1', organizationId: 't1'},
      metadata: {thread_id: 'outbound:3f1c-uuid'},
    })
    expect(result).toMatchObject({status: 'failed', error: 'WHATSAPP_RECIPIENT_REQUIRED'})
    expect(requests).toHaveLength(0)
  })
})
