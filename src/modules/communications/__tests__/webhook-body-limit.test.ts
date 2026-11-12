import { describe, expect, it } from '@jest/globals'
import {
  MAX_WEBHOOK_BODY_BYTES,
  WebhookBodyTooLargeError,
  readBoundedWebhookBody,
} from '../lib/bounded-body'

/**
 * The webhook routes are unauthenticated by design (the HMAC is verified after
 * the bytes arrive), so the reader is the only thing between an arbitrary
 * caller and process memory. These tests pin the three properties the design
 * relies on: a declared oversize is refused before reading, a streamed
 * oversize stops at the limit, and the limit counts bytes rather than
 * characters.
 */

function streamOf(chunks: string[], onPull?: () => void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      onPull?.()
      if (index >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(chunks[index]))
      index += 1
    },
  })
}

function requestWith(body: BodyInit, headers: Record<string, string> = {}): Request {
  const init: RequestInit & { duplex?: 'half' } = { method: 'POST', body, headers }
  if (typeof body === 'object' && body !== null && 'getReader' in body) init.duplex = 'half'
  return new Request('http://localhost/api/communications/webhook/whatsapp', init)
}

describe('readBoundedWebhookBody', () => {
  it('refuses a body whose declared length exceeds the limit without reading it', async () => {
    // A stub, not a real Request: undici eagerly starts pulling a streamed
    // `Request` body on construction, which would blur the very property under
    // test. Here any read attempt fails loudly instead.
    const request = {
      headers: { get: (name: string) => (name === 'content-length' ? String(MAX_WEBHOOK_BODY_BYTES + 1) : null) },
      body: {
        getReader: () => {
          throw new Error('the reader must not be opened for a declared oversize body')
        },
      },
    } as unknown as Request

    await expect(readBoundedWebhookBody(request)).rejects.toBeInstanceOf(WebhookBodyTooLargeError)
  })

  it('stops a chunked body at the limit even without a declared length', async () => {
    const chunks = new Array(4).fill('x'.repeat(300 * 1024))
    const request = requestWith(streamOf(chunks))

    const error = await readBoundedWebhookBody(request).catch((value: unknown) => value)
    expect(error).toBeInstanceOf(WebhookBodyTooLargeError)
    expect((error as WebhookBodyTooLargeError).limitBytes).toBe(MAX_WEBHOOK_BODY_BYTES)
  })

  it('counts bytes, so a multi-byte body cannot pass at four times the ceiling', async () => {
    // 600k CJK characters: 600k chars (under a character-based check) but
    // 1.8 MB of UTF-8 (over the byte ceiling).
    const body = '汉'.repeat(600_000)
    expect(body.length).toBeLessThan(MAX_WEBHOOK_BODY_BYTES)
    expect(Buffer.byteLength(body, 'utf8')).toBeGreaterThan(MAX_WEBHOOK_BODY_BYTES)

    await expect(readBoundedWebhookBody(requestWith(body))).rejects.toBeInstanceOf(WebhookBodyTooLargeError)
  })

  it('accepts a body at the limit and decodes it unchanged', async () => {
    const body = 'x'.repeat(MAX_WEBHOOK_BODY_BYTES)
    await expect(readBoundedWebhookBody(requestWith(body))).resolves.toBe(body)
  })

  it('keeps multi-byte JSON intact when it fits', async () => {
    const payload = JSON.stringify({ text: '你好 world' })
    await expect(readBoundedWebhookBody(requestWith(payload))).resolves.toBe(payload)
  })

  it('returns an empty string for an empty body, and for a bogus content-length', async () => {
    await expect(readBoundedWebhookBody(requestWith(''))).resolves.toBe('')
    await expect(
      readBoundedWebhookBody(requestWith('ok', { 'content-length': 'not-a-number' })),
    ).resolves.toBe('ok')
  })
})
