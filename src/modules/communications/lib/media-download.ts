import { createHash, randomUUID } from 'node:crypto'

/**
 * Inbound WhatsApp media download (ADR-005 G3).
 *
 * The hub stores the provider's raw payload on the MessageChannelLink; a media
 * message is only a descriptor there (`_meta.media.id`). Until the bytes are
 * fetched the CRM can render "附件 · 未下载" and nothing else. This module is the
 * seam that turns a descriptor into a real attachment:
 *
 *   GET /{media-id}          → {url, mime_type, file_size, sha256?}
 *   GET {url} (bearer)        → bytes
 *   attachmentService.createScoped → attachments row + storage object
 *
 * Three guards make it safe to call with a provider-supplied URL:
 *   - only http(s), no embedded credentials, no private/loopback host unless the
 *     drill flag is set (a compromised webhook must not turn this into SSRF);
 *   - a byte ceiling checked against the advertised size AND the received length;
 *   - a MIME allowlist — the CRM must not persist an executable a customer sent.
 *
 * The attachment is linked to the ExternalMessage row and the link payload gains
 * a `_meta.media.download` summary, so the BFF can show "已下载" without a second
 * media table and without re-fetching.
 */

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024
const HARD_MAX_BYTES = 25 * 1024 * 1024

const MIME_ALLOWLIST = [
  /^image\//,
  /^video\//,
  /^audio\//,
  /^application\/pdf$/,
  /^application\/msword$/,
  /^application\/vnd\.openxmlformats-officedocument\./,
  /^text\/plain$/,
  /^text\/csv$/,
]

const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
}

export const MEDIA_DOWNLOAD_QUEUE = 'communication-channels-media'
export type MediaDownloadJobPayload = {
  channelLinkId: string
  scope: {
    tenantId: string
    organizationId: string | null
  }
}
export const MEDIA_ENTITY_ID = 'communication_channels.external_message'

export type MediaDownloadLimits = {
  maxBytes: number
  allowPrivateHosts: boolean
}

export function resolveMediaDownloadLimits(env: NodeJS.ProcessEnv = process.env): MediaDownloadLimits {
  const raw = Number.parseInt(env.OM_CHANNEL_MEDIA_MAX_BYTES ?? '', 10)
  const maxBytes =
    Number.isFinite(raw) && raw > 0 ? Math.min(raw, HARD_MAX_BYTES) : DEFAULT_MAX_BYTES
  return {
    maxBytes,
    // Drill-only. A production deployment must leave this unset: the provider
    // gives us a public CDN URL, never a loopback address.
    allowPrivateHosts: env.OM_CHANNEL_MEDIA_ALLOW_PRIVATE_HOSTS === 'true',
  }
}

export class MediaDownloadError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'MediaDownloadError'
    this.code = code
  }
}

/**
 * True when the address cannot be reached from the public internet.
 *
 * `URL.hostname` keeps the brackets of an IPv6 literal (`[::1]`), so the previous
 * string-prefix checks never matched: `http://[::1]/`, `http://[::ffff:127.0.0.1]/`
 * and `http://0.0.0.0:3000/` (loopback on Linux) all passed the guard. Hostnames
 * like `fc-cdn.example` were rejected by the same prefix logic. Both directions
 * are fixed here by parsing the address instead of prefix-matching it.
 */
function isPrivateIpv4(a: number, b: number): boolean {
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64.0.0/10
  if (a === 169 && b === 254) return true // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && (b === 0 || b === 168)) return true
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking 198.18.0.0/15
  if (a >= 224) return true // multicast + reserved + broadcast
  return false
}

/** `::`-compressed IPv6 → eight 16-bit groups, or null when malformed. */
function expandIpv6(literal: string): number[] | null {
  const value = literal.toLowerCase()
  const parts = value.split('::')
  if (parts.length > 2) return null
  const head = parts[0] ? parts[0].split(':') : []
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : []
  if (parts.length === 1 && head.length !== 8) return null
  const zeros = 8 - head.length - tail.length
  if (zeros < 0) return null
  const groups = [...head, ...Array<string>(zeros).fill('0'), ...tail].map((group) =>
    /^[0-9a-f]{1,4}$/.test(group) ? Number.parseInt(group, 16) : Number.NaN,
  )
  return groups.some((group) => Number.isNaN(group)) ? null : groups
}

