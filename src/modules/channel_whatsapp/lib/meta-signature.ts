import crypto from 'node:crypto'

/**
 * Meta webhook signature verification (`X-Hub-Signature-256: sha256=<hex>`).
 *
 * The shared hub webhook route treats a non-throwing `verifyWebhook` as
 * "verified" and pins the request to that channel's tenant, so this MUST throw
 * on any mismatch; returning normally on an unsigned request would be a
 * tenant-spoofing fail-open (documented in the adapter contract).
 */
export function verifyMetaSignature(
  rawBody: string | Buffer,
  header: string | string[] | undefined,
  appSecret: string,
): boolean {
  if (!appSecret) return false
  const value = Array.isArray(header) ? header[0] : header
  if (!value || typeof value !== 'string') return false
  const match = /^sha256=([0-9a-f]{64})$/i.exec(value.trim())
  if (!match) return false
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const given = match[1].toLowerCase()
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(given, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
