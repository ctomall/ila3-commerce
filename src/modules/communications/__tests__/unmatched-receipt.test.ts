import { describe, expect, it, jest } from '@jest/globals'
import { recordUnmatchedReceipt } from '../lib/unmatched-receipt'
import { applyStatusEvents } from '../../channel_whatsapp/lib/status-store'
import { applyMessengerReads } from '../../channel_messenger/lib/read-store'

/**
 * Receipts are the only evidence of what the customer side actually received,
 * and the provider sends them once. These tests pin that an unmatched receipt is
 * kept (instead of dropped), deduplicated, truncated, and that its bookkeeping can
 * never break the webhook response.
 */
const TENANT = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const CHANNEL = '33333333-3333-4333-8333-333333333333'
const PROVIDER_ID = 'wamid.TEST1'

type FakeOptions = {
  existingDeadLetter?: boolean
  external?: Record<string, unknown> | null
  link?: Record<string, unknown> | null
  flushError?: boolean
}

function fakeEm(options: FakeOptions = {}) {
  const created: Array<Record<string, unknown>> = []
  const findOne = jest.fn(async (entity: unknown, where: Record<string, unknown>) => {
    const name = (entity as { name?: string })?.name
    if (name === 'ChannelIngestDeadLetter') return options.existingDeadLetter ? { id: 'dl-1' } : null
    if (name === 'ExternalMessage') return options.external ?? null
    if (name === 'MessageChannelLink') return options.link ?? null
    if (where?.id) return null
    return null
  })
  const create = jest.fn((_entity: unknown, data: Record<string, unknown>) => {
    created.push(data)
    return { ...data } as never
  })
  const persist = jest.fn(() => undefined)
  const flush = jest.fn(async () => {
    if (options.flushError) throw new Error('commit failed')
  })
  return { em: { findOne, create, persist, flush } as never, created, findOne, flush }
}

const base = {
  tenantId: TENANT,
  organizationId: ORG,
  channelId: CHANNEL,
  providerKey: 'whatsapp-business',
  externalMessageId: PROVIDER_ID,
} as const

describe('recordUnmatchedReceipt', () => {
  it('records an unmatched receipt in the existing ingest dead-letter table', async () => {
    const { em, created, flush } = fakeEm()
    const result = await recordUnmatchedReceipt({
      em,
      ...base,
      errorClass: 'receipt_unmatched',
      errorMessage: 'no external message',
      raw: { status: 'delivered' },
    })
    expect(result).toBe('recorded')
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      tenantId: TENANT,
      organizationId: ORG,
      channelId: CHANNEL,
      providerKey: 'whatsapp-business',
      externalMessageId: PROVIDER_ID,
      errorClass: 'receipt_unmatched',
    })
    expect(JSON.parse(String(created[0].rawBody))).toEqual({ status: 'delivered' })
    expect(flush).toHaveBeenCalled()
  })

  it('does not record the same receipt twice', async () => {
    const { em, created } = fakeEm({ existingDeadLetter: true })
    const result = await recordUnmatchedReceipt({
      em,
      ...base,
      errorClass: 'receipt_unmatched',
      errorMessage: 'no external message',
    })
    expect(result).toBe('duplicate')
    expect(created).toHaveLength(0)
  })

  it('skips a receipt that carries no provider identifier at all', async () => {
    const { em, created, findOne } = fakeEm()
    const result = await recordUnmatchedReceipt({
      em,
      tenantId: TENANT,
      organizationId: ORG,
      channelId: CHANNEL,
      providerKey: 'whatsapp-business',
      errorClass: 'receipt_unmatched',
      errorMessage: 'nothing to match',
    })
    expect(result).toBe('skipped')
    expect(findOne).not.toHaveBeenCalled()
    expect(created).toHaveLength(0)
  })

  it('truncates a large raw body instead of storing it whole', async () => {
    const { em, created } = fakeEm()
    await recordUnmatchedReceipt({
      em,
      ...base,
      errorClass: 'receipt_unmatched',
      errorMessage: 'no external message',
      raw: { blob: 'x'.repeat(40 * 1024) },
    })
    const body = String(created[0].rawBody)
    expect(body.endsWith('…[truncated]')).toBe(true)
    expect(Buffer.byteLength(body, 'utf8')).toBeLessThan(33 * 1024)
  })

  it('never throws when the write itself fails — the webhook must keep serving', async () => {
    const { em } = fakeEm({ flushError: true })
    await expect(
      recordUnmatchedReceipt({
        em,
      ...base,
        errorClass: 'receipt_unmatched',
        errorMessage: 'no external message',
      }),
    ).resolves.toBe('skipped')
  })
})

describe('status receipts that cannot be matched', () => {
  const event = {
    externalMessageId: PROVIDER_ID,
    recipientId: '15550000000',
    status: 'delivered' as const,
    timestamp: new Date('2026-11-12T00:00:00.000Z'),
    raw: { id: PROVIDER_ID, status: 'delivered' },
  }

  it('keeps a receipt whose provider id has no local message', async () => {
    const { em, created } = fakeEm({ external: null })
    const result = await applyStatusEvents(em, {
      tenantId: TENANT,
      organizationId: ORG,
      channelId: CHANNEL,
      providerKey: 'whatsapp-business',
      statuses: [event],
    })
    expect(result.skipped).toEqual([{ externalMessageId: PROVIDER_ID, reason: 'not-found' }])
    expect(created[0]).toMatchObject({ errorClass: 'receipt_unmatched', externalMessageId: PROVIDER_ID })
  })

  it('keeps a receipt whose message exists but has no link yet', async () => {
    const { em, created } = fakeEm({ external: { id: 'ext-1' }, link: null })
    const result = await applyStatusEvents(em, {
      tenantId: TENANT,
      organizationId: ORG,
      channelId: CHANNEL,
      providerKey: 'whatsapp-business',
      statuses: [event],
    })
    expect(result.skipped[0]).toMatchObject({ reason: 'not-found' })
    expect(created[0]).toMatchObject({ errorClass: 'receipt_unmatched_link' })
  })
})

describe('Messenger read watermarks that cannot be matched', () => {
  it('keeps a watermark for a conversation we do not have', async () => {
    const { em, created } = fakeEm()
    const result = await applyMessengerReads(em, {
      tenantId: TENANT,
      organizationId: ORG,
      channelId: CHANNEL,
      providerKey: 'messenger',
      psid: 'PSID-1',
      watermark: 1_760_000_000_000,
    })
    expect(result.conversationFound).toBe(false)
    expect(created[0]).toMatchObject({
      errorClass: 'read_unmatched_conversation',
      externalUid: 'PSID-1',
      providerKey: 'messenger',
    })
  })
})
