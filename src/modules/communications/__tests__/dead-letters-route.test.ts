import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import {
  ChannelIngestDeadLetter,
  CommunicationChannel,
} from '@open-mercato/core/modules/communication_channels/data/entities'

/**
 * S91b / design rev2 F8-03: inbound dead letters must be visible to an operator.
 * The response carries failure metadata only — never the captured provider body.
 */

jest.mock('@open-mercato/shared/lib/auth/server', () => ({ getAuthFromRequest: jest.fn() }))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))

const mockAuth = getAuthFromRequest as jest.MockedFunction<typeof getAuthFromRequest>
const mockContainer = createRequestContainer as jest.MockedFunction<typeof createRequestContainer>

const signedIn = { sub: 'u1', tenantId: 't1', orgId: 'o1', roles: ['admin'] } as never

type Row = Record<string, unknown>

function fakeEm(deadLetters: Row[], channels: Row[]) {
  const find = jest.fn(async (entity: unknown, where: Row) => {
    if (entity === ChannelIngestDeadLetter) return deadLetters
    if (entity === CommunicationChannel) return channels
    throw new Error(`unexpected find entity ${String(entity)}`)
  })
  return { em: { find }, find }
}

async function getDeadLetters() {
  const { GET } = await import('../api/me/dead-letters/route')
  return GET(new Request('http://localhost/api/communications/me/dead-letters'))
}

describe('GET /api/communications/me/dead-letters', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockAuth.mockResolvedValue(signedIn)
  })

  it('lists failure metadata with the channel label and never the captured body', async () => {
    const { em } = fakeEm(
      [
        {
          id: 'dl-1',
          channelId: 'ch-1',
          providerKey: 'imap',
          errorClass: 'inbound_parse_failed',
          errorMessage: 'x'.repeat(900),
          externalUid: '42',
          externalMessageId: '<abc@mail>',
          rawBody: 'SECRET PROVIDER PAYLOAD',
          createdAt: new Date('2026-11-12T10:00:00Z'),
        },
      ],
      [{ id: 'ch-1', displayName: '客服邮箱' }],
    )
    mockContainer.mockResolvedValue({ resolve: () => ({ fork: () => em }) } as never)

    const response = await getDeadLetters()
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.total).toBe(1)
    expect(payload.items[0]).toMatchObject({
      id: 'dl-1',
      channelDisplayName: '客服邮箱',
      errorClass: 'inbound_parse_failed',
      externalUid: '42',
    })
    expect(payload.items[0].errorMessage).toHaveLength(500)
    expect(JSON.stringify(payload)).not.toContain('SECRET PROVIDER PAYLOAD')
  })

  it('scopes to the caller organization and tenant', async () => {
    const { em, find } = fakeEm([], [])
    mockContainer.mockResolvedValue({ resolve: () => ({ fork: () => em }) } as never)
    const response = await getDeadLetters()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ items: [], total: 0 })
    const where = (find.mock.calls[0] as unknown[])[1] as Row
    expect(where).toMatchObject({ tenantId: 't1', organizationId: { $in: ['o1', null] } })
  })

  it('rejects anonymous callers without opening a container', async () => {
    mockAuth.mockResolvedValue(null as never)
    const response = await getDeadLetters()
    expect(response.status).toBe(401)
    expect(mockContainer).not.toHaveBeenCalled()
  })
})
