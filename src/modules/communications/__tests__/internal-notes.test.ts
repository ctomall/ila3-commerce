import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import {
  CommunicationChannel,
  ExternalConversation,
  MessageChannelLink,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import { Message } from '@open-mercato/core/modules/messages/data/entities'

/**
 * Internal notes (S87c / design rev2 F3-06).
 *
 * A note must be a `messages.message` row with visibility=internal and no channel
 * link, so the installed delivery command treats it as internal-only. These cases
 * pin the two properties that make that safe: the compose input never carries a
 * channel/sender (nothing to deliver through) and the read path is scoped to the
 * authorized conversation.
 */

jest.mock('@open-mercato/shared/lib/auth/server', () => ({ getAuthFromRequest: jest.fn() }))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('@open-mercato/core/modules/communication_channels/lib/access-control', () => ({
  channelOrgScopeWhere: () => ({}),
}))

const mockAuth = getAuthFromRequest as jest.MockedFunction<typeof getAuthFromRequest>
const mockContainer = createRequestContainer as jest.MockedFunction<typeof createRequestContainer>

type Row = Record<string, unknown>

const CONVERSATION = '22222222-2222-4222-8222-222222222222'
const CHANNEL = '11111111-1111-4111-8111-111111111111'

const signedIn = { sub: 'u1', tenantId: 't1', orgId: 'o1', roles: ['employee'] } as never

function fakeEm(options: {
  channelUserId?: string | null
  conversationExists?: boolean
  notes?: Row[]
  latestMessageId?: string | null
} = {}) {
  const emittedWhere: Row[] = []
  const find = jest.fn(async (entity: unknown, where: Row) => {
    emittedWhere.push(where)
    if (entity === Message) return options.notes ?? []
    throw new Error(`unexpected find entity ${String(entity)}`)
  })
  const findOne = jest.fn(async (entity: unknown, where: Row) => {
    emittedWhere.push(where)
    if (entity === ExternalConversation) {
      return options.conversationExists === false ? null : { id: CONVERSATION, channelId: CHANNEL, subject: '订单 #42' }
    }
    if (entity === CommunicationChannel) {
      return { id: CHANNEL, userId: options.channelUserId ?? null }
    }
    if (entity === MessageChannelLink) {
      return options.latestMessageId === null ? null : { messageId: options.latestMessageId ?? 'msg-parent' }
    }
    return null
  })
  return { em: { find, findOne }, where: emittedWhere }
}

function containerWith(
  em: ReturnType<typeof fakeEm>['em'],
  options: { canReply?: boolean; execute?: jest.Mock } = {},
) {
  const execute = options.execute ?? jest.fn(async () => ({ result: { id: 'note-1', threadId: 'th-1' } }))
  const container = {
    resolve: (name: string) => {
      if (name === 'em') return { fork: () => em }
      if (name === 'commandBus') return { execute }
      if (name === 'rbacService') {
        return {
          userHasAllFeatures: async (_userId: string, features: string[]) =>
            options.canReply === false ? false : features.length > 0,
        }
      }
      throw new Error(`unexpected resolve ${name}`)
    },
  }
  return { container, execute }
}

async function postNote(body: unknown, id = CONVERSATION) {
  const { POST } = await import('../api/me/threads/[id]/notes/route')
  return POST(
    new Request(`http://localhost/api/communications/me/threads/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: { id } },
  )
}

async function getNotes(id = CONVERSATION) {
  const { GET } = await import('../api/me/threads/[id]/notes/route')
  return GET(new Request(`http://localhost/api/communications/me/threads/${id}/notes`), {
    params: { id },
  })
}

describe('POST /api/communications/me/threads/[id]/notes', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockAuth.mockResolvedValue(signedIn)
  })

  it('creates an internal message with no channel/sender path (S87c / F3-06)', async () => {
    const { em } = fakeEm({ latestMessageId: 'msg-parent' })
    const { container, execute } = containerWith(em)
    mockContainer.mockResolvedValue(container as never)

    const response = await postNote({ body: '客户情绪激动，先别报价' })
    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ id: 'note-1', threadId: 'th-1' })

    expect(execute).toHaveBeenCalledTimes(1)
    const [commandId, payload] = execute.mock.calls[0] as unknown as [string, { input: Row }]
    expect(commandId).toBe('messages.messages.compose')
    expect(payload.input).toMatchObject({
      visibility: 'internal',
      body: '客户情绪激动，先别报价',
      sendViaEmail: false,
      isDraft: false,
      sourceEntityType: 'communication_channels.conversation',
      sourceEntityId: CONVERSATION,
      parentMessageId: 'msg-parent',
      tenantId: 't1',
      organizationId: 'o1',
      userId: 'u1',
      recipients: [{ userId: 'u1', type: 'to' }],
    })
    // Nothing that could reach a provider: no sender channel, no channel metadata.
    expect(payload.input).not.toHaveProperty('senderChannelId')
    expect(payload.input).not.toHaveProperty('channelMetadata')
  })

  it('works on a brand-new conversation without a message to inherit a thread from', async () => {
    const { em } = fakeEm({ latestMessageId: null })
    const { container, execute } = containerWith(em)
    mockContainer.mockResolvedValue(container as never)

    const response = await postNote({ body: '首条备注' })
    expect(response.status).toBe(201)
    const [, payload] = execute.mock.calls[0] as unknown as [string, { input: Row }]
    expect(payload.input).not.toHaveProperty('parentMessageId')
    expect(payload.input.sourceEntityId).toBe(CONVERSATION)
  })

  it('refuses a caller without the reply grant before writing anything', async () => {
    const { em } = fakeEm()
    const { container, execute } = containerWith(em, { canReply: false })
    mockContainer.mockResolvedValue(container as never)

    const response = await postNote({ body: '不该写进去' })
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ code: 'REPLY_FORBIDDEN' })
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects an empty or over-long note before opening a container', async () => {
    const empty = await postNote({ body: '   ' })
    expect(empty.status).toBe(422)
    await expect(empty.json()).resolves.toMatchObject({ code: 'NOTE_INVALID' })
    const long = await postNote({ body: 'x'.repeat(4001) })
    expect(long.status).toBe(422)
    expect(mockContainer).not.toHaveBeenCalled()
  })

  it('masks another employee personal channel as not found', async () => {
    const { em } = fakeEm({ channelUserId: 'u2' })
    const { container, execute } = containerWith(em)
    mockContainer.mockResolvedValue(container as never)

    const response = await postNote({ body: 'hello' })
    expect(response.status).toBe(404)
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects anonymous callers without touching the container', async () => {
    mockAuth.mockResolvedValue(null as never)
    const response = await postNote({ body: 'hello' })
    expect(response.status).toBe(401)
    expect(mockContainer).not.toHaveBeenCalled()
  })
})

