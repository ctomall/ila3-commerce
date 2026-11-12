import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import {
  ChannelThreadMapping,
  CommunicationChannel,
  ExternalConversation,
  ExternalMessage,
  MessageChannelLink,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import { SendRequest } from '../data/entities'
import { computeSendPayloadHash } from '../lib/send-request'
import { OutboundMediaError, uploadAttachmentAsMedia } from '../lib/outbound-media'
import { CustomerEntity } from '@open-mercato/core/modules/customers/data/entities'
import { Message } from '@open-mercato/core/modules/messages/data/entities'

jest.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: jest.fn(),
}))

jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: jest.fn(),
}))

jest.mock('../lib/outbound-media', () => {
  class OutboundMediaError extends Error {
    code: string
    status: number
    constructor(status: number, code: string, message: string) {
      super(message)
      this.name = 'OutboundMediaError'
      this.status = status
      this.code = code
    }
  }
  return { OutboundMediaError, uploadAttachmentAsMedia: jest.fn() }
})

const mockAuth = getAuthFromRequest as jest.MockedFunction<typeof getAuthFromRequest>
const mockContainer = createRequestContainer as jest.MockedFunction<typeof createRequestContainer>

type Row = Record<string, unknown>

function createFakeEm(rows: {
  channels?: Row[]
  conversations?: Row[]
  links?: Row[]
  mappings?: Row[]
  messages?: Row[]
  /** Linked platform `messages.message` rows, read through MessageChannelLink. */
  platformMessages?: Row[]
  sendRequests?: Row[]
  customers?: Row[]
}) {
  const persisted: Row[] = []
  const removed: Row[] = []
  const created: Row[] = []
  const find = jest.fn(async (entity: unknown, where: Row = {}, options?: Row) => {
    if (entity === CommunicationChannel) return rows.channels ?? []
    if (entity === ExternalConversation) return rows.conversations ?? []
    if (entity === CustomerEntity) return rows.customers ?? []
    if (entity === MessageChannelLink) return rows.links ?? []
    if (entity === ChannelThreadMapping) return rows.mappings ?? []
    if (entity === ExternalMessage) {
      let list = rows.messages ?? []
      // Legacy fixtures omit conversationId; only filter rows that carry one so
      // per-conversation isolation can be asserted without rewriting them all.
      if (where.conversationId) {
        list = list.filter((row) => row.conversationId === undefined || row.conversationId === where.conversationId)
      }
      const cutoff = where.createdAt as Row | undefined
      if (cutoff?.$lt) list = list.filter((row) => new Date(row.createdAt as string) < new Date(cutoff.$lt as string))
      if (cutoff?.$gt) list = list.filter((row) => new Date(row.createdAt as string) > new Date(cutoff.$gt as string))
      const order = (options?.orderBy as Row | undefined)?.createdAt
      if (order === 'desc') list = [...list].sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime())
      if (order === 'asc') list = [...list].sort((a, b) => new Date(a.createdAt as string).getTime() - new Date(b.createdAt as string).getTime())
      return list
    }
    if (entity === Message) return rows.platformMessages ?? []
    throw new Error('unexpected entity in fake em.find')
  })
  const findOne = jest.fn(async (entity: unknown, where: Row) => {
    if (entity === ExternalConversation) {
      const list = rows.conversations ?? []
      if (where.id) return list.find((row) => row.id === where.id) ?? null
      return list[0] ?? null
    }
    if (entity === CommunicationChannel) return (rows.channels ?? [])[0] ?? null
    if (entity === CommunicationChannel) {
      const candidate = (rows.channels ?? [])[0] ?? null
      if (!candidate) return null
      if (where.id && candidate.id !== where.id) return null
      return candidate
    }
    if (entity === ExternalMessage) {
      const list = rows.messages ?? []
      const inbound = list.filter((row) => !where.direction || row.direction === where.direction)
      return inbound[0] ?? null
    }
    if (entity === CustomerEntity) return (rows.customers ?? [])[0] ?? null
    if (entity === SendRequest) {
      const candidates = [...(rows.sendRequests ?? []), ...created]
      if (where.id) return candidates.find((row) => row.id === where.id) ?? null
      return candidates.find((row) => row.clientRequestId === where.clientRequestId) ?? null
    }
    throw new Error(`unexpected entity in fake em.findOne: ${String(entity)} ${JSON.stringify(where)}`)
  })
  const create = jest.fn((entity: unknown, data: Row) => {
    if (entity !== SendRequest) throw new Error('unexpected entity in fake em.create')
    const row = { id: 'sr-1', createdAt: new Date(), ...data }
    created.push(row)
    return row
  })
  const persist = jest.fn((row: Row) => {
    persisted.push(row)
    return row
  })
  const remove = jest.fn((row: Row) => {
    removed.push(row)
    return row
  })
  const flush = jest.fn(async () => undefined)
  return { find, findOne, create, persist, remove, flush, persisted, removed }
}

function useContainer(
  resolve: (name: string) => unknown,
  em: ReturnType<typeof createFakeEm>,
  grantedFeatures: string[] = ['communication_channels.connect_user_channel'],
  rbacOverride?: { userHasAllFeatures: (userId: string, features: string[], scope: unknown) => Promise<boolean> },
) {
  // The reply split resolves the caller's RBAC grants inside the handler; tests
  // default to the legacy connect grant so existing send cases keep exercising
  // the hub path, and pass another list to prove reply-only / denied callers.
  const rbac = rbacOverride ?? {
    userHasAllFeatures: jest.fn(async (_userId: string, features: string[]) =>
      features.every((feature) => grantedFeatures.includes(feature)),
    ),
  }
  mockContainer.mockResolvedValue({
    resolve: (name: string) =>
      name === 'em' ? { fork: () => em } : name === 'rbacService' ? rbac : resolve(name),
  } as never)
  return rbac
}

