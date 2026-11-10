import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CommunicationChannel } from '@open-mercato/core/modules/communication_channels/data/entities'
import { SendRequest } from '../data/entities'

/**
 * Regression for K2-D1 — a `clientRequestId` must be bound to its payload.
 *
 * Before this fix the ledger decided replay from `(tenantId, userId,
 * clientRequestId)` alone. Reusing a key with a different channel / recipient /
 * subject returned the FIRST message id with `replayed: true` and silently
 * discarded the second payload (wrong-recipient disclosure risk).
 *
 * The production route + ledger run unchanged; only auth and DI/DB are faked.
 */

jest.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: jest.fn(),
}))

jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: jest.fn(),
}))

const mockAuth = getAuthFromRequest as jest.MockedFunction<typeof getAuthFromRequest>
const mockContainer = createRequestContainer as jest.MockedFunction<typeof createRequestContainer>

type Row = Record<string, unknown>

function createFakeEm(sendRequests: Row[], channelType = 'email') {
  let nextId = 1
  const findOne = jest.fn(async (entity: unknown, where: Row) => {
    if (entity === CommunicationChannel) {
      // The customer-window policy reads this row; an e-mail channel has no
      // window, so the policy short-circuits and never touches conversations.
      return { id: where.id, channelType, userId: 'u1', tenantId: 't1', organizationId: 'o1' }
    }
    if (entity === SendRequest) {
      if (where.id) return sendRequests.find((row) => row.id === where.id) ?? null
      return (
        sendRequests.find(
          (row) =>
            row.tenantId === where.tenantId &&
            row.userId === where.userId &&
            row.clientRequestId === where.clientRequestId,
        ) ?? null
      )
    }
    return null
  })
  const create = jest.fn((entity: unknown, data: Row) => {
    if (entity !== SendRequest) throw new Error('unexpected entity in create')
    return { id: `sr-${nextId++}`, messageId: null, messageThreadId: null, createdAt: new Date(), ...data }
  })
  const persist = jest.fn((row: Row) => {
    sendRequests.push(row)
    return row
  })
  const remove = jest.fn((row: Row) => {
    const index = sendRequests.indexOf(row)
    if (index >= 0) sendRequests.splice(index, 1)
    return row
  })
  return {
    em: {
      findOne,
      create,
      persist,
      remove,
      flush: jest.fn(async () => undefined),
    },
    sendRequests,
  }
}

function containerWith(em: unknown, send: unknown) {
  return {
    resolve: (name: string) => {
      if (name === 'em') return { fork: () => em }
      if (name === 'communicationChannelsSendAsUser') return send
      throw new Error(`unexpected resolve: ${name}`)
    },
  }
}

const signedIn = { sub: 'u1', tenantId: 't1', orgId: 'o1', roles: ['employee'] } as never

function payload(overrides: Record<string, unknown> = {}) {
  return {
    channelId: '11111111-1111-4111-8111-111111111111',
    to: ['customer@example.test'],
    subject: 'Re: demo',
    body: { plain: 'hello' },
    clientRequestId: 'client-req-0001',
    ...overrides,
  }
}

async function post(payloadBody: Record<string, unknown>) {
  const { POST } = await import('../api/me/send/route')
  return POST(
    new Request('http://localhost/api/communications/me/send', {
      method: 'POST',
      body: JSON.stringify(payloadBody),
    }),
  )
}