describe('GET /api/communications/me/threads/[id]/notes', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockAuth.mockResolvedValue(signedIn)
  })

  it('returns only internal notes attached to this conversation', async () => {
    const note = {
      id: 'note-1',
      body: '已确认收货地址',
      bodyFormat: 'text',
      subject: '订单 #42',
      senderUserId: 'u1',
      threadId: 'th-1',
      createdAt: new Date('2026-11-12T10:00:00Z'),
      visibility: 'internal',
    }
    const { em, where } = fakeEm({ notes: [note] })
    const { container } = containerWith(em)
    mockContainer.mockResolvedValue(container as never)

    const response = await getNotes()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      items: [
        {
          id: 'note-1',
          body: '已确认收货地址',
          authorUserId: 'u1',
          createdAt: '2026-11-12T10:00:00.000Z',
        },
      ],
    })
    const noteWhere = where.find((entry) => entry.visibility === 'internal') as Row
    expect(noteWhere).toMatchObject({
      tenantId: 't1',
      visibility: 'internal',
      sourceEntityType: 'communication_channels.conversation',
      sourceEntityId: CONVERSATION,
      deletedAt: null,
    })
  })

  it('returns an empty list when the conversation has no notes', async () => {
    const { em } = fakeEm({ notes: [] })
    const { container } = containerWith(em)
    mockContainer.mockResolvedValue(container as never)
    const response = await getNotes()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ items: [] })
  })

  it('masks a missing conversation as 404', async () => {
    const { em } = fakeEm({ conversationExists: false })
    const { container } = containerWith(em)
    mockContainer.mockResolvedValue(container as never)
    const response = await getNotes()
    expect(response.status).toBe(404)
  })

  it('rejects anonymous callers', async () => {
    mockAuth.mockResolvedValue(null as never)
    const response = await getNotes()
    expect(response.status).toBe(401)
  })
})