const signedIn = { sub: 'u1', tenantId: 't1', orgId: 'o1', roles: ['employee'] } as never

describe('POST /api/communications/me/send', () => {
  const load = () => import('../api/me/send/route')

  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('rejects anonymous callers before touching the container', async () => {
    mockAuth.mockResolvedValue(null)
    const { POST } = await load()
    const res = await POST(new Request('http://localhost/api/communications/me/send', { method: 'POST' }))
    expect(res.status).toBe(401)
    expect(mockContainer).not.toHaveBeenCalled()
  })

  it('rejects a body with neither plain nor html text', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const { POST } = await load()
    const res = await POST(
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: '11111111-1111-4111-8111-111111111111',
          to: ['customer@example.test'],
          subject: 'Re: demo',
          body: {},
        }),
      }),
    )
    expect(res.status).toBe(422)
    expect(mockContainer).not.toHaveBeenCalled()
  })

  it('delegates to the hub facade, carries clientRequestId and returns 202', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = jest.fn(async () => ({
      ok: true as const,
      messageId: 'm1',
      threadId: 'th1',
      channelId: 'ch1',
      providerKey: 'imap',
    }))
    useContainer((name) => send, createFakeEm({}))
    const { POST } = await load()
    const res = await POST(
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: '11111111-1111-4111-8111-111111111111',
          to: ['customer@example.test'],
          subject: 'Re: demo',
          body: { plain: 'hello' },
          clientRequestId: 'req-12345678',
          // Routing keys are smuggled here on purpose: the BFF must strip them
          // before the hub ever sees the metadata (defence in depth).
          channelMetadata: {
            personId: 'p1',
            to: ['attacker@example.test'],
            cc: ['cc@example.test'],
            bcc: ['bcc@example.test'],
            subject: 'spoofed',
            inReplyTo: '<spoofed@example.test>',
            references: ['<spoofed@example.test>'],
            replyToExternalId: 'wamid.spoofed',
          },
        }),
      }),
    )
    expect(res.status).toBe(202)
    await expect(res.json()).resolves.toMatchObject({
      messageId: 'm1',
      threadId: 'th1',
      channelId: 'ch1',
      providerKey: 'imap',
      clientRequestId: 'req-12345678',
      enqueuedForDelivery: true,
    })
    const [, , input] = send.mock.calls[0] as unknown as [unknown, unknown, Record<string, unknown>]
    expect(input).toMatchObject({
      userChannelId: '11111111-1111-4111-8111-111111111111',
      to: ['customer@example.test'],
      subject: 'Re: demo',
      channelMetadata: { personId: 'p1', clientRequestId: 'req-12345678' },
    })
    // The smuggled routing fields are gone; the legitimate pass-through survives.
    const forwarded = (input as { channelMetadata: Record<string, unknown> }).channelMetadata
    for (const key of ['to', 'cc', 'bcc', 'subject', 'inReplyTo', 'references', 'replyToExternalId']) {
      expect(forwarded[key]).toBeUndefined()
    }
  })

  it('passes a facade refusal through with its status and field errors', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = jest.fn(async () => ({
      ok: false as const,
      status: 403,
      error: 'You can only send through channels you own',
    }))
    useContainer((name) => send, createFakeEm({}))
    const { POST } = await load()
    const res = await POST(
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: '11111111-1111-4111-8111-111111111111',
          to: ['customer@example.test'],
          subject: 'Re: demo',
          body: { plain: 'hello' },
        }),
      }),
    )
    expect(res.status).toBe(403)
  })

  it('reports the facade as unavailable instead of 500 when DI is missing', async () => {
    mockAuth.mockResolvedValue(signedIn)
    useContainer(() => {
      throw new Error('not registered')
    }, createFakeEm({}))
    const { POST } = await load()
    const res = await POST(
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: '11111111-1111-4111-8111-111111111111',
          to: ['customer@example.test'],
          subject: 'Re: demo',
          body: { plain: 'hello' },
        }),
      }),
    )
    expect(res.status).toBe(503)
  })

  it('answers 503 instead of 500 when the send ledger table is missing', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = jest.fn()
    const em = createFakeEm({})
    const original = em.findOne.getMockImplementation()!
    em.findOne.mockImplementation(async (entity: unknown, where: Row) => {
      if (entity === SendRequest) {
        throw Object.assign(new Error('relation "communications_send_requests" does not exist'), { code: '42P01' })
      }
      return original(entity, where)
    })
    useContainer((name) => send, em)
    const { POST } = await load()
    const res = await POST(
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: '11111111-1111-4111-8111-111111111111',
          to: ['customer@example.test'],
          subject: 'Re: demo',
          body: { plain: 'hello' },
          clientRequestId: 'req-ledger-missing',
        }),
      }),
    )
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ code: 'SEND_LEDGER_UNAVAILABLE' })
    expect(send).not.toHaveBeenCalled()
  })

  it('keeps the idempotency claim when the media upload outcome is unknown', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = jest.fn()
    const upload = uploadAttachmentAsMedia as jest.MockedFunction<typeof uploadAttachmentAsMedia>
    const em = createFakeEm({
      channels: [
        {
          id: 'ch-1',
          providerKey: 'whatsapp-business',
          channelType: 'whatsapp',
          organizationId: 'o1',
          userId: 'u1',
          status: 'connected',
          isActive: true,
          visibility: 'private',
        },
      ],
      // An inbound message inside the 24h window: the policy check must not be
      // the thing this test exercises.
      conversations: [{ id: 'conv-1' }],
      messages: [{ direction: 'inbound', createdAt: new Date() }],
    })
    useContainer(
      (name) =>
        name === 'attachmentService' || name === 'integrationCredentialsService' ? {} : send,
      em,
    )
    upload.mockRejectedValueOnce(new OutboundMediaError(503, 'MEDIA_UPLOAD_FAILED', 'media upload timed out'))
    const { POST } = await load()
    const request = () =>
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: '11111111-1111-4111-8111-111111111111',
          to: ['customer@example.test'],
          subject: 'Re: demo',
          body: { plain: 'hello' },
          media: { attachmentId: '123e4567-e89b-42d3-a456-426614174000' },
          clientRequestId: 'req-media-timeout',
        }),
      })
    const first = await POST(request())
    expect(first.status).toBe(503)
    await expect(first.json()).resolves.toMatchObject({ code: 'MEDIA_UPLOAD_FAILED' })
    expect(send).not.toHaveBeenCalled()
    // A 5xx upload outcome is unknown: the claim must NOT be released, so the
    // retry is refused as in-flight instead of uploading/sending twice.
    expect(em.removed).toHaveLength(0)
    const second = await POST(request())
    expect(second.status).toBe(409)
    expect(upload).toHaveBeenCalledTimes(1)
  })

  it('replays the first result when the same clientRequestId already sent', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = jest.fn(async () => ({ ok: true as const }))
    const em = createFakeEm({
      sendRequests: [
        {
          id: 'sr-old',
          clientRequestId: 'req-12345678',
          channelId: 'ch1',
          messageId: 'm-first',
          messageThreadId: 'th-first',
          createdAt: new Date(),
          payloadHash: computeSendPayloadHash({
            channelId: '11111111-1111-4111-8111-111111111111',
            to: ['customer@example.test'],
            subject: 'Re: demo',
            body: { plain: 'hello' },
          }),
        },
      ],
    })
    useContainer((name) => send, em)
    const { POST } = await load()
    const res = await POST(
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: '11111111-1111-4111-8111-111111111111',
          to: ['customer@example.test'],
          subject: 'Re: demo',
          body: { plain: 'hello' },
          clientRequestId: 'req-12345678',
        }),
      }),
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      messageId: 'm-first',
      threadId: 'th-first',
      replayed: true,
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses the same clientRequestId when the caller metadata changed', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = jest.fn(async () => ({ ok: true as const }))
    const em = createFakeEm({
      sendRequests: [
        {
          id: 'sr-meta',
          clientRequestId: 'req-12345678',
          channelId: 'ch1',
          messageId: 'm-first',
          messageThreadId: 'th-first',
          createdAt: new Date(),
          payloadHash: computeSendPayloadHash({
            channelId: '11111111-1111-4111-8111-111111111111',
            to: ['customer@example.test'],
            subject: 'Re: demo',
            body: { plain: 'hello' },
            channelMetadata: { providerOption: 'a' },
          }),
        },
      ],
    })
    useContainer((name) => send, em)
    const { POST } = await load()
    const res = await POST(
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: '11111111-1111-4111-8111-111111111111',
          to: ['customer@example.test'],
          subject: 'Re: demo',
          body: { plain: 'hello' },
          clientRequestId: 'req-12345678',
          channelMetadata: { providerOption: 'b' },
        }),
      }),
    )
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })
    expect(send).not.toHaveBeenCalled()
  })

  it('replays when the caller metadata is identical', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = jest.fn(async () => ({ ok: true as const }))
    const metadata = { providerOption: 'a', templateVars: ['Ada'] }
    const em = createFakeEm({
      sendRequests: [
        {
          id: 'sr-meta-same',
          clientRequestId: 'req-12345678',
          channelId: 'ch1',
          messageId: 'm-first',
          messageThreadId: 'th-first',
          createdAt: new Date(),
          payloadHash: computeSendPayloadHash({
            channelId: '11111111-1111-4111-8111-111111111111',
            to: ['customer@example.test'],
            subject: 'Re: demo',
            body: { plain: 'hello' },
            channelMetadata: metadata,
          }),
        },
      ],
    })
    useContainer((name) => send, em)
    const { POST } = await load()
    const res = await POST(
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: '11111111-1111-4111-8111-111111111111',
          to: ['customer@example.test'],
          subject: 'Re: demo',
          body: { plain: 'hello' },
          clientRequestId: 'req-12345678',
          // Different key order must not create a false conflict.
          channelMetadata: { templateVars: ['Ada'], providerOption: 'a' },
        }),
      }),
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ replayed: true, messageId: 'm-first' })
    expect(send).not.toHaveBeenCalled()
  })

  it('answers 409 while the first attempt is still in flight', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = jest.fn(async () => ({ ok: true as const }))
    const em = createFakeEm({
      sendRequests: [
        {
          id: 'sr-live',
          clientRequestId: 'req-12345678',
          channelId: 'ch1',
          messageId: null,
          createdAt: new Date(),
        },
      ],
    })
    useContainer((name) => send, em)
    const { POST } = await load()
    const res = await POST(
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: '11111111-1111-4111-8111-111111111111',
          to: ['customer@example.test'],
          subject: 'Re: demo',
          body: { plain: 'hello' },
          clientRequestId: 'req-12345678',
        }),
      }),
    )
    expect(res.status).toBe(409)
    expect(send).not.toHaveBeenCalled()
  })

  it('releases the key after a definite refusal so a fixed retry can send', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = jest.fn(async () => ({ ok: false as const, status: 422, error: 'channel requires reauth' }))
    const em = createFakeEm({ sendRequests: [] })
    useContainer((name) => send, em)
    const { POST } = await load()
    const res = await POST(
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: '11111111-1111-4111-8111-111111111111',
          to: ['customer@example.test'],
          subject: 'Re: demo',
          body: { plain: 'hello' },
          clientRequestId: 'req-12345678',
        }),
      }),
    )
    expect(res.status).toBe(422)
    expect(em.removed).toHaveLength(1)
  })

  it('answers 202 with a warning when the ledger completion write fails after the hub accepted', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = jest.fn(async () => ({
      ok: true as const,
      messageId: 'm-accepted',
      threadId: 'th-accepted',
      channelId: '11111111-1111-4111-8111-111111111111',
      providerKey: 'imap',
    }))
    const em = createFakeEm({ sendRequests: [] })
    const realFlush = em.flush.getMockImplementation()!
    let flushes = 0
    em.flush.mockImplementation(async () => {
      flushes += 1
      // First flush is the claim, the second is the completion write.
      if (flushes === 2) throw new Error('ledger write failed')
      return realFlush()
    })
    useContainer((name) => send, em)
    const { POST } = await load()
    const request = () =>
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: '11111111-1111-4111-8111-111111111111',
          to: ['customer@example.test'],
          subject: 'Re: demo',
          body: { plain: 'hello' },
          clientRequestId: 'req-ledger-write-fail',
        }),
      })
    const res = await POST(request())
    expect(res.status).toBe(202)
    const payload = await res.json()
    expect(payload).toMatchObject({ messageId: 'm-accepted', ledgerRecorded: false })
    expect(String(payload.warning)).toContain('请勿用同一 clientRequestId 重试')
    expect(send).toHaveBeenCalledTimes(1)
    // A real flush failure leaves the row without messageId (in-flight); this
    // fake mutates in memory, so only the single send is asserted here. The
    // in-flight refusal itself is covered by the lease tests.
    expect(em.persisted).toHaveLength(1)
  })

  it('keeps the key when the facade outcome is unknown so a retry cannot double-send', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = jest.fn(async () => ({ ok: false as const, status: 503, error: 'hub unavailable' }))
    const em = createFakeEm({ sendRequests: [] })
    useContainer((name) => send, em)
    const { POST } = await load()
    const request = () =>
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: '11111111-1111-4111-8111-111111111111',
          to: ['customer@example.test'],
          subject: 'Re: demo',
          body: { plain: 'hello' },
          clientRequestId: 'req-network-drop',
        }),
      })
    const first = await POST(request())
    expect(first.status).toBe(503)
    // The hub may have accepted the message before the connection dropped; the
    // claim must survive so the retry replays instead of sending twice.
    expect(em.removed).toHaveLength(0)
    const second = await POST(request())
    expect(second.status).toBe(409)
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('GET /api/communications/me/threads', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('lists conversations of own and tenant-wide channels only', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const em = createFakeEm({
      channels: [
        { id: 'ch-own', userId: 'u1', providerKey: 'imap', channelType: 'email', displayName: '我的邮箱', visibility: 'private' },
        { id: 'ch-team', userId: null, providerKey: 'whatsapp', channelType: 'chat', displayName: '团队 WABA', visibility: 'shared' },
      ],
      conversations: [
        { id: 'conv-1', channelId: 'ch-own', externalConversationId: 'x1', subject: 'Demo', contactPersonId: 'p1', lastMessageAt: new Date('2026-11-09T10:00:00Z'), createdAt: new Date('2026-11-09T09:00:00Z') },
      ],
      links: [{ externalConversationId: 'conv-1', messageId: 'msg-1', createdAt: new Date('2026-11-09T10:00:00Z') }],
      mappings: [{ externalConversationId: 'conv-1', messageThreadId: 'th-1' }],
      customers: [{ id: 'p1', displayName: '客户甲', kind: 'person' }],
    })
    useContainer(() => undefined, em)
    const { GET } = await import('../api/me/threads/route')
    const res = await GET(new Request('http://localhost/api/communications/me/threads?limit=10'))
    expect(res.status).toBe(200)
    const payload = await res.json()
    expect(payload.items).toHaveLength(1)
    expect(payload.items[0]).toMatchObject({
      id: 'conv-1',
      lastMessageId: 'msg-1',
      lastMessageThreadId: 'th-1',
      customer: { id: 'p1', displayName: '客户甲', kind: 'person' },
      channel: { id: 'ch-own', providerKey: 'imap', visibility: 'private' },
    })
    const channelWhere = (em.find.mock.calls[0] as unknown[])[1]
    expect(JSON.stringify(channelWhere)).toContain('"userId":null')
    expect(JSON.stringify(channelWhere)).toContain('"userId":"u1"')
    const conversationWhere = (em.find.mock.calls[1] as unknown[])[1] as { channelId: { $in: string[] } }
    expect(conversationWhere.channelId.$in).toEqual(['ch-own', 'ch-team'])
  })

  it('rejects a malformed before cursor without querying', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const em = createFakeEm({})
    useContainer(() => undefined, em)
    const { GET } = await import('../api/me/threads/route')
    const res = await GET(new Request('http://localhost/api/communications/me/threads?before=not-a-date'))
    expect(res.status).toBe(422)
    expect(em.find).not.toHaveBeenCalled()
  })

  it('returns an empty page when the caller has no visible channel', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const em = createFakeEm({ channels: [] })
    useContainer(() => undefined, em)
    const { GET } = await import('../api/me/threads/route')
    const res = await GET(new Request('http://localhost/api/communications/me/threads'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ items: [], nextBefore: null, total: 0 })
  })
})

