import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { MessageChannelLink } from '@open-mercato/core/modules/communication_channels/data/entities'

/**
 * S91 / design rev2 F8-03: product-side reconciliation of `unknown` outbound
 * results. The rules mirror the CLI: append a human verdict to the link metadata,
 * never change delivery_status, never re-send, and refuse a verdict without an
 * explanation.
 */

jest.mock('@open-mercato/shared/lib/auth/server', () => ({ getAuthFromRequest: jest.fn() }))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('@open-mercato/core/modules/communication_channels/lib/access-control', () => ({
  channelOrgScopeWhere: () => ({ organizationId: 'o1' }),
}))

import {
  MIN_NOTE_LENGTH,
  ReconciliationError,
  listUnknownLinks,
  readReconciliation,
  recordReconciliation,
} from '../lib/unknown-reconciliation'

const mockAuth = getAuthFromRequest as jest.MockedFunction<typeof getAuthFromRequest>
const mockContainer = createRequestContainer as jest.MockedFunction<typeof createRequestContainer>

type Row = Record<string, unknown>

const LINK = '77777777-7777-4777-8777-777777777777'
const CONVERSATION = '22222222-2222-4222-8222-222222222222'

const signedIn = { sub: 'u1', tenantId: 't1', orgId: 'o1', roles: ['admin'] } as never

function linkRow(overrides: Row = {}): Row {
  return {
    id: LINK,
    messageId: 'msg-1',
    externalConversationId: CONVERSATION,
    providerKey: 'whatsapp-business',
    channelType: 'whatsapp',
    direction: 'outbound',
    deliveryStatus: 'unknown',
    channelMetadata: { lastAttemptAt: '2026-11-12T09:00:00Z' },
    createdAt: new Date('2026-11-12T09:00:00Z'),
    ...overrides,
  }
}

function fakeEm(links: Row[]) {
  const flushed = { count: 0 }
  const find = jest.fn(async (entity: unknown, where: Row) => {
    if (entity === MessageChannelLink) return links
    if (entity === undefined) return []
    return []
  })
  const findOne = jest.fn(async (entity: unknown, where: Row) => {
    if (entity !== MessageChannelLink) return null
    if (where.id === 'not-a-uuid') {
      throw Object.assign(new Error('invalid input syntax for type uuid'), { code: '22P02' })
    }
    return links.find((link) => link.id === where.id) ?? null
  })
  const flush = jest.fn(async () => {
    flushed.count += 1
  })
  return { em: { find, findOne, flush }, find, findOne, flushed }
}

describe('listUnknownLinks', () => {
  it('lists only unresolved unknown outbound links in scope', async () => {
    const unresolved = linkRow()
    const reconciled = linkRow({
      id: 'another-link',
      channelMetadata: {
        reconciliation: { outcome: 'confirmed-sent', note: 'platform had it', operatorUserId: 'u2', at: 'now' },
      },
    })
    const { em, find } = fakeEm([unresolved, reconciled])

    const rows = await listUnknownLinks(em as never, { tenantId: 't1', organizationId: 'o1' })
    expect(rows.map((row) => row.id)).toEqual([LINK])
    const where = (find.mock.calls[0] as unknown[])[1] as Row
    expect(where).toMatchObject({ tenantId: 't1', direction: 'outbound', deliveryStatus: 'unknown' })

    const all = await listUnknownLinks(
      em as never,
      { tenantId: 't1', organizationId: 'o1' },
      { includeReconciled: true },
    )
    expect(all).toHaveLength(2)
  })
})

