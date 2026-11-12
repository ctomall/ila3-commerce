import { describe, expect, it, jest } from '@jest/globals'
import { Message } from '@open-mercato/core/modules/messages/data/entities'
import {
  CONVERSATION_SOURCE,
  buildInternalNoteInput,
  listInternalNotes,
} from '../lib/internal-notes'

/**
 * S96 / design rev2 F3-06: the two properties that make internal notes safe are
 * pinned here — the compose input carries no delivery path at all, and the read
 * stays inside the conversation's tenant + NULL-inclusive organization scope.
 */
describe('buildInternalNoteInput', () => {
  const base = {
    tenantId: 't1',
    organizationId: 'o1',
    userId: 'u1',
    conversationId: 'c1',
    subject: '订单 #42',
    body: '客户情绪激动，先别报价',
  }

  it('never carries a platform delivery path', () => {
    const input = buildInternalNoteInput(base)
    expect(input).toMatchObject({
      visibility: 'internal',
      sendViaEmail: false,
      isDraft: false,
      sourceEntityType: CONVERSATION_SOURCE,
      sourceEntityId: 'c1',
      tenantId: 't1',
      organizationId: 'o1',
      userId: 'u1',
      recipients: [{ userId: 'u1', type: 'to' }],
      bodyFormat: 'text',
      body: '客户情绪激动，先别报价',
    })
    for (const forbidden of ['senderChannelId', 'channelMetadata', 'attachments', 'externalEmail']) {
      expect(input).not.toHaveProperty(forbidden)
    }
  })

  it('falls back to a neutral subject and omits an empty parent', () => {
    expect(buildInternalNoteInput({ ...base, subject: '   ' }).subject).toBe('内部备注')
    expect(buildInternalNoteInput({ ...base, subject: null }).subject).toBe('内部备注')
    expect(buildInternalNoteInput(base)).not.toHaveProperty('parentMessageId')
    expect(buildInternalNoteInput({ ...base, parentMessageId: 'm1' }).parentMessageId).toBe('m1')
  })
})

describe('listInternalNotes', () => {
  it('queries only internal, non-deleted notes of this conversation in scope', async () => {
    const find = jest.fn(async () => [])
    const em = { find } as never

    await listInternalNotes(em, { tenantId: 't1', organizationId: 'o1', conversationId: 'c1' })

    expect(find).toHaveBeenCalledTimes(1)
    const [entity, where, options] = find.mock.calls[0] as unknown as [unknown, Record<string, unknown>, Record<string, unknown>]
    expect(entity).toBe(Message)
    expect(where).toMatchObject({
      tenantId: 't1',
      visibility: 'internal',
      sourceEntityType: CONVERSATION_SOURCE,
      sourceEntityId: 'c1',
      deletedAt: null,
      $or: [{ organizationId: 'o1' }, { organizationId: null }],
    })
    expect(options).toMatchObject({ orderBy: { createdAt: 'asc' }, limit: 200 })
  })

  it('narrows a session without an organization to tenant-wide notes', async () => {
    const find = jest.fn(async () => [])
    await listInternalNotes({ find } as never, { tenantId: 't1', organizationId: null, conversationId: 'c1' })
    const where = (find.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1]
    // Not "no filter": a session with no selected organization must not read every
    // organization in the tenant.
    expect(where.organizationId).toBeNull()
    expect(where).not.toHaveProperty('$or')
  })

  it('maps rows to the API shape', async () => {
    const find = jest.fn(async () => [
      {
        id: 'n1',
        body: '备注',
        bodyFormat: 'text',
        subject: '订单 #42',
        senderUserId: 'u1',
        threadId: 'th1',
        createdAt: new Date('2026-11-12T10:00:00Z'),
      },
    ])
    const notes = await listInternalNotes({ find } as never, {
      tenantId: 't1',
      organizationId: 'o1',
      conversationId: 'c1',
    })
    expect(notes).toEqual([
      {
        id: 'n1',
        body: '备注',
        bodyFormat: 'text',
        subject: '订单 #42',
        authorUserId: 'u1',
        threadId: 'th1',
        createdAt: '2026-11-12T10:00:00.000Z',
      },
    ])
  })
})