function isPrivateIpv6(groups: number[]): boolean {
  const first = groups[0]
  if ((first & 0xfe00) === 0xfc00) return true // unique-local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true // link-local fe80::/10
  if ((first & 0xff00) === 0xff00) return true // multicast ff00::/8
  const zerosUntilLast = groups.slice(0, 7).every((group) => group === 0)
  if (zerosUntilLast && (groups[7] === 0 || groups[7] === 1)) return true // :: and ::1
  // ::ffff:a.b.c.d (IPv4-mapped): WHATWG normalizes it to ::ffff:7f00:1, so the
  // embedded address is taken from the last two groups rather than the text.
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return isPrivateIpv4(groups[6] >> 8, groups[6] & 0xff)
  }
  return false
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  if (bare === 'localhost' || bare.endsWith('.localhost')) return true
  if (bare.includes(':')) {
    const groups = expandIpv6(bare)
    // An IPv6-shaped literal the parser cannot read is refused, not guessed.
    return groups === null ? true : isPrivateIpv6(groups)
  }
  const ipv4 = bare.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!ipv4) return false
  const octets = ipv4.slice(1, 5).map(Number)
  if (octets.some((octet) => octet > 255)) return true
  return isPrivateIpv4(octets[0], octets[1])
}

export function assertSafeMediaUrl(rawUrl: string, limits: MediaDownloadLimits): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new MediaDownloadError('MEDIA_URL_INVALID', 'media url is not a valid URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new MediaDownloadError('MEDIA_URL_INVALID', `media url scheme ${url.protocol} is not allowed`)
  }
  if (url.username || url.password) {
    throw new MediaDownloadError('MEDIA_URL_INVALID', 'media url must not carry credentials')
  }
  if (!limits.allowPrivateHosts && isPrivateHost(url.hostname)) {
    throw new MediaDownloadError('MEDIA_URL_BLOCKED', `media host ${url.hostname} is not allowed`)
  }
  return url
}

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])
const MAX_MEDIA_REDIRECTS = 3

/**
 * Fetch a provider-supplied media URL while following redirects by hand.
 *
 * `fetch` follows redirects by default and the guard only ran on the URL the
 * provider handed us, so a `302 Location: http://169.254.169.254/…` reached the
 * metadata endpoint unchecked. Every hop is now validated before it is requested;
 * the bearer token is not forwarded to a different origin (the same rule undici
 * applies to its own redirect handling), and a chain longer than three hops is
 * refused instead of followed.
 */
async function fetchMediaResponse(
  doFetch: FetchLike,
  initialUrl: URL,
  headers: Record<string, string> | undefined,
  limits: MediaDownloadLimits,
): Promise<Response> {
  let current = initialUrl
  let forwardedHeaders = headers
  let hops = 0
  while (true) {
    const response: Response = await doFetch(current.toString(), { headers: forwardedHeaders, redirect: 'manual' })
    if (!REDIRECT_STATUS.has(response.status)) return response
    const location = response.headers.get('location')
    if (!location) return response
    const next = assertSafeMediaUrl(new URL(location, current).toString(), limits)
    if (next.origin !== initialUrl.origin && forwardedHeaders?.authorization) {
      const { authorization: _dropped, ...rest } = forwardedHeaders
      forwardedHeaders = rest
    }
    hops += 1
    if (hops > MAX_MEDIA_REDIRECTS) {
      throw new MediaDownloadError('MEDIA_REDIRECT_LIMIT', `media download exceeded ${MAX_MEDIA_REDIRECTS} redirects`)
    }
    current = next
  }
}

export function assertAllowedMime(mimeType: string): void {
  const normalized = mimeType.split(';')[0].trim().toLowerCase()
  if (!MIME_ALLOWLIST.some((pattern) => pattern.test(normalized))) {
    throw new MediaDownloadError('MEDIA_MIME_UNSUPPORTED', `media type ${normalized} is not allowed`)
  }
}

export function safeMediaFileName(input: {
  fileName?: string | null
  mimeType: string
  mediaId: string
}): string {
  const candidate = (input.fileName ?? '').trim()
  const base = candidate.length > 0 ? candidate.split(/[\\/]/).pop() ?? '' : ''
  const stem = base.replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '').slice(0, 96)
  if (stem.length > 0) return stem
  const ext = MIME_EXTENSION[input.mimeType.split(';')[0].trim().toLowerCase()] ?? 'bin'
  return `whatsapp-${input.mediaId}.${ext}`
}

