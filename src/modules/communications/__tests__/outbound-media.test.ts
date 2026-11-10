import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { uploadWhatsAppMedia, MetaGraphError } from '../../channel_whatsapp/lib/graph-client'
import {
  OutboundMediaError,
  inferMediaKind,
  loadAttachmentRow,
  uploadAttachmentAsMedia,
} from '../lib/outbound-media'

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001', 'hex')

let server: http.Server
let base = ''
const calls: Array<{path: string; body: string; auth: string}> = []
let nextStatus = 200

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c as Buffer))
    req.on('end', () => {
      calls.push({
        path: req.url ?? '',
        body: Buffer.concat(chunks).toString('latin1'),
        auth: String(req.headers.authorization ?? ''),
      })
      if (nextStatus >= 400) {
        res.writeHead(nextStatus, {'content-type': 'application/json'})
        res.end(JSON.stringify({error: {code: '190', message: 'bad token'}}))
        return
      }
      res.writeHead(200, {'content-type': 'application/json'})
      res.end(JSON.stringify({id: '987654321'}))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('uploadWhatsAppMedia', () => {
  it('posts multipart bytes to /{phoneNumberId}/media and returns the id', async () => {
    calls.length = 0
    nextStatus = 200
    const result = await uploadWhatsAppMedia({
      baseUrl: base,
      phoneNumberId: 'pn-1',
      accessToken: 'token-wa',
      buffer: PNG,
      mimeType: 'image/png',
      fileName: 'photo.png',
    })
    expect(result.mediaId).toBe('987654321')
    expect(calls[0].path).toBe('/pn-1/media')
    expect(calls[0].auth).toBe('Bearer token-wa')
    expect(calls[0].body).toContain('messaging_product')
    expect(calls[0].body).toContain('whatsapp')
    expect(calls[0].body).toContain('filename="photo.png"')
    expect(calls[0].body.toLowerCase()).toContain('content-type: image/png')
  })

  it('refuses an empty or oversized file locally', async () => {
    await expect(
      uploadWhatsAppMedia({baseUrl: base, phoneNumberId: 'pn-1', accessToken: 't', buffer: Buffer.alloc(0), mimeType: 'image/png', fileName: 'x.png'}),
    ).rejects.toMatchObject({code: 'EMPTY_MEDIA'})
    await expect(
      uploadWhatsAppMedia({baseUrl: base, phoneNumberId: 'pn-1', accessToken: 't', buffer: Buffer.alloc(17 * 1024 * 1024), mimeType: 'image/png', fileName: 'x.png'}),
    ).rejects.toMatchObject({code: 'MEDIA_TOO_LARGE'})
  })

  it('maps a reauth response to a 401 classification', async () => {
    nextStatus = 401
    const error = await uploadWhatsAppMedia({baseUrl: base, phoneNumberId: 'pn-1', accessToken: 't', buffer: PNG, mimeType: 'image/png', fileName: 'x.png'}).catch((e) => e)
    expect(error).toBeInstanceOf(MetaGraphError)
    expect((error as MetaGraphError).status).toBe(401)
    expect((error as MetaGraphError).reauth).toBe(true)
  })
})

describe('uploadAttachmentAsMedia', () => {
  const row = {
    id: '11111111-1111-4111-8111-111111111111',
    entity_id: 'customers:customer',
    record_id: 'c1',
    file_name: '合同.pdf',
    mime_type: 'application/pdf',
    file_size: 12,
    partition_code: 'privateAttachments',
  }
  const fakeEm = (rows: unknown[]) => ({
    getConnection: () => ({execute: async () => rows}),
  })

  const attachmentService = {
    readScoped: async () => ({buffer: PNG, contentType: 'application/pdf', fileName: '合同.pdf', mimeType: 'application/pdf'}),
  }
  const credentialsService = {
    resolve: async () => ({accessToken: 'token-wa', phoneNumberId: 'pn-1', graphBaseUrl: base}),
  }
  const channel = {providerKey: 'whatsapp-business', organizationId: 'o1', tenantId: 't1', userId: null}

  it('reads the scoped attachment, uploads it and returns a provider media id', async () => {
    calls.length = 0
    nextStatus = 200
    const resolved = await uploadAttachmentAsMedia({
      em: fakeEm([row]) as never,
      auth: {sub: 'u1'},
      attachmentService,
      credentialsService,
      channel,
      attachmentId: row.id,
      tenantId: 't1',
    })
    expect(resolved).toMatchObject({kind: 'document', id: '987654321', fileName: '合同.pdf'})
    expect(calls[0].path).toBe('/pn-1/media')
  })

  it('404s a foreign or missing attachment without touching storage', async () => {
    const error = await uploadAttachmentAsMedia({
      em: fakeEm([]) as never,
      auth: {},
      attachmentService,
      credentialsService,
      channel,
      attachmentId: row.id,
      tenantId: 't1',
    }).catch((e) => e)
    expect(error).toBeInstanceOf(OutboundMediaError)
    expect((error as OutboundMediaError).code).toBe('ATTACHMENT_NOT_FOUND')
    expect((error as OutboundMediaError).status).toBe(404)
  })

  it('refuses a non-allowlisted MIME type before reading or uploading', async () => {
    const error = await uploadAttachmentAsMedia({
      em: fakeEm([{...row, mime_type: 'application/x-msdownload'}]) as never,
      auth: {},
      attachmentService,
      credentialsService,
      channel,
      attachmentId: row.id,
      tenantId: 't1',
    }).catch((e) => e)
    expect((error as OutboundMediaError).status).toBe(415)
    expect((error as OutboundMediaError).code).toBe('MEDIA_MIME_UNSUPPORTED')
  })

  it('infers the kind from the MIME type', () => {
    expect(inferMediaKind('image/jpeg')).toBe('image')
    expect(inferMediaKind('video/mp4')).toBe('video')
    expect(inferMediaKind('audio/ogg')).toBe('audio')
    expect(inferMediaKind('application/pdf')).toBe('document')
  })

  it('loadAttachmentRow scopes by tenant and maps columns', async () => {
    expect(await loadAttachmentRow(fakeEm([row]) as never, row.id, 't1')).toMatchObject({
      entityId: 'customers:customer',
      fileName: '合同.pdf',
      fileSize: 12,
    })
    expect(await loadAttachmentRow(fakeEm([]) as never, row.id, 't1')).toBeNull()
  })
})
