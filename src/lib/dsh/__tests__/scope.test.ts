import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { resolveConfiguredCustomerScope, resolveLayeredCustomerScope } from '../tool-bridge/scope'

jest.mock('@/modules/customer_access/services/orm-repository', () => ({
  createRequestCustomerAccessRepository: jest.fn(async () => ({
    listLive: jest.fn(async () => [
      { customerEntityId: 'c-1', accessLevel: 'view', revokedAt: null },
      { customerEntityId: 'c-2', accessLevel: 'edit', revokedAt: null },
      { customerEntityId: 'c-3', accessLevel: 'edit', revokedAt: '2026-11-12T00:00:00.000Z' },
    ]),
  })),
}))

const input = { userId: 'user-1', tenantId: 'tenant-1', organizationId: 'org-1' }

describe('resolveConfiguredCustomerScope', () => {
  afterEach(() => {
    delete process.env.OM_DSH_CUSTOMER_SCOPE
  })

  it('defaults to the organization and never fakes an employee boundary', async () => {
    expect(await resolveConfiguredCustomerScope(input)).toEqual({
      mode: 'organization',
      ownerUserIds: [],
      grantedEntityIds: [],
      editableEntityIds: [],
    })
  })

  it('scopes to the calling employee when explicitly configured', async () => {
    process.env.OM_DSH_CUSTOMER_SCOPE = 'own'
    expect(await resolveConfiguredCustomerScope(input)).toEqual({
      mode: 'own',
      ownerUserIds: ['user-1'],
      grantedEntityIds: [],
      editableEntityIds: [],
    })
  })

  it('treats unknown values as organization rather than silently narrowing', async () => {
    process.env.OM_DSH_CUSTOMER_SCOPE = 'team'
    expect(await resolveConfiguredCustomerScope(input)).toEqual({
      mode: 'organization',
      ownerUserIds: [],
      grantedEntityIds: [],
      editableEntityIds: [],
    })
  })
})
