import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import crypto from 'node:crypto'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import {
  CommunicationChannel,
  ExternalConversation,
  ExternalMessage,
  MessageChannelLink,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import { getCommunicationChannelsQueue } from '@open-mercato/core/modules/communication_channels/lib/queue'

jest.mock('@open-mercato/shared/lib/di/container', () => ({createRequestContainer: jest.fn()}))
jest.mock('@open-mercato/core/modules/communication_channels/lib/queue', () => ({
  COMMUNICATION_CHANNELS_QUEUES: {inbound: 'cc-inbound'},
  getCommunicationChannelsQueue: jest.fn(),
}))

const SECRET = 'page-secret'
const mockContainer = createRequestContainer as jest.MockedFunction<typeof createRequestContainer>
const mockQueue = getCommunicationChannelsQueue as jest.MockedFunction<typeof getCommunicationChannelsQueue>

function sign(body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex')
}

type Link = {externalMessageId: string; deliveryStatus: string}

function setup(options: {
  channels?: Array<Record<string, unknown>>
  conversation?: Record<string, unknown> | null
  outbound?: Array<{id: string; providerTimestamp: Date}>
  links?: Link[]
}) {
  const enqueue = jest.fn(async (..._args: unknown[]) => ({id: 'job'}))
  mockQueue.mockReturnValue({enqueue} as never)
  const flush = jest.fn(async () => undefined)
  const links = options.links ?? []
  const em = {
    find: jest.fn(async (entity: unknown) => {
      if (entity === CommunicationChannel) return options.channels ?? []
      if (entity === ExternalMessage) return options.outbound ?? []
      if (entity === MessageChannelLink) return links
      return []
    }),
    findOne: jest.fn(async (entity: unknown) => {
      if (entity === ExternalConversation) return options.conversation ?? null
      return null
    }),
    flush,
  }
  mockContainer.mockResolvedValue({
    resolve: (name: string) => {
      if (name === 'em') return {fork: () => em}
      if (name === 'integrationCredentialsService') return {resolve: jest.fn(async () => ({appSecret: SECRET}))}
      throw new Error(`unexpected resolve ${name}`)
    },
  } as never)
  return {enqueue, flush, links}
}

const channel = {
  id: 'ch-ms',
  providerKey: 'messenger',
  channelType: 'messenger',
  tenantId: 'tenant-1',
  organizationId: null,
  userId: null,
  isActive: true,
  credentialsRef: 'cred-ms',
}

function textBody(mid = 'mid.IN', text = 'hello', psid = 'psid-1'): string {
  return JSON.stringify({
    object: 'page',
    entry: [{id: 'page-1', messaging: [{sender: {id: psid}, recipient: {id: 'page-1'}, timestamp: 1700000000000, message: {mid, text}}]}],
  })
}

function readBody(psid = 'psid-1', watermark = 1700000000000): string {
  return JSON.stringify({object: 'page', entry: [{id: 'page-1', messaging: [{sender: {id: psid}, timestamp: watermark + 1000, read: {watermark}}]}]})
}

const load = () => import('../api/webhook/messenger/route')

describe('POST /api/communications/webhook/messenger', () => {
  beforeEach(() => { jest.resetAllMocks() })

  it('rejects a bad signature without queueing', async () => {
    const {enqueue} = setup({channels: [channel]})
    const body = textBody()
    const {POST} = await load()
    const res = await POST(new Request('http://localhost/api/communications/webhook/messenger', {method: 'POST', body, headers: {'x-hub-signature-256': 'sha256=' + '0'.repeat(64)}}))
    expect(res.status).toBe(401)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('queues a message with the messenger provider key', async () => {
    const {enqueue} = setup({channels: [channel]})
    const body = textBody()
    const {POST} = await load()
    const res = await POST(new Request('http://localhost/api/communications/webhook/messenger', {method: 'POST', body, headers: {'x-hub-signature-256': sign(body)}}))
    expect(res.status).toBe(202)
    await expect(res.json()).resolves.toMatchObject({messages: 1})
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKey: 'messenger',
        channelId: 'ch-ms',
        scope: {tenantId: 'tenant-1', organizationId: null},
      }),
    )
  })

  it('applies a read watermark to older outbound links only', async () => {
    const links: Link[] = [{externalMessageId: 'msg-old', deliveryStatus: 'delivered'}]
    const {flush} = setup({
      channels: [channel],
      conversation: {id: 'conv-1'},
      outbound: [{id: 'msg-old', providerTimestamp: new Date(1699999999000)}],
      links,
    })
    const body = readBody()
    const {POST} = await load()
    const res = await POST(new Request('http://localhost/api/communications/webhook/messenger', {method: 'POST', body, headers: {'x-hub-signature-256': sign(body)}}))
    expect(res.status).toBe(202)
    await expect(res.json()).resolves.toMatchObject({reads: 1, readUpdates: 1, skippedReads: 0})
    expect(links[0].deliveryStatus).toBe('read')
    expect(flush).toHaveBeenCalled()
  })

  it('does not move a read link backwards and skips unknown conversations', async () => {
    const links: Link[] = [{externalMessageId: 'msg-old', deliveryStatus: 'read'}]
    setup({
      channels: [channel],
      conversation: {id: 'conv-1'},
      outbound: [{id: 'msg-old', providerTimestamp: new Date(1699999999000)}],
      links,
    })
    const body = readBody()
    const {POST} = await load()
    const res = await POST(new Request('http://localhost/api/communications/webhook/messenger', {method: 'POST', body, headers: {'x-hub-signature-256': sign(body)}}))
    await expect(res.json()).resolves.toMatchObject({readUpdates: 0, skippedReads: 1})

    setup({channels: [channel], conversation: null})
    const unknown = readBody('psid-unknown')
    const res2 = await POST(new Request('http://localhost/api/communications/webhook/messenger', {method: 'POST', body: unknown, headers: {'x-hub-signature-256': sign(unknown)}}))
    await expect(res2.json()).resolves.toMatchObject({reads: 1, readUpdates: 0})
  })

  it('returns 401 without a channel and 413 for oversized bodies', async () => {
    setup({channels: []})
    const body = textBody()
    const {POST} = await load()
    const none = await POST(new Request('http://localhost/api/communications/webhook/messenger', {method: 'POST', body, headers: {'x-hub-signature-256': sign(body)}}))
    expect(none.status).toBe(401)
    const big = 'x'.repeat(1024 * 1024 + 1)
    const oversized = await POST(new Request('http://localhost/api/communications/webhook/messenger', {method: 'POST', body: big}))
    expect(oversized.status).toBe(413)
  })
})