type FetchLike = typeof fetch

export type WhatsAppMediaMetadata = {
  url: string
  mimeType: string
  fileSize: number | null
  sha256: string | null
}

export async function fetchWhatsAppMediaMetadata(input: {
  mediaId: string
  accessToken: string
  baseUrl?: string
  fetchImpl?: FetchLike
}): Promise<WhatsAppMediaMetadata> {
  const base = (input.baseUrl || process.env.META_GRAPH_BASE_URL || 'https://graph.facebook.com/v21.0').replace(/\/$/, '')
  const doFetch = input.fetchImpl ?? fetch
  const response = await doFetch(`${base}/${encodeURIComponent(input.mediaId)}`, {
    headers: {authorization: `Bearer ${input.accessToken}`},
  })
  const text = await response.text()
  if (!response.ok) {
    throw new MediaDownloadError(
      'MEDIA_LOOKUP_FAILED',
      `media lookup failed (${response.status}): ${text.slice(0, 200)}`,
    )
  }
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new MediaDownloadError('MEDIA_LOOKUP_FAILED', 'media lookup returned a non-JSON body')
  }
  const url = parsed.url
  const mimeType = parsed.mime_type
  if (typeof url !== 'string' || typeof mimeType !== 'string') {
    throw new MediaDownloadError('MEDIA_LOOKUP_FAILED', 'media lookup response is missing url/mime_type')
  }
  return {
    url,
    mimeType,
    fileSize: typeof parsed.file_size === 'number' ? parsed.file_size : null,
    sha256: typeof parsed.sha256 === 'string' ? parsed.sha256 : null,
  }
}

export type DownloadedMedia = {
  buffer: Buffer
  mimeType: string
  fileName: string
  fileSize: number
  sha256: string
}

/**
 * Fetch the bytes with the same three guards as the metadata step, enforcing the
 * ceiling on both the advertised size and what actually arrives (a provider that
 * under-reports must not stream past the cap).
 */