describe('GET /api/communications/me/threads/[id]/messages', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  const params = { params: { id: 'conv-1' } }

  it('masks a conversation backed by another employee personal mailbox', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const em = createFakeEm({
      conversations: [{ id: 'conv-1', channelId: 'ch-other', externalConversationId: 'x1' }],
      channels: [{ id: 'ch-other', userId: 'u2', providerKey: 'imap', channelType: 'email', displayName: '别人的邮箱', status: 'connected', visibility: 'shared' }],
    })
    useContainer(() => undefined, em)
    const { GET } = await import('../api/me/threads/[id]/messages/route')
    const res = await GET(new Request('http://localhost/api/communications/me/threads/conv-1/messages'), params)
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Conversation not found' })
  })

  it('masks a malformed conversation id instead of throwing a uuid cast error', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const em = createFakeEm({})
    em.findOne.mockRejectedValueOnce(Object.assign(new Error('invalid input syntax for type uuid'), { code: '22P02' }))
    useContainer(() => undefined, em)
    const { GET } = await import('../api/me/threads/[id]/messages/route')
    const res = await GET(
      new Request('http://localhost/api/communications/me/threads/not-a-uuid/messages'),
      { params: { id: 'not-a-uuid' } },
    )
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Conversation not found' })
  })

  it('returns message metadata with the platform message id and next cursor', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const createdAt = new Date('2026-11-09T10:00:00Z')
    const em = createFakeEm({
      conversations: [{ id: 'conv-1', channelId: 'ch-own', externalConversationId: 'x1', subject: 'Demo' }],
      channels: [{ id: 'ch-own', userId: 'u1', providerKey: 'imap', channelType: 'email', displayName: '我的邮箱', status: 'connected', visibility: 'private', capabilities: {fileSharing: true, realtimePush: false} }],
      messages: [
        { id: 'em-1', direction: 'inbound', externalMessageId: 'ext-1', senderIdentifier: 'customer@example.test', senderDisplayName: '客户', providerTimestamp: createdAt, createdAt },
        { id: 'em-2', direction: 'outbound', externalMessageId: 'ext-2', senderIdentifier: 'me@example.test', senderDisplayName: '我', providerTimestamp: null, createdAt: new Date('2026-11-09T10:05:00Z') },
      ],
      links: [{
        externalMessageId: 'em-1',
        messageId: 'msg-1',
        deliveryStatus: 'delivered',
        channelContentType: 'application/pdf',
        channelPayload: {_meta: {media: {id: 'media-1', kind: 'document', mimeType: 'application/pdf', fileName: '报价单.pdf'}}},
      }],
    })
    useContainer(() => undefined, em)
    const { GET } = await import('../api/me/threads/[id]/messages/route')
    const res = await GET(new Request('http://localhost/api/communications/me/threads/conv-1/messages?limit=2'), params)
    expect(res.status).toBe(200)
    const payload = await res.json()
    expect(payload.items).toHaveLength(2)
    expect(payload.items[0]).toMatchObject({
      id: 'em-1',
      messageId: 'msg-1',
      deliveryStatus: 'delivered',
      media: {kind: 'document', fileName: '报价单.pdf', mimeType: 'application/pdf', externalId: 'media-1', downloaded: false},
    })
    expect(payload.channel.capabilities).toMatchObject({fileSharing: true})
    expect(payload.nextAfter).toBe('2026-11-09T10:05:00.000Z')
    expect(payload.nextBefore).toBeNull()
  })

  it('never leaks another conversation body into the requested thread', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const createdAt = new Date('2026-11-09T10:00:00Z')
    const em = createFakeEm({
      conversations: [
        { id: 'conv-a', channelId: 'ch-a', externalConversationId: 'xa', subject: 'A' },
        { id: 'conv-b', channelId: 'ch-b', externalConversationId: 'xb', subject: 'B' },
      ],
      channels: [
        { id: 'ch-a', userId: 'u1', providerKey: 'imap', channelType: 'email', status: 'connected', visibility: 'private' },
        { id: 'ch-b', userId: 'u1', providerKey: 'imap', channelType: 'email', status: 'connected', visibility: 'private' },
      ],
      messages: [
        { id: 'em-a', conversationId: 'conv-a', direction: 'inbound', externalMessageId: 'ext-a', senderIdentifier: 'a@example.test', createdAt },
        { id: 'em-b', conversationId: 'conv-b', direction: 'inbound', externalMessageId: 'ext-b', senderIdentifier: 'b@example.test', createdAt },
      ],
      links: [
        { externalMessageId: 'em-a', messageId: 'msg-a' },
        { externalMessageId: 'em-b', messageId: 'msg-b' },
      ],
      platformMessages: [
        { id: 'msg-a', subject: 'A', body: 'A secret', bodyFormat: 'text', tenantId: 't1', organizationId: 'o1', deletedAt: null },
        { id: 'msg-b', subject: 'B', body: 'B secret', bodyFormat: 'text', tenantId: 't1', organizationId: 'o1', deletedAt: null },
      ],
    })
    useContainer(() => undefined, em)
    const { GET } = await import('../api/me/threads/[id]/messages/route')
    const res = await GET(
      new Request('http://localhost/api/communications/me/threads/conv-a/messages'),
      { params: Promise.resolve({ id: 'conv-a' }) } as never,
    )
    expect(res.status).toBe(200)
    const payload = await res.json()
    expect(payload.items).toHaveLength(1)
    expect(payload.items[0]).toMatchObject({ id: 'em-a', body: 'A secret' })
    expect(JSON.stringify(payload)).not.toContain('B secret')
  })

  it('returns the linked message body, subject and tenant-scoped read; unlinked items stay null', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const createdAt = new Date('2026-11-09T10:00:00Z')
    const em = createFakeEm({
      conversations: [{ id: 'conv-1', channelId: 'ch-own', externalConversationId: 'x1', subject: 'Demo' }],
      channels: [{ id: 'ch-own', userId: 'u1', providerKey: 'imap', channelType: 'email', displayName: '我的邮箱', status: 'connected', visibility: 'private' }],
      messages: [
        { id: 'em-1', direction: 'inbound', externalMessageId: 'ext-1', senderIdentifier: 'customer@example.test', createdAt },
        { id: 'em-2', direction: 'outbound', externalMessageId: 'ext-2', senderIdentifier: 'me@example.test', createdAt: new Date('2026-11-09T10:05:00Z') },
      ],
      links: [
        { externalMessageId: 'em-1', messageId: 'msg-1', deliveryStatus: 'delivered' },
        // A dangling link (deleted message / foreign tenant) must not 500 the page.
        { externalMessageId: 'em-2', messageId: 'msg-missing', deliveryStatus: 'pending' },
      ],
      platformMessages: [
        { id: 'msg-1', subject: '报价', body: '您好，价格是 100 元。', bodyFormat: 'text', tenantId: 't1', organizationId: 'o1', deletedAt: null },
      ],
    })
    useContainer(() => undefined, em)
    const { GET } = await import('../api/me/threads/[id]/messages/route')
    const res = await GET(new Request('http://localhost/api/communications/me/threads/conv-1/messages'), params)
    expect(res.status).toBe(200)
    const payload = await res.json()
    expect(payload.items[0]).toMatchObject({
      id: 'em-1',
      body: '您好，价格是 100 元。',
      bodyText: '您好，价格是 100 元。',
      bodyFormat: 'text',
      subject: '报价',
    })
    expect(payload.items[1]).toMatchObject({
      id: 'em-2',
      body: null,
      bodyText: null,
      bodyFormat: null,
      subject: null,
    })
    const platformRead = (em.find.mock.calls as unknown[][]).find(([entity]) => entity === Message)
    expect(platformRead).toBeTruthy()
    const where = platformRead![1] as { tenantId: string; deletedAt: unknown; organizationId?: unknown }
    expect(where.tenantId).toBe('t1')
    expect(where.deletedAt).toBeNull()
    expect(JSON.stringify(where.organizationId)).toContain('o1')
  })

  it('pages from the newest window and exposes an older cursor', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const em = createFakeEm({
      conversations: [{ id: 'conv-1', channelId: 'ch-own', externalConversationId: 'x1', subject: 'Demo' }],
      channels: [{ id: 'ch-own', userId: 'u1', providerKey: 'imap', channelType: 'email', displayName: '我的邮箱', status: 'connected', visibility: 'private' }],
      messages: [
        { id: 'em-1', direction: 'inbound', externalMessageId: 'ext-1', senderIdentifier: 'a@example.test', createdAt: new Date('2026-11-09T10:00:00Z') },
        { id: 'em-2', direction: 'outbound', externalMessageId: 'ext-2', senderIdentifier: 'b@example.test', createdAt: new Date('2026-11-09T10:05:00Z') },
        { id: 'em-3', direction: 'inbound', externalMessageId: 'ext-3', senderIdentifier: 'a@example.test', createdAt: new Date('2026-11-09T10:10:00Z') },
      ],
      links: [
        { externalMessageId: 'em-1', messageId: 'msg-1' },
        { externalMessageId: 'em-2', messageId: 'msg-2' },
        { externalMessageId: 'em-3', messageId: 'msg-3' },
      ],
      platformMessages: [],
    })
    useContainer(() => undefined, em)
    const { GET } = await import('../api/me/threads/[id]/messages/route')
    const first = await GET(new Request('http://localhost/api/communications/me/threads/conv-1/messages?limit=2'), params)
    expect(first.status).toBe(200)
    const page1 = await first.json()
    expect(page1.items.map((i: { id: string }) => i.id)).toEqual(['em-2', 'em-3'])
    expect(page1.nextBefore).toBe('2026-11-09T10:05:00.000Z')
    const older = await GET(
      new Request(`http://localhost/api/communications/me/threads/conv-1/messages?limit=2&before=${encodeURIComponent(page1.nextBefore)}`),
      params,
    )
    expect(older.status).toBe(200)
    const page2 = await older.json()
    expect(page2.items.map((i: { id: string }) => i.id)).toEqual(['em-1'])
    expect(page2.nextBefore).toBeNull()
  })

  it('flattens an html body to sanitized plain text and never returns raw html', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const createdAt = new Date('2026-11-09T10:00:00Z')
    const em = createFakeEm({
      conversations: [{ id: 'conv-1', channelId: 'ch-own', externalConversationId: 'x1', subject: 'Demo' }],
      channels: [{ id: 'ch-own', userId: 'u1', providerKey: 'imap', channelType: 'email', displayName: '我的邮箱', status: 'connected', visibility: 'private' }],
      messages: [{ id: 'em-1', direction: 'inbound', externalMessageId: 'ext-1', senderIdentifier: 'customer@example.test', createdAt }],
      links: [{ externalMessageId: 'em-1', messageId: 'msg-1', deliveryStatus: 'delivered' }],
      platformMessages: [{
        id: 'msg-1',
        subject: '',
        body: '<p>Hello <b>世界</b></p><script>alert(1)</script>',
        bodyFormat: 'html',
        tenantId: 't1',
        organizationId: 'o1',
        deletedAt: null,
      }],
    })
    useContainer(() => undefined, em)
    const { GET } = await import('../api/me/threads/[id]/messages/route')
    const res = await GET(new Request('http://localhost/api/communications/me/threads/conv-1/messages'), params)
    expect(res.status).toBe(200)
    const payload = await res.json()
    expect(payload.items[0].body).toBeNull()
    expect(payload.items[0].bodyFormat).toBe('html')
    expect(payload.items[0].subject).toBeNull()
    expect(payload.items[0].bodyText).toContain('Hello')
    expect(payload.items[0].bodyText).toContain('世界')
    expect(payload.items[0].bodyText).not.toContain('<')
    expect(payload.items[0].bodyText).not.toContain('alert(1)')
  })

  it('rejects a malformed after cursor', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const em = createFakeEm({})
    useContainer(() => undefined, em)
    const { GET } = await import('../api/me/threads/[id]/messages/route')
    const res = await GET(new Request('http://localhost/api/communications/me/threads/conv-1/messages?after=nope'), params)
    expect(res.status).toBe(422)
    expect(em.findOne).not.toHaveBeenCalled()
  })
})

