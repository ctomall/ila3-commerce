import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import {
  claimSendRequest,
  completeSendRequest,
  releaseSendRequest,
} from '../../../lib/send-request'
import { checkCustomerWindow } from '../../../lib/send-window'
import { OutboundMediaError, uploadAttachmentAsMedia } from '../../../lib/outbound-media'
import { CommunicationChannel } from '@open-mercato/core/modules/communication_channels/data/entities'

function noNewlines(value: string): boolean {
  return !/[\r\n]/.test(value)
}

const bodySchema = z.object({
  /** `CommunicationChannel.id` the caller owns; ownership is re-checked by the hub facade. */
  channelId: z.string().uuid(),
  /**
   * External recipient identifiers. Email channels expect addresses; chat
   * providers expect their own id form (E.164 for WhatsApp), so this facade
   * deliberately does not force `.email()` — the adapter validates the shape.
   */
  to: z.array(z.string().min(1).max(320)).min(1).max(20),
  cc: z.array(z.string().min(1).max(320)).max(20).optional(),
  bcc: z.array(z.string().min(1).max(320)).max(20).optional(),
  subject: z.string().min(1).max(500).refine(noNewlines, 'subject must not contain line breaks'),
  body: z.object({
    plain: z.string().max(50_000).optional(),
    html: z.string().max(200_000).optional(),
  }),
  inReplyTo: z.string().min(1).max(500).refine(noNewlines).optional(),
  references: z.array(z.string().min(1).max(500).refine(noNewlines)).optional(),
  /** `messages.message` id being replied to, so the reply joins that thread. */
  parentMessageId: z.string().uuid().optional(),
  /**
   * Caller-generated idempotency key. Echoed back and persisted on the channel
   * link metadata so a retry after a network timeout can be correlated before
   * durable de-duplication is added in a follow-up slice.
   */
  clientRequestId: z.string().min(8).max(128).optional(),
  /**
   * Approved provider template (WhatsApp/Messenger). Template sends are allowed
   * outside the 24h customer-service window; free-form text is not.
   */
  template: z
    .object({
      name: z.string().min(1).max(512),
      language: z.string().min(1).max(32),
      components: z.array(z.unknown()).max(20).optional(),
    })
    .optional(),
  /**
   * Outbound media (G3): an already-uploaded provider media id or a public https
   * link Meta fetches itself. Exactly one, because both at once is ambiguous.
   */
  media: z
    .object({
      /** Inferred from the attachment MIME type when omitted. */
      kind: z.enum(['image', 'audio', 'video', 'document']).optional(),
      id: z.string().regex(/^\d{1,64}$/).optional(),
      link: z.string().url().optional(),
      /** A CRM attachment: the BFF uploads its bytes and sends by media id. */
      attachmentId: z.string().uuid().optional(),
      fileName: z.string().min(1).max(255).optional(),
      caption: z.string().max(1024).optional(),
    })
    .refine(
      (value) => [value.id, value.link, value.attachmentId].filter(Boolean).length === 1,
      { message: 'media must carry exactly one of id, link or attachmentId' },
    )
    .optional(),
  channelMetadata: z.record(z.string(), z.unknown()).optional(),
})

export type SendAsUserFacadeInput = {
  userChannelId: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body: { plain?: string; html?: string; bodyFormat?: 'text' | 'markdown' }
  inReplyTo?: string
  references?: string[]
  parentMessageId?: string
  channelMetadata?: Record<string, unknown>
}

type SendAsUserFacadeResult =
  | { ok: true; messageId: string; threadId: string; channelId: string; providerKey: string }
  | { ok: false; status: number; error: string; fieldErrors?: Record<string, string> }

type SendAsUserFacade = (
  container: unknown,
  actor: { userId: string; tenantId: string; organizationId: string | null; auth?: unknown },
  input: SendAsUserFacadeInput,
) => Promise<SendAsUserFacadeResult>

export const metadata = {
  path: '/communications/me/send',
  POST: {
    requireAuth: true,
    // Own-mailbox send: the same feature that gates connecting and managing a
    // personal channel. Ownership is enforced inside the hub facade, so this
    // feature cannot reach another employee's mailbox.
    requireFeatures: ['communication_channels.connect_user_channel'],
  },
}

