/** @jest-environment node */

import { describe, expect, it } from '@jest/globals'
import type { CustomerScope } from '../authorize'
import { withCustomerScope } from '../crm-find-companies'

const base = { tenantId: 'tenant-1', organizationId: 'org-1', entity: { deletedAt: null } }

function scope(overrides: Partial<CustomerScope> = {}): CustomerScope {
  return { mode: 'organization', ownerUserIds: [], grantedEntityIds: [], editableEntityIds: [], ...overrides }
}

describe('withCustomerScope', () => {
  it('keeps organization mode unfiltered by employee', () => {
    expect(withCustomerScope(base, scope())).toEqual(base)
  })

  it('filters to owned rows only in own mode', () => {
    expect(withCustomerScope(base, scope({ mode: 'own', ownerUserIds: ['user-1'] }))).toEqual({
      ...base,
      entity: { deletedAt: null, ownerUserId: { $in: ['user-1'] } },
    })
  })

  it('ORs ownership with live grants without leaving tenant/organization filters', () => {
    expect(
      withCustomerScope(
        base,
        scope({ mode: 'own', ownerUserIds: ['user-1'], grantedEntityIds: ['c-1'], editableEntityIds: ['c-1'] }),
      ),
    ).toEqual({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      entity: {
        deletedAt: null,
        $or: [{ ownerUserId: { $in: ['user-1'] } }, { id: { $in: ['c-1'] } }],
      },
    })
  })

  it('uses grants alone when the employee owns nothing', () => {
    expect(
      withCustomerScope(base, scope({ mode: 'own', ownerUserIds: [], grantedEntityIds: ['c-1'] })),
    ).toMatchObject({ entity: { id: { $in: ['c-1'] } } })
  })

  it('matches nothing in own mode with neither ownership nor grants', () => {
    expect(withCustomerScope(base, scope({ mode: 'own', ownerUserIds: [] }))).toMatchObject({
      entity: { id: { $in: [] } },
    })
  })
})
