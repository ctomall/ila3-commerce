/** MikroORM adapter for the suppression list. Reads and writes one existing table. */
import type { EntityManager } from '@mikro-orm/postgresql'
import { LeadgenSuppression } from '../data/entities'
import type { SuppressionReason, SuppressionRepository, SuppressionRow } from './suppression-service'

const iso = (value: Date | string | null | undefined): string | null =>
  value ? (value instanceof Date ? value.toISOString() : new Date(value).toISOString()) : null

function suppressionRow(row: LeadgenSuppression): SuppressionRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    emailHash: row.emailHash,
    email: row.email,
    reason: row.reason as SuppressionReason,
    sourceSendId: row.sourceSendId ?? null,
    createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
    releasedAt: iso(row.releasedAt),
  }
}

export function createOrmSuppressionRepository(em: EntityManager): SuppressionRepository {
  return {
    async findActive(input) {
      const row = await em.fork().findOne(LeadgenSuppression, {
        tenantId: input.tenantId,
        emailHash: input.emailHash,
        releasedAt: null,
      })
      return row ? suppressionRow(row) : null
    },

    async insert(input) {
      const manager = em.fork()
      const row = manager.create(LeadgenSuppression, {
        id: input.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        emailHash: input.emailHash,
        email: input.email,
        reason: input.reason,
        sourceSendId: input.sourceSendId,
        createdAt: new Date(input.now),
      })
      manager.persist(row)
      await manager.flush()
      return suppressionRow(row)
    },

    async release(input) {
      // The partial unique index covers active rows only, so releasing is a plain
      // update; a second release of the same address simply writes zero rows.
      return em.fork().nativeUpdate(
        LeadgenSuppression,
        {
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          emailHash: input.emailHash,
          releasedAt: null,
        },
        { releasedAt: new Date(input.now) },
      )
    },
  }
}

export async function createRequestSuppressionRepository(): Promise<SuppressionRepository> {
  const { createRequestContainer } = await import('@open-mercato/shared/lib/di/container')
  const container = await createRequestContainer()
  return createOrmSuppressionRepository(container.resolve<EntityManager>('em').fork())
}