/**
 * POST /api/communications/me/send
 *
 * Mobile/employee entry point for replying through a channel the caller owns.
 * The installed `/communication_channels/send-as-user` route requires
 * `communication_channels.manage` (not granted to the `employee` role), which
 * would make an ordinary staff reply impossible. This additive facade keeps the
 * installed route untouched for existing admin callers and delegates to the same
 * `communicationChannelsSendAsUser` DI service, so authorization, mutation
 * guards, persistence and the outbound queue stay one implementation.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub || !auth?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await readJsonSafe(req, null))
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid request body' },
      { status: 422 },
    )
  }

  if (!body.body.plain && !body.body.html) {
    return NextResponse.json(
      { error: 'Either body.plain or body.html is required' },
      { status: 422 },
    )
  }

  const container = await createRequestContainer()
  let send: SendAsUserFacade | null = null
  try {
    const resolved = container.resolve<SendAsUserFacade>('communicationChannelsSendAsUser')
    if (typeof resolved === 'function') send = resolved
  } catch {
    // communication_channels is an optional module: without it there is no
    // facade, and a 500 would misreport an installation state as a crash.
    send = null
  }
  if (!send) {
    return NextResponse.json(
      { error: 'Communication channel sending is unavailable' },
      { status: 503 },
    )
  }

  const organizationId = (auth as { orgId?: string | null }).orgId ?? null
  const hasTemplate = Boolean(body.template) || Boolean(body.channelMetadata && body.channelMetadata.template)

  let requestEm: EntityManager | null = null
  const forkEm = (): EntityManager | null => {
    if (requestEm) return requestEm
    try {
      requestEm = (container.resolve('em') as EntityManager).fork()
    } catch {
      requestEm = null
    }
    return requestEm
  }

  // Provider customer-service window: WhatsApp/Messenger allow free-form text
  // only within 24h of the customer's last inbound message. Refuse early so the
  // caller can switch to an approved template, instead of queueing a send the
  // platform will reject.
  const policyEm = forkEm()
  if (policyEm) {
    if (!hasTemplate) {
      const policy = await checkCustomerWindow({
        em: policyEm,
        tenantId: auth.tenantId as string,
        organizationId,
        actorUserId: auth.sub as string,
        channelId: body.channelId,
        recipient: body.to[0],
        hasTemplate,
      })
      if (!policy.allowed) {
        return NextResponse.json(
          { error: policy.message, code: policy.code, lastInboundAt: policy.lastInboundAt },
          { status: 422 },
        )
      }
    }
    // Template/media shapes are provider-specific: WhatsApp Cloud API documents
    // both payloads; this Messenger connector has no equivalent, so refuse
    // instead of queueing a send the adapter cannot express.
    const hasMedia = Boolean(body.media)
    if (hasTemplate && hasMedia) {
      return NextResponse.json(
        {error: 'A message cannot carry a template and media at the same time', code: 'MEDIA_TEMPLATE_CONFLICT'},
        {status: 422},
      )
    }
    if (hasTemplate || hasMedia) {
      const shapedChannel = await policyEm.findOne(CommunicationChannel, {
        id: body.channelId,
        tenantId: auth.tenantId as string,
        organizationId,
        deletedAt: null,
      } as never)
      const channelType = (shapedChannel?.channelType ?? '').toLowerCase()
      if (shapedChannel && channelType !== 'whatsapp') {
        return NextResponse.json(
          {
            error: hasTemplate
              ? 'Templates are only supported on WhatsApp Business channels in this build'
              : 'Media sends are only supported on WhatsApp Business channels in this build',
            code: hasTemplate ? 'TEMPLATE_UNSUPPORTED' : 'MEDIA_UNSUPPORTED',
          },
          { status: 422 },
        )
      }
    }
  }

  // Idempotency: reserve the caller's key before the hub runs. A retry after a
  // timeout replays the first result instead of sending a second message.
  let dedupeEm: EntityManager | null = null
  let claimId: string | null = null
  if (body.clientRequestId) {
    dedupeEm = forkEm()
    if (!dedupeEm) {
      return NextResponse.json(
        { error: 'Idempotency store unavailable; retry without clientRequestId' },
        { status: 503 },
      )
    }
    const claim = await claimSendRequest(dedupeEm, {
      tenantId: auth.tenantId as string,
      organizationId,
      userId: auth.sub as string,
      clientRequestId: body.clientRequestId,
      channelId: body.channelId,
    })
    if (claim.state === 'replay') {
      return NextResponse.json(
        {
          messageId: claim.messageId,
          threadId: claim.messageThreadId,
          channelId: claim.channelId,
          clientRequestId: body.clientRequestId,
          enqueuedForDelivery: true,
          replayed: true,
        },
        { status: 200 },
      )
    }
    if (claim.state === 'in_flight') {
      return NextResponse.json(
        {
          error: 'A send with this clientRequestId is still in flight',
          clientRequestId: body.clientRequestId,
        },
        { status: 409 },
      )
    }
    claimId = claim.id
  }

  // Media by CRM attachment: the bytes live in our storage and Meta cannot fetch
  // them, so upload first and let the hub/adapter address the result by media id.
  // Runs AFTER the idempotency claim so a replayed clientRequestId never uploads
  // twice, and a definite refusal releases the claim like any other 4xx.
  let resolvedMedia: Record<string, unknown> | undefined = body.media
    ? {...body.media}
    : undefined
  if (body.media?.attachmentId) {
    const mediaEm = forkEm()
    if (!mediaEm) {
      return NextResponse.json(
        {error: 'Communication channel sending is unavailable', code: 'MEDIA_UPLOAD_FAILED'},
        {status: 503},
      )
    }
    try {
      const mediaChannel = await mediaEm.findOne(CommunicationChannel, {
        id: body.channelId,
        tenantId: auth.tenantId as string,
        organizationId,
        deletedAt: null,
      } as never)
      if (!mediaChannel) {
        if (dedupeEm && claimId) await releaseSendRequest(dedupeEm, claimId)
        return NextResponse.json(
          {error: 'Channel not found', code: 'CHANNEL_NOT_FOUND'},
          {status: 404},
        )
      }
      const attachmentService = container.resolve('attachmentService') as Parameters<
        typeof uploadAttachmentAsMedia
      >[0]['attachmentService']
      const credentialsService = container.resolve('integrationCredentialsService') as Parameters<
        typeof uploadAttachmentAsMedia
      >[0]['credentialsService']
      const resolved = await uploadAttachmentAsMedia({
        em: mediaEm,
        auth,
        attachmentService,
        credentialsService,
        channel: {
          providerKey: mediaChannel.providerKey,
          organizationId: mediaChannel.organizationId ?? null,
          tenantId: auth.tenantId as string,
          userId: mediaChannel.userId ?? null,
        },
        attachmentId: body.media.attachmentId,
        tenantId: auth.tenantId as string,
        caption: body.media.caption,
      })
      resolvedMedia = resolved as unknown as Record<string, unknown>
    } catch (error) {
      if (error instanceof OutboundMediaError) {
        if (dedupeEm && claimId && error.status < 500) {
          await releaseSendRequest(dedupeEm, claimId)
        }
        return NextResponse.json({error: error.message, code: error.code}, {status: error.status})
      }
      throw error
    }
  }

  const templateMetadata = body.template ?? (body.channelMetadata?.template as Record<string, unknown> | undefined)
  const channelMetadata = {
    ...(body.channelMetadata ?? {}),
    ...(templateMetadata ? { template: templateMetadata } : {}),
    ...(resolvedMedia ? { media: resolvedMedia } : {}),
    ...(body.clientRequestId ? { clientRequestId: body.clientRequestId } : {}),
  }

  const result = await send(
    container,
    { userId: auth.sub as string, tenantId: auth.tenantId as string, organizationId, auth },
    {
      userChannelId: body.channelId,
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      body: body.body,
      inReplyTo: body.inReplyTo,
      references: body.references,
      parentMessageId: body.parentMessageId,
      channelMetadata,
    },
  )

  if (!result.ok) {
    // Definite refusal: free the key so a corrected retry can proceed. A 5xx is
    // NOT released — the outcome is unknown and a blind retry could double-send.
    if (dedupeEm && claimId && result.status < 500) {
      await releaseSendRequest(dedupeEm, claimId)
    }
    return NextResponse.json(
      result.fieldErrors
        ? { error: result.error, fieldErrors: result.fieldErrors }
        : { error: result.error },
      { status: result.status },
    )
  }

  if (dedupeEm && claimId) {
    await completeSendRequest(dedupeEm, claimId, {
      messageId: result.messageId,
      messageThreadId: result.threadId,
    })
  }

  return NextResponse.json(
    {
      messageId: result.messageId,
      threadId: result.threadId,
      channelId: result.channelId,
      providerKey: result.providerKey,
      clientRequestId: body.clientRequestId ?? null,
      enqueuedForDelivery: true,
    },
    { status: 202 },
  )
}

export const openApi = {
  tags: ['Communications'],
  methods: {
    POST: {
      summary: 'Send a reply through a channel the current user owns',
      tags: ['Communications'],
      requestBody: { schema: bodySchema },
      responses: [
        { status: 202, description: 'Message persisted; outbound delivery enqueued' },
        { status: 401, description: 'Unauthorized' },
        { status: 403, description: 'Channel is not owned by the caller' },
        { status: 404, description: 'Channel not found in the caller scope' },
        { status: 409, description: 'Channel is in a non-deliverable transitional status' },
        { status: 422, description: 'Invalid body, or channel requires re-authorization' },
        { status: 503, description: 'Communication channel sending is unavailable' },
      ],
    },
  },
}
