import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHash } from 'node:crypto'
import {
  MediaDownloadError,
  assertAllowedMime,
  assertSafeMediaUrl,
  downloadMediaByUrl,
  readMessengerAttachment,
  requiresGraphToken,
  withMessengerMedia,
  downloadWhatsAppMedia,
  fetchWhatsAppMediaMetadata,
  readMediaDescriptor,
  resolveMediaDownloadLimits,
  safeMediaFileName,
  withPersistedMedia,
} from '../lib/media-download'

/**
 * G3: inbound media must be fetched with guards, not trusted.
 *
 * These cases run a real HTTP server (metadata + bytes are actual loopback
 * responses, not a mocked fetch) so the URL/redirect/size logic is exercised the
 * way the worker will exercise it.
 */
const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5e0000000049454e44ae426082',
  'hex',
)
const PNG_SHA = createHash('sha256').update(PNG_BYTES).digest('hex')

let server: http.Server
let base = ''
const requests: string[] = []

beforeAll(async () => {
  server = http.createServer((req, res) => {
    requests.push(req.url ?? '')
    const url = req.url ?? ''
    if (url.startsWith('/media-ok')) {
      res.writeHead(200, {'content-type': 'application/json'})
      res.end(JSON.stringify({
        url: `${base}/bytes`,
        mime_type: 'image/png',
        file_size: PNG_BYTES.byteLength,
        sha256: PNG_SHA,
      }))
      return
    }
    if (url === '/html') {
      res.writeHead(200, {'content-type': 'text/html'})
      res.end('<h1>x</h1>')
      return
    }
    if (url === '/bytes') {
      res.writeHead(200, {'content-type': 'image/png', 'content-length': String(PNG_BYTES.byteLength)})
      res.end(PNG_BYTES)
      return
    }
    if (url.startsWith('/media-big')) {
      res.writeHead(200, {'content-type': 'application/json'})
      res.end(JSON.stringify({url: `${base}/bytes`, mime_type: 'image/png', file_size: 99 * 1024 * 1024}))
      return
    }
    if (url.startsWith('/media-htmlish')) {
      res.writeHead(200, {'content-type': 'application/json'})
      res.end(JSON.stringify({url: `${base}/bytes`, mime_type: 'text/html'}))
      return
    }
    if (url.startsWith('/media-badhash')) {
      res.writeHead(200, {'content-type': 'application/json'})
      res.end(JSON.stringify({url: `${base}/bytes`, mime_type: 'image/png', sha256: 'deadbeef'}))
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

const drillLimits = {maxBytes: 1024 * 1024, allowPrivateHosts: true}

describe('downloadWhatsAppMedia', () => {
  it('fetches metadata + bytes and returns the verified file', async () => {
    const media = await downloadWhatsAppMedia({
      mediaId: 'media-ok',
      accessToken: 'token-media',
      baseUrl: base,
      limits: drillLimits,
    })
    expect(media.mimeType).toBe('image/png')
    expect(media.fileSize).toBe(PNG_BYTES.byteLength)
    expect(media.sha256).toBe(PNG_SHA)
    expect(media.fileName).toBe('whatsapp-media-ok.png')
    expect(requests).toContain('/media-ok')
    expect(requests).toContain('/bytes')
  })

  it('refuses an advertised size over the ceiling before fetching bytes', async () => {
    requests.length = 0
    await expect(
      downloadWhatsAppMedia({mediaId: 'media-big', accessToken: 't', baseUrl: base, limits: drillLimits}),
    ).rejects.toMatchObject({code: 'MEDIA_TOO_LARGE'})
    expect(requests).toContain('/media-big')
    expect(requests).not.toContain('/bytes')
  })

  it('refuses a non-allowlisted MIME type', async () => {
    await expect(
      downloadWhatsAppMedia({mediaId: 'media-htmlish', accessToken: 't', baseUrl: base, limits: drillLimits}),
    ).rejects.toMatchObject({code: 'MEDIA_MIME_UNSUPPORTED'})
  })

  it('refuses bytes that do not match the advertised sha256', async () => {
    await expect(
      downloadWhatsAppMedia({mediaId: 'media-badhash', accessToken: 't', baseUrl: base, limits: drillLimits}),
    ).rejects.toMatchObject({code: 'MEDIA_HASH_MISMATCH'})
  })
})

describe('media download guards', () => {
  it('blocks a loopback/private host unless the drill flag is set', () => {
    expect(() => assertSafeMediaUrl('http://127.0.0.1:8080/x', {maxBytes: 1, allowPrivateHosts: false})).toThrow(
      /not allowed/,
    )
    expect(() => assertSafeMediaUrl('http://10.0.0.5/x', {maxBytes: 1, allowPrivateHosts: false})).toThrow(
      /not allowed/,
    )
    expect(() => assertSafeMediaUrl('http://169.254.169.254/latest', {maxBytes: 1, allowPrivateHosts: false})).toThrow(
      /not allowed/,
    )
    expect(assertSafeMediaUrl('http://127.0.0.1/x', {maxBytes: 1, allowPrivateHosts: true}).hostname).toBe('127.0.0.1')
  })

  it('rejects a non-http scheme and embedded credentials', () => {
    expect(() => assertSafeMediaUrl('file:///etc/passwd', drillLimits)).toThrow(/scheme/)
    expect(() => assertSafeMediaUrl('https://user:pass@example.test/x', drillLimits)).toThrow(/credentials/)
  })

  it('allowlists MIME types and derives a safe file name', () => {
    expect(() => assertAllowedMime('application/pdf')).not.toThrow()
    expect(() => assertAllowedMime('application/x-msdownload')).toThrow(/not allowed/)
    expect(safeMediaFileName({mimeType: 'image/jpeg', mediaId: 'm1'})).toBe('whatsapp-m1.jpg')
    expect(safeMediaFileName({fileName: '../../etc/passwd', mimeType: 'image/png', mediaId: 'm1'})).toBe('passwd')
  })

  it('defaults the ceiling to 10 MiB and caps an env override at 25 MiB', () => {
    expect(resolveMediaDownloadLimits({} as unknown as NodeJS.ProcessEnv).maxBytes).toBe(10 * 1024 * 1024)
    expect(resolveMediaDownloadLimits({OM_CHANNEL_MEDIA_MAX_BYTES: '999999999'} as unknown as NodeJS.ProcessEnv).maxBytes).toBe(
      25 * 1024 * 1024,
    )
    expect(
      resolveMediaDownloadLimits({OM_CHANNEL_MEDIA_ALLOW_PRIVATE_HOSTS: 'true'} as unknown as NodeJS.ProcessEnv)
        .allowPrivateHosts,
    ).toBe(true)
  })

  it('reads only the media descriptor out of a link payload', () => {
    expect(readMediaDescriptor({_meta: {media: {id: 'm1', kind: 'image'}}})).toMatchObject({id: 'm1'})
    expect(readMediaDescriptor({message: {text: 'hi'}})).toBeNull()
  })

  it('records the persisted attachment on the payload without dropping raw fields', () => {
    const next = withPersistedMedia({_meta: {media: {id: 'm1', kind: 'image'}}, raw: 1}, {
      attachmentId: 'a1',
      fileName: 'f.png',
      mimeType: 'image/png',
      fileSize: 10,
      sha256: 'aa',
      url: '/api/attachments/a1',
    })
    expect(next.raw).toBe(1)
    expect(readMediaDescriptor(next)?.download).toMatchObject({attachmentId: 'a1', fileSize: 10})
  })

  it('wraps provider failures in a typed error', async () => {
    await expect(
      fetchWhatsAppMediaMetadata({mediaId: 'nope', accessToken: 't', baseUrl: base, fetchImpl: fetch}),
    ).rejects.toBeInstanceOf(MediaDownloadError)
  })

describe('Messenger link attachments', () => {
  it('downloads bytes by url with the same guards', async () => {
    const media = await downloadMediaByUrl({url: `${base}/bytes`, limits: drillLimits})
    expect(media.mimeType).toBe('image/png')
    expect(media.fileSize).toBe(PNG_BYTES.byteLength)
    expect(media.sha256).toBe(PNG_SHA)
  })

  it('refuses a private url and a non-allowlisted content type', async () => {
    await expect(
      downloadMediaByUrl({url: 'http://10.0.0.2/x.png', limits: {maxBytes: 1024, allowPrivateHosts: false}}),
    ).rejects.toMatchObject({
      code: 'MEDIA_URL_BLOCKED',
    })
    await expect(downloadMediaByUrl({url: `${base}/html`, limits: drillLimits})).rejects.toMatchObject({
      code: 'MEDIA_MIME_UNSUPPORTED',
    })
  })

  it('reads the first downloadable attachment and records the stored file', () => {
    const payload = {message: {attachments: [{type: 'image', payload: {url: 'https://cdn.example.test/a.png'}}]}}
    expect(readMessengerAttachment(payload)).toEqual({kind: 'image', url: 'https://cdn.example.test/a.png'})
    expect(readMessengerAttachment({message: {text: 'hi'}})).toBeNull()
    const next = withMessengerMedia(payload, {
      attachmentId: 'att-9',
      fileName: 'whatsapp-messenger.png',
      mimeType: 'image/png',
      fileSize: 66,
      sha256: 'aa',
      url: '/api/attachments/att-9',
    }, {kind: 'image', mimeType: 'image/png', fileName: 'whatsapp-messenger.png'})
    expect(readMediaDescriptor(next)).toMatchObject({kind: 'image', download: {attachmentId: 'att-9'}})
    expect((next.message as Record<string, unknown>)).toBeDefined()
  })
})

  it('only the WhatsApp path requires a Graph token', () => {
    expect(requiresGraphToken('whatsapp')).toBe(true)
    expect(requiresGraphToken('messenger')).toBe(false)
    expect(requiresGraphToken('Messenger')).toBe(false)
  })
})
