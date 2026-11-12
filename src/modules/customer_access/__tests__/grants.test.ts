/** @jest-environment node */

import { describe, expect, it } from '@jest/globals'
import {
  canWriteCustomer,
  isAccessLevel,
  isGrantLive,
  toScopeLists,
  type GrantRecord,
} from '../services/grants'

function grant(overrides: Partial<GrantRecord> = {}): GrantRecord {
  return {
    id: 'g-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    userId: 'user-1',
    customerEntityId: 'c-1',
    accessLevel: 'view',
    grantedBy: 'admin-1',
    createdAt: '2026-11-12T00:00:00.000Z',
    revokedAt: null,
    ...overrides,
  }
}

describe('customer access grants', () => {
  it('widens reads with every live grant and writes only with edit', () => {
    const lists = toScopeLists([
      grant({ customerEntityId: 'c-1', accessLevel: 'view' }),
      grant({ customerEntityId: 'c-2', accessLevel: 'edit' }),
      grant({ customerEntityId: 'c-1', accessLevel: 'edit' }),
      grant({ customerEntityId: 'c-3', accessLevel: 'edit', revokedAt: '2026-11-12T01:00:00.000Z' }),
    ])
    expect(lists.grantedEntityIds).toEqual(['c-1', 'c-2'])
    expect(lists.editableEntityIds).toEqual(['c-1', 'c-2'])
  })

  it('keeps view grants out of the write set', () => {
    const lists = toScopeLists([grant({ customerEntityId: 'c-9', accessLevel: 'view' })])
    expect(lists.grantedEntityIds).toEqual(['c-9'])
    expect(lists.editableEntityIds).toEqual([])
  })

  it('treats a revoked grant as absent', () => {
    expect(isGrantLive(grant({ revokedAt: '2026-11-12T01:00:00.000Z' }))).toBe(false)
    expect(toScopeLists([grant({ revokedAt: '2026-11-12T01:00:00.000Z' })])).toEqual({
      grantedEntityIds: [],
      editableEntityIds: [],
    })
  })

  it('allows a write for an owner or an edit grant, never for view', () => {
    const base = {
      ownerUserIds: ['user-1'],
      callerUserId: 'user-1',
      customerEntityId: 'c-1',
    }
    expect(canWriteCustomer({ ...base, customerOwnerUserId: 'user-1', editableEntityIds: [] })).toBe(true)
    expect(canWriteCustomer({ ...base, customerOwnerUserId: 'user-2', editableEntityIds: ['c-1'] })).toBe(true)
    expect(canWriteCustomer({ ...base, customerOwnerUserId: 'user-2', editableEntityIds: [] })).toBe(false)
    expect(canWriteCustomer({ ...base, customerOwnerUserId: null, editableEntityIds: [] })).toBe(false)
  })

  it('validates the access level token', () => {
    expect(isAccessLevel('view')).toBe(true)
    expect(isAccessLevel('edit')).toBe(true)
    expect(isAccessLevel('admin')).toBe(false)
    expect(isAccessLevel(null)).toBe(false)
  })
})
