import { afterEach, describe, expect, it } from '@jest/globals'
import { resolveConfiguredCustomerScope } from '../tool-bridge/scope'

const input = { userId: 'user-1', tenantId: 'tenant-1', organizationId: 'org-1' }

describe('resolveConfiguredCustomerScope', () => {
  afterEach(() => {
    delete process.env.OM_DSH_CUSTOMER_SCOPE
  })

  it('defaults to the organization and never fakes an employee boundary', async () => {
    expect(await resolveConfiguredCustomerScope(input)).toEqual({ mode: 'organization', ownerUserIds: [] })
  })

  it('scopes to the calling employee when explicitly configured', async () => {
    process.env.OM_DSH_CUSTOMER_SCOPE = 'own'
    expect(await resolveConfiguredCustomerScope(input)).toEqual({ mode: 'own', ownerUserIds: ['user-1'] })
  })

  it('treats unknown values as organization rather than silently narrowing', async () => {
    process.env.OM_DSH_CUSTOMER_SCOPE = 'team'
    expect(await resolveConfiguredCustomerScope(input)).toEqual({ mode: 'organization', ownerUserIds: [] })
  })
})
