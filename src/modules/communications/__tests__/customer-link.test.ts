import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import {
  CommunicationChannel,
  ExternalConversation,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import { CustomerEntity } from '@open-mercato/core/modules/customers/data/entities'

/**
 * Conversation ↔ customer link (S89 / design rev2 F4-01).
 *
 * The link is the hub conversation's `contactPersonId`; candidates come from the
 * installed customers module inside the caller's scope. These cases pin the two
 * risky parts: scope masking (a customer from another organization must not be
 * probeable) and idempotency (re-linking the same customer must not write).
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
const CUSTOMER = '55555555-5555-4555-8555-555555555555'
const OTHER_CUSTOMER = '66666666-6666-4666-8666-666666666666'

const signedIn = { sub: 'u1', tenantId: 't1', orgId: 'o1', roles: ['employee'] } as never

function fakeEm(options: {
  channelUserId?: string | null
  contactPersonId?: string | null
  customers?: Row[]
  customerFound?: boolean
} = {}) {
  const conversation: Row = {
    id: CONVERSATION,
    channelId: CHANNEL,
    externalConversationId: '+15550001111',
    subject: '订单 #42',
    contactPersonId: options.contactPersonId ?? null,
  }
  const calls: { where: Row[]; flushed: number } = { where: [], flushed: 0 }
  const find = jest.fn(async (entity: unknown, where: Row) => {
    calls.where.push(where)
    if (entity === CustomerEntity) return options.customers ?? []
    throw new Error(`unexpected find entity ${String(entity)}`)
  })
  const findOne = jest.fn(async (entity: unknown, where: Row) => {
    calls.where.push(where)
    if (entity === ExternalConversation) return conversation
    if (entity === CommunicationChannel) return { id: CHANNEL, userId: options.channelUserId ?? null }
    if (entity === CustomerEntity) {
      if (options.customerFound === false) return null
      return {
        id: where.id,
        displayName: '客户甲',
        kind: 'person',
        primaryEmail: 'jia@acme.test',
        primaryPhone: '+15550001111',
      }
    }
    return null
  })
  const flush = jest.fn(async () => {
    calls.flushed += 1
  })
  return { em: { find, findOne, flush }, conversation, calls }
}

function containerWith(em: unknown) {
  return { resolve: (name: string) => (name === 'em' ? { fork: () => em } : null) }
}

async function getCustomer(url: string) {
  const { GET } = await import('../api/me/threads/[id]/customer/route')
  return GET(new Request(`http://localhost/api/communications/me/threads/${CONVERSATION}/customer${url}`), {
    params: { id: CONVERSATION },
  })
}

async function putCustomer(body: unknown) {
  const { PUT } = await import('../api/me/threads/[id]/customer/route')
  return PUT(
    new Request(`http://localhost/api/communications/me/threads/${CONVERSATION}/customer`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
    { params: { id: CONVERSATION } },
  )
}

describe('GET conversation customer', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockAuth.mockResolvedValue(signedIn)
  })

  it('returns the linked customer and no candidates for a too-short query', async () => {
    const { em, calls } = fakeEm({ contactPersonId: CUSTOMER })
    mockContainer.mockResolvedValue(containerWith(em) as never)

    const response = await getCustomer('?q=a')
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.linked).toMatchObject({ id: CUSTOMER, displayName: '客户甲' })
    expect(payload.candidates).toEqual([])
    expect(payload.externalConversationId).toBe('+15550001111')
    // No candidate query was issued for a one-character term.
    expect(calls.where.some((where) => '$or' in where)).toBe(false)
  })

  it('searches candidates inside the tenant/organization scope and escapes wildcards', async () => {
    const { em, calls } = fakeEm({
      customers: [
        { id: CUSTOMER, displayName: '客户甲', kind: 'person', primaryEmail: 'jia@acme.test', primaryPhone: '+15550001111' },
      ],
    })
    mockContainer.mockResolvedValue(containerWith(em) as never)

    const response = await getCustomer('?q=100%')
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.candidates).toHaveLength(1)
    const candidateWhere = calls.where.find((where) => '$or' in where) as Row
    expect(candidateWhere).toMatchObject({ tenantId: 't1', organizationId: 'o1', deletedAt: null })
    const orClause = JSON.stringify(candidateWhere.$or)
    expect(orClause).toContain('100\\\\%')
  })

  it('masks another employee personal channel as not found', async () => {
    const { em } = fakeEm({ channelUserId: 'u2' })
    mockContainer.mockResolvedValue(containerWith(em) as never)
    const response = await getCustomer('')
    expect(response.status).toBe(404)
  })

  it('rejects anonymous callers', async () => {
    mockAuth.mockResolvedValue(null as never)
    const response = await getCustomer('')
    expect(response.status).toBe(401)
  })
})

describe('PUT conversation customer', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockAuth.mockResolvedValue(signedIn)
  })

  it('links the customer and writes the conversation', async () => {
    const { em, conversation, calls } = fakeEm()
    mockContainer.mockResolvedValue(containerWith(em) as never)

    const response = await putCustomer({ customerId: CUSTOMER })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ linked: { id: CUSTOMER } })
    expect(conversation.contactPersonId).toBe(CUSTOMER)
    expect(calls.flushed).toBe(1)
  })

  it('does not write when the customer is already linked', async () => {
    const { em, calls } = fakeEm({ contactPersonId: CUSTOMER })
    mockContainer.mockResolvedValue(containerWith(em) as never)

    const response = await putCustomer({ customerId: CUSTOMER })
    expect(response.status).toBe(200)
    expect(calls.flushed).toBe(0)
  })

  it('unlinks with null', async () => {
    const { em, conversation, calls } = fakeEm({ contactPersonId: CUSTOMER })
    mockContainer.mockResolvedValue(containerWith(em) as never)

    const response = await putCustomer({ customerId: null })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ linked: null, changed: true })
    expect(conversation.contactPersonId).toBeNull()
    expect(calls.flushed).toBe(1)
  })

  it('masks a customer outside the scope as not found and writes nothing', async () => {
    const { em, conversation, calls } = fakeEm({ customerFound: false })
    mockContainer.mockResolvedValue(containerWith(em) as never)

    const response = await putCustomer({ customerId: OTHER_CUSTOMER })
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ error: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' })
    expect(conversation.contactPersonId ?? null).toBeNull()
    expect(calls.flushed).toBe(0)
  })

  it('rejects a non-uuid customer id before opening a container', async () => {
    const response = await putCustomer({ customerId: 'not-a-uuid' })
    expect(response.status).toBe(422)
    expect(mockContainer).not.toHaveBeenCalled()
  })

  it('rejects anonymous callers', async () => {
    mockAuth.mockResolvedValue(null as never)
    const response = await putCustomer({ customerId: CUSTOMER })
    expect(response.status).toBe(401)
    expect(mockContainer).not.toHaveBeenCalled()
  })
})