describe('K2-D1: clientRequestId is bound to the request payload', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockAuth.mockResolvedValue(signedIn)
  })

  it('replays the first result when the same key carries the same payload', async () => {
    const { em, sendRequests } = createFakeEm([])
    const send = jest.fn(async () => ({
      ok: true as const,
      messageId: 'm-1',
      threadId: 'th-1',
      channelId: '11111111-1111-4111-8111-111111111111',
      providerKey: 'imap',
    }))
    mockContainer.mockResolvedValue(containerWith(em, send) as never)

    const first = await post(payload())
    expect(first.status).toBe(202)
    await expect(first.json()).resolves.toMatchObject({ messageId: 'm-1' })

    // Byte-identical retry — the intended idempotent path.
    const second = await post(payload())
    expect(second.status).toBe(200)
    await expect(second.json()).resolves.toMatchObject({
      messageId: 'm-1',
      threadId: 'th-1',
      replayed: true,
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(sendRequests).toHaveLength(1)
    expect(typeof sendRequests[0].payloadHash).toBe('string')
  })

  it('refuses the key with 409 when the payload differs — and never sends', async () => {
    const { em, sendRequests } = createFakeEm([])
    const send = jest.fn(async () => ({
      ok: true as const,
      messageId: 'm-1',
      threadId: 'th-1',
      channelId: '11111111-1111-4111-8111-111111111111',
      providerKey: 'imap',
    }))
    mockContainer.mockResolvedValue(containerWith(em, send) as never)

    const first = await post(payload())
    expect(first.status).toBe(202)

    // Same key, different channel + recipient + subject + body. The old code
    // answered 200 with m-1 here; that is the wrong-recipient disclosure.
    const second = await post(
      payload({
        channelId: '22222222-2222-4222-8222-222222222222',
        to: ['someone-else@example.test'],
        subject: 'Second payload (must not be silently dropped)',
        body: { plain: 'second body' },
      }),
    )

    expect(second.status).toBe(409)
    const body = (await second.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      clientRequestId: 'client-req-0001',
    })
    expect(body.messageId).toBeUndefined()
    expect(send).toHaveBeenCalledTimes(1)
    expect(sendRequests).toHaveLength(1)
  })

  it('binds template/media shape too, not just text fields', async () => {
    const { em } = createFakeEm([], 'whatsapp')
    const send = jest.fn(async () => ({
      ok: true as const,
      messageId: 'm-1',
      threadId: 'th-1',
      channelId: '11111111-1111-4111-8111-111111111111',
      providerKey: 'whatsapp-business',
    }))
    mockContainer.mockResolvedValue(containerWith(em, send) as never)

    const base = payload({
      channelId: '11111111-1111-4111-8111-111111111111',
      subject: 'Template',
      body: { plain: 'template body' },
      template: { name: 'order_update', language: 'zh_CN' },
    })
    const first = await post(base)
    expect(first.status).toBe(202)

    const differentTemplate = await post({
      ...base,
      template: { name: 'order_update', language: 'en_US' },
    })
    expect(differentTemplate.status).toBe(409)
    await expect(differentTemplate.json()).resolves.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('canonicalizes object key order so an equivalent template still replays', async () => {
    const { em } = createFakeEm([], 'whatsapp')
    const send = jest.fn(async () => ({
      ok: true as const,
      messageId: 'm-1',
      threadId: 'th-1',
      channelId: '11111111-1111-4111-8111-111111111111',
      providerKey: 'whatsapp-business',
    }))
    mockContainer.mockResolvedValue(containerWith(em, send) as never)

    const first = await post(
      payload({
        subject: 'Template',
        body: { plain: 'template body' },
        template: {
          name: 'order_update',
          language: 'zh_CN',
          components: [{ type: 'body', parameters: [{ type: 'text', text: 'A' }] }],
        },
      }),
    )
    expect(first.status).toBe(202)

    const reordered = await post(
      payload({
        subject: 'Template',
        body: { plain: 'template body' },
        template: {
          language: 'zh_CN',
          components: [{ parameters: [{ text: 'A', type: 'text' }], type: 'body' }],
          name: 'order_update',
        },
      }),
    )
    expect(reordered.status).toBe(200)
    await expect(reordered.json()).resolves.toMatchObject({ replayed: true, messageId: 'm-1' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('reclaims a stale in-flight row after the lease expires (crashed worker)', async () => {
    const base = payload()
    const { em, sendRequests } = createFakeEm([
      {
        id: 'sr-stale',
        tenantId: 't1',
        userId: 'u1',
        clientRequestId: 'client-req-0001',
        channelId: base.channelId,
        messageId: null,
        messageThreadId: null,
        createdAt: new Date(Date.now() - 3 * 60 * 1000),
      },
    ])
    const send = jest.fn(async () => ({
      ok: true as const,
      messageId: 'm-2',
      threadId: 'th-2',
      channelId: base.channelId,
      providerKey: 'imap',
    }))
    mockContainer.mockResolvedValue(containerWith(em, send) as never)

    const res = await post(base)
    expect(res.status).toBe(202)
    await expect(res.json()).resolves.toMatchObject({ messageId: 'm-2' })
    expect(send).toHaveBeenCalledTimes(1)
    // The stale row is dropped and replaced by the new claim.
    expect(sendRequests).toHaveLength(1)
    expect(sendRequests[0].id).not.toBe('sr-stale')
    const createdAt = sendRequests[0].createdAt as Date
    expect(createdAt.getTime()).toBeGreaterThan(Date.now() - 60_000)
  })

  it('keeps answering 409 while the in-flight lease is still live', async () => {
    const base = payload()
    const { em, sendRequests } = createFakeEm([
      {
        id: 'sr-live',
        tenantId: 't1',
        userId: 'u1',
        clientRequestId: 'client-req-0001',
        channelId: base.channelId,
        messageId: null,
        messageThreadId: null,
        createdAt: new Date(Date.now() - 30 * 1000),
      },
    ])
    const send = jest.fn(async () => ({ ok: true as const, messageId: 'm-x', threadId: 'th-x', channelId: base.channelId, providerKey: 'imap' }))
    mockContainer.mockResolvedValue(containerWith(em, send) as never)

    const res = await post(base)
    expect(res.status).toBe(409)
    expect(send).not.toHaveBeenCalled()
    expect(sendRequests).toHaveLength(1)
  })
})