describe('recordReconciliation', () => {
  it('appends the verdict without touching delivery_status or sending', async () => {
    const link = linkRow()
    const { em, flushed } = fakeEm([link])

    const result = await recordReconciliation(em as never, {
      tenantId: 't1',
      organizationId: 'o1',
      linkId: LINK,
      outcome: 'confirmed-sent',
      note: '平台后台能查到该消息',
      operatorUserId: 'u1',
    })

    expect(result.record).toMatchObject({ outcome: 'confirmed-sent', operatorUserId: 'u1' })
    expect(link.deliveryStatus).toBe('unknown')
    expect(flushed.count).toBe(1)
    expect(readReconciliation(link.channelMetadata as Row)?.note).toBe('平台后台能查到该消息')
  })

  it('refuses a note shorter than the CLI minimum', async () => {
    const { em } = fakeEm([linkRow()])
    await expect(
      recordReconciliation(em as never, {
        tenantId: 't1',
        organizationId: 'o1',
        linkId: LINK,
        outcome: 'confirmed-not-sent',
        note: 'ok',
        operatorUserId: 'u1',
      }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_NOTE_TOO_SHORT', status: 422 })
    expect(MIN_NOTE_LENGTH).toBe(8)
  })

  it('refuses a link that is no longer unknown', async () => {
    const { em } = fakeEm([linkRow({ deliveryStatus: 'sent' })])
    await expect(
      recordReconciliation(em as never, {
        tenantId: 't1',
        organizationId: 'o1',
        linkId: LINK,
        outcome: 'confirmed-sent',
        note: '平台后台能查到该消息',
        operatorUserId: 'u1',
      }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_NOT_UNKNOWN', status: 409 })
  })

  it('refuses to overwrite an existing human verdict', async () => {
    const { em } = fakeEm([
      linkRow({
        channelMetadata: {
          reconciliation: { outcome: 'confirmed-not-sent', note: 'first verdict', operatorUserId: 'u3', at: 'then' },
        },
      }),
    ])
    await expect(
      recordReconciliation(em as never, {
        tenantId: 't1',
        organizationId: 'o1',
        linkId: LINK,
        outcome: 'confirmed-sent',
        note: '平台后台能查到该消息',
        operatorUserId: 'u1',
      }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_ALREADY_RECORDED', status: 409 })
  })

  it('masks a link outside scope and a malformed id as 404', async () => {
    const { em } = fakeEm([])
    await expect(
      recordReconciliation(em as never, {
        tenantId: 't1',
        organizationId: 'o1',
        linkId: '88888888-8888-4888-8888-888888888888',
        outcome: 'confirmed-sent',
        note: '平台后台能查到该消息',
        operatorUserId: 'u1',
      }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_NOT_FOUND', status: 404 })
    await expect(
      recordReconciliation(em as never, {
        tenantId: 't1',
        organizationId: 'o1',
        linkId: 'not-a-uuid',
        outcome: 'confirmed-sent',
        note: '平台后台能查到该消息',
        operatorUserId: 'u1',
      }),
    ).rejects.toBeInstanceOf(ReconciliationError)
  })
})

describe('route /api/communications/me/reconciliation', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockAuth.mockResolvedValue(signedIn)
  })

  it('lists unresolved unknowns with conversation and channel labels', async () => {
    const link = linkRow()
    const em = {
      find: jest.fn(async (entity: unknown) => {
        if (entity === MessageChannelLink) return [link]
        if (entity?.toString().includes('ExternalConversation') || (entity as { name?: string })?.name === 'ExternalConversation') {
          return [{ id: CONVERSATION, channelId: 'ch-1', subject: '订单 #42', externalConversationId: '+15550001111' }]
        }
        return [{ id: 'ch-1', displayName: 'WhatsApp 业务号' }]
      }),
      flush: jest.fn(async () => undefined),
    }
    mockContainer.mockResolvedValue({ resolve: () => ({ fork: () => em }) } as never)

    const { GET } = await import('../api/me/reconciliation/route')
    const response = await GET(new Request('http://localhost/api/communications/me/reconciliation'))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.total).toBe(1)
    expect(payload.items[0]).toMatchObject({ linkId: LINK, conversationId: CONVERSATION })
  })

  it('maps a reconciliation conflict to 409', async () => {
    const em = {
      findOne: jest.fn(async () => linkRow({ deliveryStatus: 'delivered' })),
      flush: jest.fn(async () => undefined),
    }
    mockContainer.mockResolvedValue({ resolve: () => ({ fork: () => em }) } as never)

    const { POST } = await import('../api/me/reconciliation/route')
    const response = await POST(
      new Request('http://localhost/api/communications/me/reconciliation', {
        method: 'POST',
        body: JSON.stringify({ linkId: LINK, outcome: 'confirmed-sent', note: '平台后台能查到该消息' }),
      }),
    )
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'RECONCILIATION_NOT_UNKNOWN' })
  })

  it('rejects an invalid payload before opening a container', async () => {
    const { POST } = await import('../api/me/reconciliation/route')
    const response = await POST(
      new Request('http://localhost/api/communications/me/reconciliation', {
        method: 'POST',
        body: JSON.stringify({ linkId: 'nope', outcome: 'whatever', note: 'x' }),
      }),
    )
    expect(response.status).toBe(422)
    expect(mockContainer).not.toHaveBeenCalled()
  })

  it('rejects anonymous callers', async () => {
    mockAuth.mockResolvedValue(null as never)
    const { GET } = await import('../api/me/reconciliation/route')
    expect((await GET(new Request('http://localhost/api/communications/me/reconciliation'))).status).toBe(401)
  })
})
