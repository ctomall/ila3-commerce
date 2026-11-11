import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'

export const metadata = {
  path: '/communications/me/attachments/[id]',
  GET: {
    requireAuth: true,
    // Same read gate as the inbox: bytes are only served to a caller who may
    // read the thread the attachment belongs to (checked below, per channel).
    requireFeatures: ['communication_channels.view'],
  },
}

/**
 * GET /api/communications/me/attachments/[id]
 *
 * Streams an inbound media attachment that the media worker persisted for a
 * channel message. The installed `/api/attachments/file/{id}` endpoint enforces
 * tenant/organization scope only, so any same-scope user could read another
 * employee's personal-mailbox attachment by UUID. This route reuses the inbox
 * visibility rule (shared channel or caller-owned channel, same organization
 * scope) before reading bytes, and masks every miss as 404.
 *
 * No new storage path: the bytes still live in the attachments partition the
 * installed module wrote; this only narrows who may ask for them.
 */
const MEDIA_ENTITY_ID = 'communication_channels.external_message'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type AttachmentMediaRow = {
  tenant_id?: unknown
  organization_id?: unknown
  entity_id?: unknown
  partition_code?: unknown
  storage_path?: unknown
  file_name?: unknown
  mime_type?: unknown
  file_size?: unknown
  channel_user_id?: unknown
  channel_organization_id?: unknown
}

type StorageDriverLike = {
  read(partitionCode: string, storagePath: string): Promise<{buffer: Buffer | Uint8Array}>
}

type StorageDriverFactoryLike = {
  resolveForPartition(
    partitionCode: string,
    scope: {tenantId: string; organizationId: string},
  ): Promise<StorageDriverLike>
}

function safeFileName(value: unknown): string {
  const raw = typeof value === 'string' && value.trim().length > 0 ? value.trim() : 'attachment'
  const base = raw.split(/[\\/]/).pop() ?? 'attachment'
  const cleaned = base.replace(/[\r\n"\\]/g, '_').slice(0, 120)
  return cleaned.length > 0 ? cleaned : 'attachment'
}

/**
 * HTTP headers are ByteStrings, so a CJK file name cannot go in a plain
 * `filename="…"` (it throws). RFC 6266/5987: ASCII fallback plus `filename*`.
 */
function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

export async function GET(
  req: Request,
  context: {params: Promise<{id?: string}>} | {params: {id?: string}},
): Promise<Response> {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub || !auth.tenantId) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401})
  }
  const params = await (context as {params: Promise<{id?: string}>}).params
  const id = params?.id
  // Malformed ids are masked exactly like unknown ones: no uuid cast error, no
  // existence leak.
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({error: 'Attachment not found'}, {status: 404})
  }

  const tenantId = auth.tenantId as string
  const organizationId = (auth as {orgId?: string | null}).orgId ?? null
  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const rows = (await em.getConnection().execute(
    `select a.tenant_id, a.organization_id, a.entity_id, a.partition_code, a.storage_path,
            a.file_name, a.mime_type, a.file_size,
            c.user_id as channel_user_id, c.organization_id as channel_organization_id
       from attachments a
       join external_messages m
         on a.entity_id = 'communication_channels.external_message'
        and a.record_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        and m.id = a.record_id::uuid
        and m.tenant_id = a.tenant_id
       join communication_channels c on c.id = m.channel_id and c.tenant_id = a.tenant_id
      where a.id = ? and a.tenant_id = ?
      limit 1`,
    [id, tenantId],
  )) as AttachmentMediaRow[]
  const row = rows[0]
  if (!row || String(row.entity_id ?? '') !== MEDIA_ENTITY_ID) {
    return NextResponse.json({error: 'Attachment not found'}, {status: 404})
  }

  // Inbox visibility rule, evaluated on the channel the message came from.
  const owner = row.channel_user_id == null ? null : String(row.channel_user_id)
  if (owner && owner !== auth.sub) {
    return NextResponse.json({error: 'Attachment not found'}, {status: 404})
  }
  const channelOrganization =
    row.channel_organization_id == null ? null : String(row.channel_organization_id)
  const organizationVisible = organizationId
    ? channelOrganization === organizationId || channelOrganization === null
    : channelOrganization === null
  if (!organizationVisible) {
    return NextResponse.json({error: 'Attachment not found'}, {status: 404})
  }

  let factory: StorageDriverFactoryLike | null = null
  try {
    factory = container.resolve<StorageDriverFactoryLike>('storageDriverFactory') ?? null
  } catch {
    factory = null
  }
  if (!factory) {
    return NextResponse.json({error: 'Attachment storage is unavailable'}, {status: 503})
  }

  const partitionCode = String(row.partition_code ?? '')
  const storagePath = String(row.storage_path ?? '')
  if (!partitionCode || !storagePath) {
    return NextResponse.json({error: 'Attachment not found'}, {status: 404})
  }

  let bytes: Buffer
  try {
    // Resolve the partition with the ATTACHMENT's own scope, not the caller's:
    // the media worker falls back to the tenant id for messages without an
    // organization, and the installed driver keys storage roots by these values.
    const driver = await factory.resolveForPartition(partitionCode, {
      tenantId: String(row.tenant_id ?? tenantId),
      organizationId: row.organization_id == null ? '' : String(row.organization_id),
    })
    const result = await driver.read(partitionCode, storagePath)
    bytes = Buffer.isBuffer(result.buffer) ? result.buffer : Buffer.from(result.buffer)
  } catch {
    return NextResponse.json({error: 'File not available'}, {status: 404})
  }
  if (bytes.byteLength === 0) {
    return NextResponse.json({error: 'File not available'}, {status: 404})
  }

  // Length from the bytes we actually hold: a stale row size must never make the
  // response advertise more than it sends.
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': contentDisposition(safeFileName(row.file_name)),
      'Content-Length': String(bytes.byteLength),
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=60',
    },
  })
}
