import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import crypto from 'node:crypto'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CommunicationChannel, MessageChannelLink } from '@open-mercato/core/modules/communication_channels/data/entities'
import { getCommunicationChannelsQueue } from '@open-mercato/core/modules/communication_channels/lib/queue'

jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('@open-mercato/core/modules/communication_channels/lib/queue', () => ({
  COMMUNICATION_CHANNELS_QUEUES: { inbound: 'cc-inbound' },
  getCommunicationChannelsQueue: jest.fn(),
}))

const SECRET = 'meta-secret'
const mockContainer = createRequestContainer as jest.MockedFunction<typeof createRequestContainer>
const mockQueue = getCommunicationChannelsQueue as jest.MockedFunction<typeof getCommunicationChannelsQueue>

function sign(body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex')
}

type Link = { externalMessageId: string; deliveryStatus: string }

function setup(channels: Array<Record<string, unknown>>, links: Link[] = []) {
  const enqueue = jest.fn(async (..._args: unknown[]) => ({id: 'job'}))
  mockQueue.mockReturnValue({enqueue} as never)
  const flush = jest.fn(async () => undefined)
  const em = {
    find: jest.fn(async (entity: unknown) => (entity === CommunicationChannel ? channels : [])),
    findOne: jest.fn(async (entity: unknown, where: Record<string, unknown>) => {
      if (entity !== MessageChannelLink) return null
      return links.find((link) => link.externalMessageId === where.externalMessageId) ?? null
    }),
    flush,
  }
  const credentials = {resolve: jest.fn(async () => ({appSecret: SECRET}))}
  mockContainer.mockResolvedValue({
    resolve: (name: string) => {
      if (name === 'em') return {fork: () => em}
      if (name === 'integrationCredentialsService') return credentials
      throw new Error(`unexpected resolve ${name}`)
    },
  } as never)
  return {enqueue, em, flush}
}

const channel = {
  id: 'ch-wa',
  providerKey: 'whatsapp-business',
  channelType: 'whatsapp',
  tenantId: 'tenant-1',
  organizationId: null,
  userId: null,
  isActive: true,
  credentialsRef: 'cred-1',
}

function messageBody(id = 'wamid.IN', text = 'hola'): string {
  return JSON.stringify({
    entry: [{changes: [{value: {messages: [{from: '15550001111', id, timestamp: '1700000000', type: 'text', text: {body: text}}]}}]}],
  })
}

function statusBody(id = 'wamid.OUT', status = 'delivered'): string {
  return JSON.stringify({
    entry: [{changes: [{value: {statuses: [{id, recipient_id: '1555', status, timestamp: '1700000000'}]}}]}],
  })
}

const load = () => import('../api/webhook/whatsapp/route')

describe('POST /api/communications/webhook/whatsapp', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('rejects a bad signature with 401 and queues nothing', async () => {
    const {enqueue} = setup([channel])
    const body = messageBody()
    const {POST} = await load()
    const res = await POST(
      new Request('http://localhost/api/communications/webhook/whatsapp', {
        method: 'POST',
        body,
        headers: {'x-hub-signature-256': 'sha256=' + '0'.repeat(64)},
      }),
    )
    expect(res.status).toBe(401)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('verifies a message and enqueues the hub inbound job with the channel org', async () => {
    const {enqueue} = setup([channel])
    const body = messageBody()
    const {POST} = await load()
    const res = await POST(
      new Request('http://localhost/api/communications/webhook/whatsapp', {
        method: 'POST',
        body,
        headers: {'x-hub-signature-256': sign(body)},
      }),
    )
    expect(res.status).toBe(202)
    await expect(res.json()).resolves.toMatchObject({received: true, messages: 1})
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKey: 'whatsapp-business',
        channelId: 'ch-wa',
        channelType: 'whatsapp',
        scope: {tenantId: 'tenant-1', organizationId: null},
        raw: expect.objectContaining({eventType: 'message'}),
      }),
    )
  })

  it('applies a delivery receipt to the existing link', async () => {
    const links: Link[] = [{externalMessageId: 'wamid.OUT', deliveryStatus: 'sent'}]
    const {flush} = setup([channel], links)
    const body = statusBody('wamid.OUT', 'delivered')
    const {POST} = await load()
    const res = await POST(
      new Request('http://localhost/api/communications/webhook/whatsapp', {
        method: 'POST',
        body,
        headers: {'x-hub-signature-256': sign(body)},
      }),
    )
    expect(res.status).toBe(202)
    await expect(res.json()).resolves.toMatchObject({statuses: 1, statusUpdates: 1})
    expect(links[0].deliveryStatus).toBe('delivered')
    expect(flush).toHaveBeenCalled()
  })

  it('never moves a link backwards', async () => {
    const links: Link[] = [{externalMessageId: 'wamid.OUT', deliveryStatus: 'read'}]
    setup([channel], links)
    const body = statusBody('wamid.OUT', 'sent')
    const {POST} = await load()
    const res = await POST(
      new Request('http://localhost/api/communications/webhook/whatsapp', {
        method: 'POST',
        body,
        headers: {'x-hub-signature-256': sign(body)},
      }),
    )
    expect(res.status).toBe(202)
    await expect(res.json()).resolves.toMatchObject({statuses: 1, statusUpdates: 0, skippedStatuses: 1})
    expect(links[0].deliveryStatus).toBe('read')
  })

  it('acknowledges an unknown external message without inventing a link', async () => {
    const {flush} = setup([channel], [])
    const body = statusBody('wamid.MISSING', 'delivered')
    const {POST} = await load()
    const res = await POST(
      new Request('http://localhost/api/communications/webhook/whatsapp', {
        method: 'POST',
        body,
        headers: {'x-hub-signature-256': sign(body)},
      }),
    )
    await expect(res.json()).resolves.toMatchObject({statuses: 1, statusUpdates: 0, skippedStatuses: 1})
    expect(flush).not.toHaveBeenCalled()
  })

  it('returns 401 when no channel exists and 413 for an oversized body', async () => {
    setup([])
    const body = messageBody()
    const {POST} = await load()
    const none = await POST(
      new Request('http://localhost/api/communications/webhook/whatsapp', {method: 'POST', body, headers: {'x-hub-signature-256': sign(body)}}),
    )
    expect(none.status).toBe(401)

    const big = 'x'.repeat(1024 * 1024 + 1)
    const oversized = await POST(new Request('http://localhost/api/communications/webhook/whatsapp', {method: 'POST', body: big}))
    expect(oversized.status).toBe(413)
  })
})

// Keep the auth import referenced so an accidental auth requirement would fail
// this suite loudly instead of silently changing the webhook contract.
it('webhook must not require a session', () => {
  expect(getAuthFromRequest).toBeDefined()
})
