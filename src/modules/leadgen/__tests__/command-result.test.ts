/** @jest-environment node */

import { describe, expect, it } from '@jest/globals'
import { commandResultEntityId } from '../services/orm-repository'

describe('commandResultEntityId', () => {
  it('reads the wrapped result the command bus returns', () => {
    expect(commandResultEntityId({ result: { entityId: 'c-1', companyId: 'p-1' }, logEntry: {} })).toBe('c-1')
  })

  it('also reads a direct entityId from a custom bus', () => {
    expect(commandResultEntityId({ entityId: 'c-2' })).toBe('c-2')
  })

  it('returns null instead of fabricating an id', () => {
    expect(commandResultEntityId(null)).toBeNull()
    expect(commandResultEntityId({ result: {} })).toBeNull()
    expect(commandResultEntityId({ result: { entityId: '' } })).toBeNull()
  })
})