export async function downloadWhatsAppMedia(input: {
  mediaId: string
  accessToken: string
  fileName?: string | null
  baseUrl?: string
  fetchImpl?: FetchLike
  limits?: MediaDownloadLimits
}): Promise<DownloadedMedia> {
  const limits = input.limits ?? resolveMediaDownloadLimits()
  const doFetch = input.fetchImpl ?? fetch
  const metadata = await fetchWhatsAppMediaMetadata({
    mediaId: input.mediaId,
    accessToken: input.accessToken,
    baseUrl: input.baseUrl,
    fetchImpl: doFetch,
  })
  assertAllowedMime(metadata.mimeType)
  if (metadata.fileSize !== null && metadata.fileSize > limits.maxBytes) {
    throw new MediaDownloadError(
      'MEDIA_TOO_LARGE',
      `media is ${metadata.fileSize} bytes, over the ${limits.maxBytes}-byte limit`,
    )
  }
  const url = assertSafeMediaUrl(metadata.url, limits)
  const response = await fetchMediaResponse(
    doFetch,
    url,
    {authorization: `Bearer ${input.accessToken}`},
    limits,
  )
  if (!response.ok) {
    throw new MediaDownloadError('MEDIA_DOWNLOAD_FAILED', `media download failed (${response.status})`)
  }
  const declaredLength = Number.parseInt(response.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(declaredLength) && declaredLength > limits.maxBytes) {
    throw new MediaDownloadError(
      'MEDIA_TOO_LARGE',
      `media is ${declaredLength} bytes, over the ${limits.maxBytes}-byte limit`,
    )
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength > limits.maxBytes) {
    throw new MediaDownloadError(
      'MEDIA_TOO_LARGE',
      `media is ${bytes.byteLength} bytes, over the ${limits.maxBytes}-byte limit`,
    )
  }
  if (bytes.byteLength === 0) {
    throw new MediaDownloadError('MEDIA_EMPTY', 'media download returned no bytes')
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (metadata.sha256 && metadata.sha256.toLowerCase() !== sha256) {
    throw new MediaDownloadError('MEDIA_HASH_MISMATCH', 'downloaded media does not match the advertised sha256')
  }
  return {
    buffer: bytes,
    mimeType: metadata.mimeType,
    fileName: safeMediaFileName({fileName: input.fileName, mimeType: metadata.mimeType, mediaId: input.mediaId}),
    fileSize: bytes.byteLength,
    sha256,
  }
}

type MediaDescriptor = {
  id?: unknown
  kind?: unknown
  mimeType?: unknown
  fileName?: unknown
  download?: unknown
}

export function readMediaDescriptor(channelPayload: unknown): MediaDescriptor | null {
  if (!channelPayload || typeof channelPayload !== 'object') return null
  const meta = (channelPayload as Record<string, unknown>)._meta
  if (!meta || typeof meta !== 'object') return null
  const media = (meta as Record<string, unknown>).media
  if (!media || typeof media !== 'object') return null
  return media as MediaDescriptor
}

/**
 * The slice of the installed AttachmentService this module uses. Declared here
 * (not imported from the package's internal path, which its export map does not
 * publish) so a change in the service breaks the worker at the call site instead
 * of the build.
 */
export type AttachmentServiceLike = {
  createScoped(input: {
    tenantId: string
    organizationId: string
    entityId: string
    recordId: string
    partitionCode: string
    fileName: string
    declaredMimeType?: string | null
    buffer: Buffer
  }): Promise<{id: string; url: string; fileName: string; mimeType: string; fileSize: number}>
}

export const MEDIA_PARTITION_CODE = 'privateAttachments'

/**
 * Only the WhatsApp path needs a Graph token: it resolves a media id via
 * `/media/{id}`. A Messenger attachment is a provider-signed URL, and requiring a
 * token there skipped every download with "channel has no access token"
 * (found by the round-46 drill, after the capability had shipped).
 */
export function requiresGraphToken(channelType: string): boolean {
  return channelType.trim().toLowerCase() === 'whatsapp'
}

export type MessengerAttachment = {kind: string; url: string}

/** Messenger keeps attachments on the raw event; pick the first downloadable one. */
export function readMessengerAttachment(channelPayload: unknown): MessengerAttachment | null {
  if (!channelPayload || typeof channelPayload !== 'object') return null
  const message = (channelPayload as Record<string, unknown>).message
  if (!message || typeof message !== 'object') return null
  const attachments = (message as Record<string, unknown>).attachments
  if (!Array.isArray(attachments)) return null
  for (const entry of attachments) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const payload = record.payload
    if (!payload || typeof payload !== 'object') continue
    const url = (payload as Record<string, unknown>).url
    if (typeof url === 'string' && url.length > 0) {
      return {kind: typeof record.type === 'string' ? record.type : 'file', url}
    }
  }
  return null
}

/**
 * Download bytes from a provider-supplied public URL (Messenger attachments are
 * link-based, unlike WhatsApp's media-id lookup). Same three guards as the
 * WhatsApp path: https-only, no private host unless drilled, byte ceiling and a
 * MIME allowlist.
 */
