/**
 * Bounded raw-body reader for the public webhook routes.
 *
 * Both Meta webhooks verify an HMAC over the *exact* request bytes, so the body
 * cannot go through a JSON parser first. `await req.text()` however materialises
 * the whole payload before any size check, which turns an unauthenticated POST
 * into a memory-exhaustion lever — and the check it fed compared characters,
 * not bytes, so a multi-byte body could pass at up to 4x the intended ceiling.
 *
 * This reader:
 *   1. refuses a body whose declared `content-length` already exceeds the
 *      limit, without consuming a single chunk;
 *   2. streams the rest and stops at the first chunk that crosses the limit,
 *      cancelling the request body instead of reading what will be discarded;
 *   3. counts bytes, so the ceiling means what it says regardless of encoding.
 */

export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024

export class WebhookBodyTooLargeError extends Error {
  readonly limitBytes: number

  constructor(limitBytes: number) {
    super(`webhook body exceeds ${limitBytes} bytes`)
    this.name = 'WebhookBodyTooLargeError'
    this.limitBytes = limitBytes
  }
}

function declaredLength(request: Request): number | null {
  const header = request.headers.get('content-length')
  if (header === null) return null
  const parsed = Number(header)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

export async function readBoundedWebhookBody(
  request: Request,
  limitBytes: number = MAX_WEBHOOK_BODY_BYTES,
): Promise<string> {
  const declared = declaredLength(request)
  if (declared !== null && declared > limitBytes) {
    throw new WebhookBodyTooLargeError(limitBytes)
  }
  const body = request.body
  if (!body) return ''

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let overflowed = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > limitBytes) {
        overflowed = true
        break
      }
      chunks.push(value)
    }
  } finally {
    if (overflowed) {
      // The request is refused; do not let the rest of it stream into this
      // process for nothing.
      try {
        await reader.cancel()
      } catch {
        // A cancelled or already-closed stream is not a new failure.
      }
    }
    try {
      reader.releaseLock()
    } catch {
      // Releasing a locked reader is best-effort; the bytes are already ours.
    }
  }
  if (overflowed) throw new WebhookBodyTooLargeError(limitBytes)

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(merged)
}
