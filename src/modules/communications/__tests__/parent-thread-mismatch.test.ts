import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import {
  CommunicationChannel,
  ExternalConversation,
  MessageChannelLink,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import { SendRequest } from '../data/entities'

/**
 * A quoted parent must belong to the conversation the caller claims to reply
 * in. Before this guard the hub's thread-reuse lookup only compared the parent
 * conversation's channel, so a crafted `parentMessageId` from another
 * conversation on the same channel filed the outgoing message into that other
 * customer's inbox thread.
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

const CHANNEL = '11111111-1111-4111-8111-111111111111'
const THREAD = '22222222-2222-4222-8222-222222222222'
const OTHER_THREAD = '33333333-3333-4333-8333-333333333333'
const PARENT = '44444444-4444-4444-8444-444444444444'

function fakeEm(options: { linkThread: string | null }) {
  let nextId = 1
  const findOne = jest.fn(async (entity: unknown, where: Row) => {
    if (entity === CommunicationChannel) {
      return { id: where.id, channelType: 'email', userId: 'u1', tenantId: 't1', organizationId: 'o1' }
    }
    if (entity === SendRequest) return null
    if (entity === MessageChannelLink) {
      if (where.messageId !== PARENT || where.direction !== 'inbound') return null
      return { externalConversationId: options.linkThread }
    }
    if (entity === ExternalConversation) {
      if (where.id === THREAD && where.channelId === CHANNEL) return { id: THREAD }
      return null
    }
    return null
  })
  const create = jest.fn((_entity: unknown, data: Row) => ({ id: `sr-${nextId++}`, ...data }))
  return {
    em: {
      findOne,
      create,
      persist: jest.fn((row: Row) => row),
      remove: jest.fn(),
      flush: jest.fn(async () => undefined),
    },
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

function payload(overrides: Row = {}) {
  return {
    channelId: CHANNEL,
    to: ['customer@example.test'],
    subject: 'Re: demo',
    body: { plain: 'hello' },
    parentMessageId: PARENT,
    threadId: THREAD,
    clientRequestId: 'client-req-thread-1',
    ...overrides,
  }
}

async function post(body: Row) {
  const { POST } = await import('../api/me/send/route')
  return POST(
    new Request('http://localhost/api/communications/me/send', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )
}

describe('reply parent must belong to the claimed conversation', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockAuth.mockResolvedValue(signedIn)
  })

  it('refuses a parent from another conversation and never sends', async () => {
    const { em } = fakeEm({ linkThread: OTHER_THREAD })
    const send = jest.fn()
    mockContainer.mockResolvedValue(containerWith(em, send) as never)

    const response = await post(payload())
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({ code: 'PARENT_THREAD_MISMATCH' })
    expect(send).not.toHaveBeenCalled()
  })

  it('accepts a parent in the claimed conversation', async () => {
    const { em } = fakeEm({ linkThread: THREAD })
    const send = jest.fn(async () => ({
      ok: true as const,
      messageId: 'm-1',
      threadId: 'th-1',
      channelId: CHANNEL,
      providerKey: 'imap',
    }))
    mockContainer.mockResolvedValue(containerWith(em, send) as never)

    const response = await post(payload())
    expect(response.status).toBe(202)
    expect(send).toHaveBeenCalledTimes(1)
    const sent = (send as jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>).mock.calls[0][2] as Row
    expect(sent.parentMessageId).toBe(PARENT)
  })

  it('keeps old clients working: no threadId means no parent-thread check', async () => {
    const { em } = fakeEm({ linkThread: OTHER_THREAD })
    const send = jest.fn(async () => ({
      ok: true as const,
      messageId: 'm-2',
      threadId: 'th-2',
      channelId: CHANNEL,
      providerKey: 'imap',
    }))
    mockContainer.mockResolvedValue(containerWith(em, send) as never)

    const response = await post(payload({ threadId: undefined }))
    expect(response.status).toBe(202)
    expect(send).toHaveBeenCalledTimes(1)
  })
})
