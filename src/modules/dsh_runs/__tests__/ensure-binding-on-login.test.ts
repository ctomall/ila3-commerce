import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const findOne = jest.fn<() => Promise<unknown>>()
const create = jest.fn<(entity: unknown, data: unknown) => unknown>()
const persist = jest.fn<() => void>()
const flush = jest.fn<() => Promise<void>>()
const fork = jest.fn(() => ({ findOne, create, persist, flush }))
const getOrm = jest.fn(async () => ({ em: { fork } }))

jest.mock('@open-mercato/shared/lib/db/mikro', () => ({ getOrm }))
jest.mock('../data/entities', () => ({ DshAssistantBinding: class DshAssistantBinding {} }))

import handler from '../subscribers/ensure-binding-on-login'

const payload = { id: 'user-1', tenantId: 'tenant-1', organizationId: 'org-1' }

describe('ensure-binding-on-login', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    findOne.mockResolvedValue(null)
    create.mockImplementation((_entity, data) => data)
  })

  it('creates an active binding when the employee has none', async () => {
    await handler(payload)

    expect(findOne).toHaveBeenCalledWith(expect.anything(), {
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1',
    })
    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1', status: 'active' }),
    )
    expect(persist).toHaveBeenCalled()
    expect(flush).toHaveBeenCalled()
  })

  it('does nothing when a binding already exists', async () => {
    findOne.mockResolvedValueOnce({ id: 'binding-1' })
    await handler(payload)
    expect(create).not.toHaveBeenCalled()
    expect(flush).not.toHaveBeenCalled()
  })

  it('ignores a unique-constraint race and never throws', async () => {
    flush.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }))
    await expect(handler(payload)).resolves.toBeUndefined()
  })

  it('skips payloads without a full identity triple', async () => {
    await handler({ id: 'user-1', tenantId: 'tenant-1', organizationId: null })
    expect(getOrm).not.toHaveBeenCalled()
  })
})
