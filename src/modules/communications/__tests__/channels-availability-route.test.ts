import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CommunicationChannel } from '@open-mercato/core/modules/communication_channels/data/entities'

/**
 * S90a / design rev2 F1-01 + F8-05: the account list exposes, per channel,
 * whether it can receive and whether it can send — so an outbound-only email
 * account never looks like an empty inbox.
 */

jest.mock('@open-mercato/shared/lib/auth/server', () => ({ getAuthFromRequest: jest.fn() }))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('@open-mercato/core/modules/communication_channels/lib/access-control', () => ({
  channelOrgScopeWhere: () => ({}),
}))
jest.mock('@open-mercato/core/modules/communication_channels/lib/adapter-registry-singleton', () => ({
  hasChannelAdapter: jest.fn(),
}))

import { hasChannelAdapter } from '@open-mercato/core/modules/communication_channels/lib/adapter-registry-singleton'

const mockAuth = getAuthFromRequest as jest.MockedFunction<typeof getAuthFromRequest>
const mockContainer = createRequestContainer as jest.MockedFunction<typeof createRequestContainer>
const mockHasAdapter = hasChannelAdapter as jest.MockedFunction<typeof hasChannelAdapter>

const signedIn = { sub: 'u1', tenantId: 't1', orgId: 'o1', roles: ['employee'] } as never

type Row = Record<string, unknown>

function fakeEm(rows: Row[]) {
  const find = jest.fn(async (entity: unknown, where: Row) => {
    if (entity === CommunicationChannel) return rows
    throw new Error(`unexpected find entity ${String(entity)}`)
  })
  return { em: { find }, find, where: [] as Row[] }
}

function containerWith(em: unknown) {
  return { resolve: (name: string) => (name === 'em' ? { fork: () => em } : null) }
}

async function getChannels() {
  const { GET } = await import('../api/me/channels/route')
  return GET(new Request('http://localhost/api/communications/me/channels'))
}

describe('GET /api/communications/me/channels', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockAuth.mockResolvedValue(signedIn)
  })

  it('marks an outbound-only email account as unable to receive', async () => {
    mockHasAdapter.mockImplementation(((key: string) => key === 'resend') as never)
    const { em } = fakeEm([
      {
        id: 'ch-1',
        providerKey: 'resend',
        channelType: 'email',
        displayName: '客服邮箱',
        visibility: 'shared',
        status: 'connected',
        externalIdentifier: null,
      },
    ])
    mockContainer.mockResolvedValue(containerWith(em) as never)

    const response = await getChannels()
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.items[0]).toMatchObject({
      id: 'ch-1',
      providerKey: 'resend',
      availability: {
        inbound: { available: false, code: 'provider_has_no_inbound' },
        outbound: { available: true, code: 'ready' },
      },
    })
    expect(payload.summary).toMatchObject({ total: 1, inboundUnavailable: 1, outboundUnavailable: 0 })
  })

  it('reports a disconnected WhatsApp account as unable to receive or send', async () => {
    mockHasAdapter.mockReturnValue(true as never)
    const { em } = fakeEm([
      {
        id: 'ch-2',
        providerKey: 'whatsapp-business',
        channelType: 'whatsapp',
        displayName: 'WhatsApp 业务号',
        visibility: 'shared',
        status: 'requires_reauth',
        externalIdentifier: '1234567890',
      },
    ])
    mockContainer.mockResolvedValue(containerWith(em) as never)

    const payload = await (await getChannels()).json()
    expect(payload.items[0].availability.inbound.code).toBe('requires_reauth')
    expect(payload.items[0].availability.outbound.code).toBe('requires_reauth')
    expect(payload.summary).toMatchObject({ inboundUnavailable: 1, outboundUnavailable: 1 })
  })

  it('scopes the listing to shared plus own channels and never exposes another employee private one', async () => {
    mockHasAdapter.mockReturnValue(true as never)
    const { em, find } = fakeEm([])
    mockContainer.mockResolvedValue(containerWith(em) as never)

    await getChannels()
    const where = (find.mock.calls[0] as unknown[])[1] as Row
    expect(where).toMatchObject({ tenantId: 't1', deletedAt: null })
    expect(JSON.stringify(where)).toContain('"userId":null')
    expect(JSON.stringify(where)).toContain('"userId":"u1"')
  })

  it('rejects anonymous callers without opening a container', async () => {
    mockAuth.mockResolvedValue(null as never)
    const response = await getChannels()
    expect(response.status).toBe(401)
    expect(mockContainer).not.toHaveBeenCalled()
  })
})
