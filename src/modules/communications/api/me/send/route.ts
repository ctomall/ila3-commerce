import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'

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
  const send = container.resolve<SendAsUserFacade>('communicationChannelsSendAsUser')
  if (typeof send !== 'function') {
    return NextResponse.json(
      { error: 'Communication channel sending is unavailable' },
      { status: 503 },
    )
  }

  const organizationId = (auth as { orgId?: string | null }).orgId ?? null
  const channelMetadata = body.clientRequestId
    ? { ...(body.channelMetadata ?? {}), clientRequestId: body.clientRequestId }
    : body.channelMetadata

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
    return NextResponse.json(
      result.fieldErrors
        ? { error: result.error, fieldErrors: result.fieldErrors }
        : { error: result.error },
      { status: result.status },
    )
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
