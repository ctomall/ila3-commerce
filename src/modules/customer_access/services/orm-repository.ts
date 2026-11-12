/**
 * MikroORM persistence for `customer_access` grants.
 *
 * `upsert` updates the live row instead of inserting a second one (the partial
 * unique index would reject it); `revoke` is a soft delete so the audit trail
 * survives. The scope resolver reads `listLive` on every authorized tool call,
 * so a revoked grant stops working on the next call without a restart.
 */
import type { EntityManager } from '@mikro-orm/postgresql'
import { CustomerAccessGrant } from '../data/entities'
import { isAccessLevel, type CustomerAccessLevel, type GrantRecord } from './grants'

export type CustomerAccessRepository = {
  listLive(input: { tenantId: string; organizationId: string; userId: string }): Promise<GrantRecord[]>
  upsert(input: {
    tenantId: string
    organizationId: string
    userId: string
    customerEntityId: string
    accessLevel: CustomerAccessLevel
    grantedBy: string | null
    now: string
  }): Promise<GrantRecord>
  revoke(input: {
    id: string
    tenantId: string
    organizationId: string
    now: string
  }): Promise<GrantRecord | null>
}

function toRecord(row: CustomerAccessGrant): GrantRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    userId: row.userId,
    customerEntityId: row.customerEntityId,
    accessLevel: row.accessLevel,
    grantedBy: row.grantedBy ?? null,
    createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
    revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : null,
  }
}

export function createCustomerAccessRepository(em: EntityManager): CustomerAccessRepository {
  const fork = () => em.fork()
  return {
    async listLive(input) {
      const rows = await fork().find(CustomerAccessGrant, {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        userId: input.userId,
        revokedAt: null,
      })
      return rows.map(toRecord)
    },

    async upsert(input) {
      if (!isAccessLevel(input.accessLevel)) throw new Error('invalid access level')
      const manager = fork()
      const existing = await manager.findOne(CustomerAccessGrant, {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        userId: input.userId,
        customerEntityId: input.customerEntityId,
        revokedAt: null,
      })
      if (existing) {
        existing.accessLevel = input.accessLevel
        existing.grantedBy = input.grantedBy
        await manager.flush()
        return toRecord(existing)
      }
      const entity = manager.create(CustomerAccessGrant, {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        userId: input.userId,
        customerEntityId: input.customerEntityId,
        accessLevel: input.accessLevel,
        grantedBy: input.grantedBy,
        createdAt: new Date(input.now),
        revokedAt: null,
      })
      manager.persist(entity)
      await manager.flush()
      return toRecord(entity)
    },

    async revoke(input) {
      const manager = fork()
      const row = await manager.findOne(CustomerAccessGrant, {
        id: input.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        revokedAt: null,
      })
      if (!row) return null
      row.revokedAt = new Date(input.now)
      await manager.flush()
      return toRecord(row)
    },
  }
}

export async function createRequestCustomerAccessRepository(): Promise<CustomerAccessRepository> {
  const { createRequestContainer } = await import('@open-mercato/shared/lib/di/container')
  const container = await createRequestContainer()
  return createCustomerAccessRepository(container.resolve<EntityManager>('em'))
}
