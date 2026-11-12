import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import {
  claimSendRequest,
  completeSendRequest,
  computeSendPayloadHash,
  releaseSendRequest,
  SendLedgerUnavailableError,
} from '../../../lib/send-request'
import { checkCustomerWindow } from '../../../lib/send-window'
import { OutboundMediaError, uploadAttachmentAsMedia } from '../../../lib/outbound-media'
import { CommunicationChannel, ExternalConversation, MessageChannelLink } from '@open-mercato/core/modules/communication_channels/data/entities'
import { canActorReply } from '../../../lib/reply-permission-server'
import { sanitizeCallerChannelMetadata } from '../../../lib/channel-metadata'
import { checkOutboundBodyLength } from '../../../lib/outbound-body-limit'

function noNewlines(value: string): boolean {
  return !/[\r\n]/.test(value)
}

/**
 * One schema for a provider template, used by both the top-level `template`
 * field and the legacy `channelMetadata.template` fallback. The fallback exists
 * for older clients, but it must never skip validation: a template is what
 * waives the 24h customer-service window, so an unchecked value would be a
 * policy bypass.
 */
const templateSchema = z.object({
  name: z.string().min(1).max(512),
  language: z.string().min(1).max(32),
  components: z.array(z.unknown()).max(20).optional(),
})

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
   * Inbox conversation the reply was composed in (`external_conversations.id`).
   * Optional and additive: when supplied with `parentMessageId`, the server
   * verifies the quoted message belongs to that conversation so a crafted
   * parent id cannot file the outgoing message into another customer's thread.
   */
  threadId: z.string().uuid().optional(),
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
  template: templateSchema.optional(),
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
    // Reading the inbox is a prerequisite for replying, so the route guard keeps
    // the read feature. The reply capability itself is checked in the handler
    // (`canReply`): `communications.reply` OR the legacy
    // `communication_channels.connect_user_channel`. Expressing it as one guard
    // feature is impossible because the framework matches features with AND.
    // Ownership is enforced inside the hub facade, so neither grant can reach
    // another employee's mailbox.
    requireFeatures: ['communication_channels.view'],
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

  // A media or template message may carry no text: the provider sends the
  // attachment/template, and only the CRM needs a body to store. Synthesize a
  // minimal label instead of rejecting a send the provider would accept.
  const bodyText = body.body.plain ?? ''
  if (!bodyText && !body.body.html) {
    if (body.media) {
      body.body.plain = `[${body.media.kind}]`
    } else if (body.template) {
      body.body.plain = `模板 ${body.template.name}`
    } else {
      return NextResponse.json(
        { error: 'Either body.plain or body.html is required' },
        { status: 422 },
      )
    }
  }

  // Bind the client idempotency key to the request content. Computed AFTER the
  // body synthesis above so a media/template-only request hashes the same label
  // on every retry. The hash covers everything that changes what leaves the CRM;
  // a replay with any other channel/recipient/subject/body/template/media shape
  // is refused instead of being answered with the first message id.
  let templateMetadata = body.template
  if (!templateMetadata && body.channelMetadata && body.channelMetadata.template !== undefined) {
    const legacy = templateSchema.safeParse(body.channelMetadata.template)
    if (!legacy.success) {
      return NextResponse.json(
        {
          error:
            'channelMetadata.template is invalid; send the template in the top-level "template" field',
          code: 'TEMPLATE_INVALID',
          fieldErrors: { template: 'invalid template shape' },
        },
        { status: 422 },
      )
    }
    templateMetadata = legacy.data
  }
  // Sanitized caller metadata is forwarded to the hub, so it belongs in the
  // idempotency digest: a replay with the same key but different provider
  // options must be refused, not answered with the first message id.
  const callerChannelMetadata = sanitizeCallerChannelMetadata(body.channelMetadata)
  const payloadHash = computeSendPayloadHash({
    channelId: body.channelId,
    to: body.to,
    cc: body.cc,
    bcc: body.bcc,
    subject: body.subject,
    body: body.body,
    template: templateMetadata as
      | { name?: string; language?: string; components?: unknown[] }
      | undefined,
    media: body.media ?? null,
    parentMessageId: body.parentMessageId ?? null,
    ...(body.threadId ? { threadId: body.threadId } : {}),
    ...(Object.keys(callerChannelMetadata).length ? { channelMetadata: callerChannelMetadata } : {}),
  })

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

  // Reply permission split: a staff member who may read the shared inbox still
  // needs an explicit reply grant. The legacy connect capability is accepted
  // until roles are migrated to `communications.reply`; otherwise every current
  // employee would lose the ability to answer.
  const grantedReply = await canActorReply(
    { sub: auth.sub as string, tenantId: auth.tenantId as string | null, orgId: organizationId },
    container,
    { organizationId },
  )
  if (!grantedReply) {
    // Operationally useful and free of message content: an operator can tell a
    // read-only staff member from a misconfigured role without reading the body.
    console.warn('[communications] reply denied', {
      userId: auth.sub,
      tenantId: auth.tenantId ?? null,
      organizationId,
      path: '/api/communications/me/send',
    })
    return NextResponse.json(
      {
        error: 'You do not have permission to reply in this inbox',
        code: 'REPLY_FORBIDDEN',
      },
      { status: 403 },
    )
  }

  const hasTemplate = Boolean(templateMetadata)

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
  if (policyEm && body.threadId && body.parentMessageId) {
    // A quoted parent must belong to the conversation the caller says it is
    // replying in. Without this a crafted parentMessageId (same channel, other
    // conversation) would let the hub reuse that conversation's thread ref and
    // file the outgoing message into another customer's inbox thread.
    const parentLink = await policyEm.findOne(MessageChannelLink, {
      messageId: body.parentMessageId,
      tenantId: auth.tenantId as string,
      direction: 'inbound',
    } as never)
    const parentConversationId =
      (parentLink as { externalConversationId?: string | null } | null)?.externalConversationId ?? null
    const sameThread =
      parentConversationId === body.threadId &&
      Boolean(
        await policyEm.findOne(ExternalConversation, {
          id: body.threadId,
          tenantId: auth.tenantId as string,
          channelId: body.channelId,
        } as never),
      )
    if (!sameThread) {
      return NextResponse.json(
        {
          error: 'The quoted message does not belong to this conversation',
          code: 'PARENT_THREAD_MISMATCH',
        },
        { status: 422 },
      )
    }
  }
  if (policyEm) {
    // One channel read serves both the body-limit check and the template/media
    // shape rules below; the limit comes from the connector capability, so no
    // provider length is hard-coded here (design rev2 F3-01).
    const policyChannel = await policyEm.findOne(CommunicationChannel, {
      id: body.channelId,
      tenantId: auth.tenantId as string,
      organizationId,
      deletedAt: null,
    } as never)
    const limitViolation = checkOutboundBodyLength({
      providerKey: (policyChannel as { providerKey?: string } | null)?.providerKey,
      body: body.body,
    })
    if (limitViolation) {
      // Refuse before the ledger claim and the hub call: the platform would reject
      // this anyway, and the caller deserves the actual limit instead of a generic
      // provider failure.
      return NextResponse.json(
        {
          error: `正文超出该渠道上限：最多 ${limitViolation.maxLength} 字符（当前 ${limitViolation.actual}）`,
          code: limitViolation.code,
          maxLength: limitViolation.maxLength,
          actual: limitViolation.actual,
          providerKey: limitViolation.providerKey,
        },
        { status: 422 },
      )
    }
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
      const channelType = ((policyChannel as { channelType?: string } | null)?.channelType ?? '').toLowerCase()
      const messengerLinkOnly =
        hasMedia && channelType === 'messenger' && typeof body.media?.link === 'string'
      if (policyChannel && channelType !== 'whatsapp' && !messengerLinkOnly) {
        return NextResponse.json(
          {
            error: hasTemplate
              ? 'Templates are only supported on WhatsApp Business channels in this build'
              : channelType === 'messenger'
                ? 'Messenger media requires a public https link (media id upload is not supported)'
                : 'Media sends are only supported on WhatsApp Business and Messenger channels in this build',
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
    let claim: Awaited<ReturnType<typeof claimSendRequest>>
    try {
      claim = await claimSendRequest(dedupeEm, {
        tenantId: auth.tenantId as string,
        organizationId,
        userId: auth.sub as string,
        clientRequestId: body.clientRequestId,
        channelId: body.channelId,
        payloadHash,
      })
    } catch (error) {
      if (error instanceof SendLedgerUnavailableError) {
        // The module migration has not been applied to this database. Do not
        // send without the ledger: a timeout retry would become a duplicate.
        return NextResponse.json(
          {
            error: '发送暂不可用：数据库尚未完成初始化，请联系管理员后重试',
            code: 'SEND_LEDGER_UNAVAILABLE',
          },
          { status: 503 },
        )
      }
      throw error
    }
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
    if (claim.state === 'conflict') {
      // The key belongs to a different payload. Replaying would report the first
      // message id for a request that was never sent, so fail closed and make the
      // caller choose a new key.
      return NextResponse.json(
        {
          error:
            'This clientRequestId was already used for a different send; use a new clientRequestId',
          code: 'IDEMPOTENCY_KEY_REUSED',
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

  const channelMetadata = {
    // Routing fields are validated server-side; strip anything a caller could use
    // to redirect the recipient or forge threading headers (defence in depth).
    ...callerChannelMetadata,
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

  // The hub already accepted the message. If recording that on the idempotency
  // ledger fails, failing the request would invite a retry that can send again
  // once the in-flight lease expires; answer 202 and flag the missing record so
  // the operator reconciles it instead of retrying.
  let ledgerRecorded = true
  if (dedupeEm && claimId) {
    try {
      await completeSendRequest(dedupeEm, claimId, {
        messageId: result.messageId,
        messageThreadId: result.threadId,
      })
    } catch (error) {
      ledgerRecorded = false
      console.error(
        '[communications] send accepted but the idempotency ledger was not completed:',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  return NextResponse.json(
    {
      messageId: result.messageId,
      threadId: result.threadId,
      channelId: result.channelId,
      providerKey: result.providerKey,
      clientRequestId: body.clientRequestId ?? null,
      enqueuedForDelivery: true,
      ledgerRecorded,
      ...(ledgerRecorded
        ? {}
        : {
            warning:
              '发送已受理，但幂等台账未记录。请勿用同一 clientRequestId 重试；请联系管理员核对本次发送结果。',
          }),
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
