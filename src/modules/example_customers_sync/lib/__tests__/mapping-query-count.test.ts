import { describe, expect, it, beforeEach, jest } from '@jest/globals'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findWithDecryption: jest.fn(),
  findOneWithDecryption: jest.fn(),
}))

import { findWithDecryption, findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { findMappingsForLegacyLinks } from '../mappings'

type FindMany = (...args: unknown[]) => Promise<unknown[]>
const findMany = findWithDecryption as unknown as jest.MockedFunction<FindMany> & {
  mock: { calls: unknown[][] }
}
const findOne = findOneWithDecryption as unknown as jest.MockedFunction<FindMany>
const scope = { tenantId: 't1', organizationId: 'o1' }

describe('findMappingsForLegacyLinks query count', () => {
  beforeEach(() => {
    findMany.mockReset()
    findOne.mockReset()
  })

  it('issues exactly one query for a whole page of links', async () => {
    findMany.mockResolvedValue([])
    const keys = Array.from({ length: 50 }, (_, index) => `todo-${index}`)
    await findMappingsForLegacyLinks({} as never, scope as never, keys)
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findOne).not.toHaveBeenCalled()
    const where = (findMany.mock.calls[0] as unknown[])[2] as { $or: Array<Record<string, { $in: string[] }>> }
    expect(where.$or[0].todoId.$in).toHaveLength(50)
    expect(where.$or[1].interactionId.$in).toHaveLength(50)
  })

  it('deduplicates keys and skips the query entirely without input', async () => {
    findMany.mockResolvedValue([])
    await findMappingsForLegacyLinks({} as never, scope as never, ['a', 'a', 'b'])
    const where = (findMany.mock.calls[0] as unknown[])[2] as { $or: Array<Record<string, { $in: string[] }>> }
    expect(where.$or[0].todoId.$in).toEqual(['a', 'b'])

    findMany.mockReset()
    await findMappingsForLegacyLinks({} as never, scope as never, [])
    expect(findMany).not.toHaveBeenCalled()
  })

  it('scopes the query to the tenant and organization', async () => {
    findMany.mockResolvedValue([])
    await findMappingsForLegacyLinks({} as never, scope as never, ['x'])
    const where = (findMany.mock.calls[0] as unknown[])[2] as Record<string, unknown>
    expect(where.tenantId).toBe('t1')
    expect(where.organizationId).toBe('o1')
  })
})