export async function downloadMediaByUrl(input: {
  url: string
  fetchImpl?: typeof fetch
  limits?: MediaDownloadLimits
}): Promise<DownloadedMedia> {
  const limits = input.limits ?? resolveMediaDownloadLimits()
  const url = assertSafeMediaUrl(input.url, limits)
  const doFetch = input.fetchImpl ?? fetch
  const response = await fetchMediaResponse(doFetch, url, undefined, limits)
  if (!response.ok) {
    throw new MediaDownloadError('MEDIA_DOWNLOAD_FAILED', `media download failed (${response.status})`)
  }
  const headerMime = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  // Messenger CDNs sometimes answer application/octet-stream; the attachment
  // type is the fallback signal, and the allowlist still applies to the result.
  const mimeType = headerMime && headerMime !== 'application/octet-stream' ? headerMime : 'image/jpeg'
  assertAllowedMime(mimeType)
  const declaredLength = Number.parseInt(response.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(declaredLength) && declaredLength > limits.maxBytes) {
    throw new MediaDownloadError('MEDIA_TOO_LARGE', `media is ${declaredLength} bytes, over the ${limits.maxBytes}-byte limit`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength > limits.maxBytes) {
    throw new MediaDownloadError('MEDIA_TOO_LARGE', `media is ${bytes.byteLength} bytes, over the ${limits.maxBytes}-byte limit`)
  }
  if (bytes.byteLength === 0) throw new MediaDownloadError('MEDIA_EMPTY', 'media download returned no bytes')
  return {
    buffer: bytes,
    mimeType,
    fileName: safeMediaFileName({mimeType, mediaId: 'messenger'}),
    fileSize: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

export function withMessengerMedia(
  channelPayload: unknown,
  persisted: PersistedMedia,
  meta: {kind: string; mimeType: string; fileName: string},
): Record<string, unknown> {
  const payload = channelPayload && typeof channelPayload === 'object' ? {...(channelPayload as Record<string, unknown>)} : {}
  const existing = payload._meta && typeof payload._meta === 'object' ? {...(payload._meta as Record<string, unknown>)} : {}
  payload._meta = {
    ...existing,
    media: {
      id: `messenger:${meta.kind}`,
      kind: meta.kind,
      mimeType: meta.mimeType,
      fileName: meta.fileName,
      download: {
        attachmentId: persisted.attachmentId,
        fileName: persisted.fileName,
        mimeType: persisted.mimeType,
        fileSize: persisted.fileSize,
        sha256: persisted.sha256,
        url: persisted.url,
        downloadedAt: new Date().toISOString(),
      },
    },
  }
  return payload
}

export type PersistedMedia = {
  attachmentId: string
  fileName: string
  mimeType: string
  fileSize: number
  sha256: string
  url: string
}

export async function downloadInboundWhatsAppMedia(input: {
  attachmentService: AttachmentServiceLike
  tenantId: string
  organizationId: string | null
  externalMessageRowId: string
  channelPayload: unknown
  accessToken: string
  baseUrl?: string
  fetchImpl?: FetchLike
  limits?: MediaDownloadLimits
}): Promise<PersistedMedia | null> {
  const descriptor = readMediaDescriptor(input.channelPayload)
  if (!descriptor) return null
  if (typeof descriptor.id !== 'string' || descriptor.id.length === 0) return null
  // Idempotent: a retried job must not store the same bytes twice.
  if (descriptor.download && typeof descriptor.download === 'object') {
    const existing = descriptor.download as Record<string, unknown>
    if (typeof existing.attachmentId === 'string') {
      return {
        attachmentId: existing.attachmentId,
        fileName: String(existing.fileName ?? ''),
        mimeType: String(existing.mimeType ?? ''),
        fileSize: Number(existing.fileSize ?? 0),
        sha256: String(existing.sha256 ?? ''),
        url: String(existing.url ?? ''),
      }
    }
  }
  const media = await downloadWhatsAppMedia({
    mediaId: descriptor.id,
    accessToken: input.accessToken,
    fileName: typeof descriptor.fileName === 'string' ? descriptor.fileName : null,
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
    limits: input.limits,
  })
  const organizationId = input.organizationId ?? input.tenantId
  const created = await input.attachmentService.createScoped({
    tenantId: input.tenantId,
    organizationId,
    entityId: MEDIA_ENTITY_ID,
    recordId: input.externalMessageRowId,
    partitionCode: MEDIA_PARTITION_CODE,
    fileName: media.fileName,
    declaredMimeType: media.mimeType,
    buffer: media.buffer,
  })
  return {
    attachmentId: created.id,
    fileName: created.fileName,
    mimeType: created.mimeType,
    fileSize: created.fileSize,
    sha256: media.sha256,
    url: created.url,
  }
}

/** Attach the persisted-media summary onto the link payload (mutates + returns it). */
export function withPersistedMedia(channelPayload: unknown, persisted: PersistedMedia): Record<string, unknown> {
  const payload =
    channelPayload && typeof channelPayload === 'object'
      ? {...(channelPayload as Record<string, unknown>)}
      : {}
  const meta =
    payload._meta && typeof payload._meta === 'object'
      ? {...(payload._meta as Record<string, unknown>)}
      : {}
  const media =
    meta.media && typeof meta.media === 'object' ? {...(meta.media as Record<string, unknown>)} : {}
  media.download = {
    attachmentId: persisted.attachmentId,
    fileName: persisted.fileName,
    mimeType: persisted.mimeType,
    fileSize: persisted.fileSize,
    sha256: persisted.sha256,
    url: persisted.url,
    downloadedAt: new Date().toISOString(),
  }
  meta.media = media
  payload._meta = meta
  return payload
}

export function newMediaJobId(): string {
  return randomUUID()
}