// Keep the NextResponse import used so the test file fails loudly if the
// runtime helper ever stops being importable under jest.
it('has a working NextResponse helper', () => {
  expect(NextResponse.json({ ok: true }).status).toBe(200)
})

describe('customer-service window policy', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })
  const base = {
    channelId: '11111111-1111-4111-8111-111111111111',
    to: ['+15550001111'],
    subject: 'hi',
    body: { plain: 'hello' },
  }
  const sendOk = () =>
    jest.fn(async () => ({ ok: true as const, messageId: 'm1', threadId: 't1', channelId: 'ch1', providerKey: 'whatsapp' }))

  function waRows(lastInbound: Date | null) {
    return {
      channels: [{ id: '11111111-1111-4111-8111-111111111111', userId: 'u1', channelType: 'whatsapp', providerKey: 'whatsapp-business' }],
      conversations: [{ id: 'conv-1', channelId: '11111111-1111-4111-8111-111111111111', externalConversationId: '+15550001111' }],
      messages: lastInbound ? [{ id: 'em-1', direction: 'inbound', conversationId: 'conv-1', createdAt: lastInbound }] : [],
    }
  }

  it('sends to a provider-native recipient through the hub within the window (G8 closed)', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = sendOk()
    useContainer(() => send, createFakeEm(waRows(new Date(Date.now() - 60 * 60 * 1000))))
    const { POST } = await import('../api/me/send/route')
    const res = await POST(new Request('http://localhost/api/communications/me/send', { method: 'POST', body: JSON.stringify(base) }))
    expect(res.status).toBe(202)
    expect(send).toHaveBeenCalledTimes(1)
    const call = (send.mock.calls as unknown as Array<[unknown, unknown, Record<string, unknown>]>)[0]
    const input = call[2]
    // The wa_id travels unchanged: the hub validates it against the adapter's
    // provider-native recipient shape, not against an e-mail regex.
    expect(input.to).toEqual(['+15550001111'])
    await expect(res.json()).resolves.toMatchObject({providerKey: 'whatsapp', enqueuedForDelivery: true})
  })

  it('accepts a reply grant without the legacy connect capability', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = sendOk()
    useContainer(() => send, createFakeEm(waRows(new Date(Date.now() - 60 * 60 * 1000))), ['communications.reply'])
    const { POST } = await import('../api/me/send/route')
    const res = await POST(
      new Request('http://localhost/api/communications/me/send', { method: 'POST', body: JSON.stringify(base) }),
    )
    expect(res.status).toBe(202)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('refuses a read-only caller with REPLY_FORBIDDEN and never reaches the hub', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = sendOk()
    useContainer(() => send, createFakeEm(waRows(new Date(Date.now() - 60 * 60 * 1000))), [])
    const { POST } = await import('../api/me/send/route')
    const res = await POST(
      new Request('http://localhost/api/communications/me/send', { method: 'POST', body: JSON.stringify(base) }),
    )
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({code: 'REPLY_FORBIDDEN'})
    expect(send).not.toHaveBeenCalled()
  })

  it('fails closed with 403 when the reply permission check itself throws', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = sendOk()
    useContainer(() => send, createFakeEm(waRows(new Date(Date.now() - 60 * 60 * 1000))), [], {
      userHasAllFeatures: async () => {
        throw new Error('rbac unavailable')
      },
    })
    const { POST } = await import('../api/me/send/route')
    const res = await POST(
      new Request('http://localhost/api/communications/me/send', { method: 'POST', body: JSON.stringify(base) }),
    )
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({code: 'REPLY_FORBIDDEN'})
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects free-form text after the window with WINDOW_CLOSED and never calls the hub', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = sendOk()
    useContainer(() => send, createFakeEm(waRows(new Date(Date.now() - 30 * 60 * 60 * 1000))))
    const { POST } = await import('../api/me/send/route')
    const res = await POST(new Request('http://localhost/api/communications/me/send', { method: 'POST', body: JSON.stringify(base) }))
    expect(res.status).toBe(422)
    const payload = await res.json()
    expect(payload.code).toBe('WINDOW_CLOSED')
    expect(send).not.toHaveBeenCalled()
  })

  it('skips the window for a template send and hands the template to the hub', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = sendOk()
    useContainer(() => send, createFakeEm(waRows(new Date(Date.now() - 30 * 60 * 60 * 1000))))
    const { POST } = await import('../api/me/send/route')
    const template = {name: 'quote_followup', language: 'zh_CN'}
    const res = await POST(
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({...base, template}),
      }),
    )
    expect(res.status).toBe(202)
    expect(send).toHaveBeenCalledTimes(1)
    const call = (send.mock.calls as unknown as Array<[unknown, unknown, Record<string, unknown>]>)[0]
    const input = call[2]
    expect((input.channelMetadata as Record<string, unknown>).template).toEqual(template)
  })

  it('rejects an invalid legacy channelMetadata.template instead of skipping the window', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = sendOk()
    useContainer(() => send, createFakeEm(waRows(new Date(Date.now() - 30 * 60 * 60 * 1000))))
    const { POST } = await import('../api/me/send/route')
    const res = await POST(
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({...base, channelMetadata: {template: {name: 42}}}),
      }),
    )
    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toMatchObject({code: 'TEMPLATE_INVALID'})
    // A malformed template must never be the reason the 24h window check is skipped.
    expect(send).not.toHaveBeenCalled()
  })

  it('accepts a legacy channelMetadata.template only after validating it', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = sendOk()
    useContainer(() => send, createFakeEm(waRows(new Date(Date.now() - 30 * 60 * 60 * 1000))))
    const { POST } = await import('../api/me/send/route')
    const legacy = {name: 'legacy_template', language: 'zh_CN'}
    const res = await POST(
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({...base, channelMetadata: {template: legacy}}),
      }),
    )
    expect(res.status).toBe(202)
    const call = (send.mock.calls as unknown as Array<[unknown, unknown, Record<string, unknown>]>)[0]
    expect((call[2].channelMetadata as Record<string, unknown>).template).toEqual(legacy)
  })

  it('sends a media message with no text and stores a label body', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = sendOk()
    useContainer(() => send, createFakeEm(waRows(new Date(Date.now() - 60 * 60 * 1000))))
    const {POST} = await import('../api/me/send/route')
    const res = await POST(
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({...base, body: {}, media: {kind: 'image', link: 'https://cdn.example.test/a.png'}}),
      }),
    )
    expect(res.status).toBe(202)
    const call = (send.mock.calls as unknown as Array<[unknown, unknown, Record<string, unknown>]>)[0]
    expect((call[2].body as Record<string, unknown>).plain).toBe('[image]')
  })

  it('refuses a template on a non-WhatsApp channel instead of queueing it', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = sendOk()
    useContainer(
      () => send,
      createFakeEm({
        channels: [{id: '11111111-1111-4111-8111-111111111111', userId: 'u1', channelType: 'messenger', providerKey: 'messenger'}],
      }),
    )
    const {POST} = await import('../api/me/send/route')
    const res = await POST(
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({...base, template: {name: 'quote_followup', language: 'en'}}),
      }),
    )
    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toMatchObject({code: 'TEMPLATE_UNSUPPORTED'})
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses media on a non-WhatsApp channel and a template+media conflict', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = sendOk()
    useContainer(
      () => send,
      createFakeEm({
        channels: [{id: '11111111-1111-4111-8111-111111111111', userId: 'u1', channelType: 'messenger', providerKey: 'messenger'}],
        conversations: [{id: 'conv-1', channelId: '11111111-1111-4111-8111-111111111111', externalConversationId: '+15550001111'}],
        messages: [{id: 'em-1', direction: 'inbound', conversationId: 'conv-1', createdAt: new Date(Date.now() - 60 * 60 * 1000)}],
      }),
    )
    const {POST} = await import('../api/me/send/route')
    const mediaRes = await POST(
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({...base, media: {kind: 'image', id: '123'}}),
      }),
    )
    expect(mediaRes.status).toBe(422)
    await expect(mediaRes.json()).resolves.toMatchObject({code: 'MEDIA_UNSUPPORTED'})
    expect(send).not.toHaveBeenCalled()

    // Messenger accepts a public link but not a provider/media id.
    const messengerLink = await POST(
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({...base, media: {kind: 'image', link: 'https://cdn.example.test/a.png'}}),
      }),
    )
    expect(messengerLink.status).toBe(202)
    expect(send).toHaveBeenCalledTimes(1)

    const messengerId = await POST(
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({...base, media: {kind: 'image', id: '123'}}),
      }),
    )
    expect(messengerId.status).toBe(422)
    await expect(messengerId.json()).resolves.toMatchObject({code: 'MEDIA_UNSUPPORTED'})

    const conflictRes = await POST(
      new Request('http://localhost/api/communications/me/send', {
        method: 'POST',
        body: JSON.stringify({
          ...base,
          template: {name: 'quote_followup', language: 'en'},
          media: {kind: 'image', link: 'https://cdn.example.test/a.png'},
        }),
      }),
    )
    expect(conflictRes.status).toBe(422)
    await expect(conflictRes.json()).resolves.toMatchObject({code: 'MEDIA_TEMPLATE_CONFLICT'})
    // Only the allowed Messenger-link send above reached the hub.
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('email channels are not windowed', async () => {
    mockAuth.mockResolvedValue(signedIn)
    const send = sendOk()
    useContainer(() => send, createFakeEm({
      channels: [{ id: '11111111-1111-4111-8111-111111111111', userId: 'u1', channelType: 'email' }],
    }))
    const { POST } = await import('../api/me/send/route')
    const res = await POST(new Request('http://localhost/api/communications/me/send', { method: 'POST', body: JSON.stringify(base) }))
    expect(res.status).toBe(202)
  })
})
