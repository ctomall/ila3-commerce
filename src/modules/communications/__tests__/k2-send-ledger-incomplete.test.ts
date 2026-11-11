import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CommunicationChannel } from '@open-mercato/core/modules/communication_channels/data/entities'
import { SendRequest } from '../data/entities'

/**
 * K2 regression: the hub accepted the message but the local idempotency ledger
 * could not record it.
 *
 * The two failure modes must stay distinct:
 *  - the hub REFUSED (4xx/5xx) -> the route returns that status, and a definite
 *    4xx releases the key so a corrected retry may proceed;
 *  - the hub ACCEPTED but the ledger commit failed -> the message is already
 *    leaving the CRM. Returning an error would invite a retry, and once the
 *    in-flight lease expires that retry would send a SECOND message. The route
 *    must therefore answer 202 with `ledgerRecorded: false` and keep the key
 *    locked (no release, no completion), so a same-key retry still resolves to
 *    "still in flight" instead of sending again.
 *
 * Only auth and DI/DB are faked; the production route and ledger run unchanged.
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

/**
 * Fake EntityManager with a controllable `flush`, so the test can fail exactly
 * the second flush (the ledger completion) while the first one (the key claim)
 * succeeds — the precise window this regression covers.
 */
function createFakeEm(sendRequests: Row[]) {
  let nextId = 1
  const findOne = jest.fn(async (entity: unknown, where: Row) => {
    if (entity === CommunicationChannel) {
      return { id: where.id, channelType: 'email', userId: 'u1', tenantId: 't1', organizationId: 'o1' }
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
  // The "database": a flush that fails must roll back the in-memory mutation,
  // otherwise the test would pretend a completed write survived a failed commit.
  const committed = new Map<string, { messageId: unknown; messageThreadId: unknown }>()
  const persist = jest.fn((row: Row) => {
    sendRequests.push(row)
    committed.set(String(row.id), { messageId: null, messageThreadId: null })
    return row
  })
  const remove = jest.fn((row: Row) => {
    const index = sendRequests.indexOf(row)
    if (index >= 0) sendRequests.splice(index, 1)
    committed.delete(String(row.id))
    return row
  })
  const flush = jest.fn(async () => {
    for (const row of sendRequests) {
      committed.set(String(row.id), { messageId: row.messageId, messageThreadId: row.messageThreadId })
    }
  })
  const failFlushAt = (attempt: number) => {
    let calls = 0
    ;(flush as jest.Mock).mockImplementation(async () => {
      calls += 1
      if (calls === attempt) {
        // Restore committed state: a real failed commit writes nothing.
        for (const row of sendRequests) {
          const saved = committed.get(String(row.id))
          row.messageId = saved ? saved.messageId : null
          row.messageThreadId = saved ? saved.messageThreadId : null
        }
        throw new Error('connection lost while committing')
      }
      for (const row of sendRequests) {
        committed.set(String(row.id), { messageId: row.messageId, messageThreadId: row.messageThreadId })
      }
    })
  }
  return {
    em: { findOne, create, persist, remove, flush },
    sendRequests,
    failFlushAt,
  }
}

function containerWith(em: unknown, send: unknown) {
  return {
    resolve: (name: string) => {
      if (name === 'em') return { fork: () => em }
      if (name === 'communicationChannelsSendAsUser') return send
      if (name === 'rbacService') {
        return {
          userHasAllFeatures: async (_userId: string, features: string[]) =>
            features.every((feature) => feature === 'communication_channels.connect_user_channel'),
        }
      }
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
    clientRequestId: 'client-req-ledger-0001',
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

function acceptedSend(channelId: string) {
  return jest.fn(async () => ({
    ok: true as const,
    messageId: 'm-accepted-1',
    threadId: 'th-accepted-1',
    channelId,
    providerKey: 'imap',
  }))
}

describe('K2: hub accepted the send but the idempotency ledger commit failed', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockAuth.mockResolvedValue(signedIn)
  })

  it('answers 202 with ledgerRecorded:false and a do-not-retry warning', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { em, sendRequests, failFlushAt } = createFakeEm([])
    // #1 = claim the key (must succeed), #2 = record the accepted message.
    failFlushAt(2)
    const channelId = '11111111-1111-4111-8111-111111111111'
    const send = acceptedSend(channelId)
    mockContainer.mockResolvedValue(containerWith(em, send) as never)

    const res = await post(payload())

    // The message is already accepted by the hub: this must NOT look like a
    // retryable failure (5xx) or a new claim.
    expect(res.status).toBe(202)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      messageId: 'm-accepted-1',
      threadId: 'th-accepted-1',
      clientRequestId: 'client-req-ledger-0001',
      ledgerRecorded: false,
    })
    expect(String(body.warning)).toContain('请勿用同一 clientRequestId 重试')
    expect(send).toHaveBeenCalledTimes(1)

    // The reservation is kept but never marked complete, which is what makes a
    // retry safe: the row still proves an attempt is outstanding.
    expect(sendRequests).toHaveLength(1)
    expect(sendRequests[0].messageId).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('still refuses the same key immediately afterwards, so no second send within the lease', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { em, sendRequests, failFlushAt } = createFakeEm([])
    failFlushAt(2)
    const channelId = '11111111-1111-4111-8111-111111111111'
    const send = acceptedSend(channelId)
    mockContainer.mockResolvedValue(containerWith(em, send) as never)

    expect((await post(payload())).status).toBe(202)

    // Same key, same payload, ledger healthy again — the point of failure is not
    // a send license: while the claim is younger than IN_FLIGHT_TTL_MS the route
    // still answers 409 and never sends twice. (The lease expiry is characterized
    // in the next case: this guard is bounded, not permanent.)
    ;(em.flush as jest.Mock).mockImplementation(async () => undefined)
    const retry = await post(payload())
    expect(retry.status).toBe(409)
    await expect(retry.json()).resolves.toMatchObject({
      error: 'A send with this clientRequestId is still in flight',
      clientRequestId: 'client-req-ledger-0001',
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(sendRequests).toHaveLength(1)
    errorSpy.mockRestore()
  })

  it('releases the key on a definite hub refusal, so a corrected retry may send', async () => {
    const { em, sendRequests } = createFakeEm([])
    const channelId = '11111111-1111-4111-8111-111111111111'
    const send = jest.fn(async () => ({
      ok: false as const,
      status: 403,
      error: 'Channel is not owned by the caller',
    }))
    mockContainer.mockResolvedValue(containerWith(em, send) as never)

    const first = await post(payload())
    expect(first.status).toBe(403)
    // A definite refusal frees the reservation; nothing was sent.
    expect(sendRequests).toHaveLength(0)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('after the in-flight lease expires the replay may send again — bounded guard, not a guarantee', async () => {
    // The accepted-but-unrecorded row only blocks a retry while it is younger
    // than IN_FLIGHT_TTL_MS (2 minutes). After that the ledger treats it as a
    // dead attempt: it drops the row, re-claims the key and the message is sent
    // a second time. The route cannot tell this apart from an ordinary crashed
    // attempt, so the 202 warning plus operator reconciliation are the real
    // safeguard. This case pins that boundary so the protection is never
    // described as permanent.
    const { em, sendRequests } = createFakeEm([
      {
        id: 'sr-unrecorded',
        tenantId: 't1',
        userId: 'u1',
        clientRequestId: 'client-req-ledger-0001',
        channelId: '11111111-1111-4111-8111-111111111111',
        messageId: null,
        messageThreadId: null,
        // Accepted by the hub earlier, never recorded on the ledger.
        createdAt: new Date(Date.now() - 3 * 60 * 1000),
      },
    ])
    const channelId = '11111111-1111-4111-8111-111111111111'
    const send = acceptedSend(channelId)
    mockContainer.mockResolvedValue(containerWith(em, send) as never)

    const res = await post(payload())

    expect(res.status).toBe(202)
    // A SECOND provider send is allowed once the lease lapsed.
    expect(send).toHaveBeenCalledTimes(1)
    expect(sendRequests).toHaveLength(1)
    expect(sendRequests[0].id).not.toBe('sr-unrecorded')
    expect(sendRequests[0].messageId).toBe('m-accepted-1')
  })
})
