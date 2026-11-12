/**
 * MikroORM adapter for quota buckets and reservations.
 *
 * `reserveBuckets` is one transaction with a conditional UPDATE per level: the
 * increment only applies while `reserved + consumed + units <= limit`, so two
 * concurrent reservations cannot both pass the pure-arithmetic check.
 */
import type { EntityManager } from '@mikro-orm/postgresql'
import { LeadgenQuotaBucket, LeadgenQuotaReservation } from '../data/entities'
import type {
  QuotaBucketRow,
  QuotaKind,
  QuotaRepository,
  ReservationRow,
} from './quota-service'

function bucketRow(row: LeadgenQuotaBucket): QuotaBucketRow {
  return {
    id: row.id,
    scopeKind: row.scopeKind,
    scopeId: row.scopeId ?? null,
    quotaKind: row.quotaKind as QuotaKind,
    periodKey: row.periodKey,
    limitUnits: row.limitUnits,
    reservedUnits: row.reservedUnits,
    consumedUnits: row.consumedUnits,
  }
}

function reservationRow(row: LeadgenQuotaReservation): ReservationRow {
  return {
    id: row.id,
    leaseToken: row.leaseToken,
    bucketId: row.bucketId,
    units: row.units,
    state: row.state,
    expiresAt: (row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt)).toISOString(),
    idempotencyKey: row.idempotencyKey,
  }
}

export function createOrmQuotaRepository(em: EntityManager): QuotaRepository {
  return {
    async listBuckets(input) {
      const where: Record<string, unknown> = {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        periodKey: input.periodKey,
      }
      if (input.quotaKind) where.quotaKind = input.quotaKind
      const rows = await em.fork().find(LeadgenQuotaBucket, where, { orderBy: { scopeKind: 'asc' } })
      return rows.map(bucketRow)
    },

    async findReservation(input) {
      const row = await em.fork().findOne(LeadgenQuotaReservation, {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
      })
      return row ? reservationRow(row) : null
    },

    async reserveBuckets(input) {
      await em.transactional(async (tx) => {
        for (const bucket of input.buckets) {
          // Update-with-RETURNING, because MikroORM's `execute` resolves to the rows,
          // not to a driver result object: reading `affectedRows` from it made every
          // reservation fail as "concurrent reservation lost".
          const rows = (await tx.getConnection().execute(
            'update "leadgen_quota_buckets" set "reserved_units" = "reserved_units" + ?, "version" = "version" + 1, "updated_at" = now() where "id" = ? and "reserved_units" + "consumed_units" + ? <= "limit_units" returning "id"',
            [input.units, bucket.id, input.units],
          )) as unknown as Array<{ id: string }> | undefined
          if (!Array.isArray(rows) || rows.length !== 1) throw new Error('quota level exhausted')
        }
      })
    },

    async insertReservation(input) {
      const manager = em.fork()
      const row = manager.create(LeadgenQuotaReservation, {
        id: input.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        bucketId: input.bucketId,
        leaseToken: input.leaseToken,
        idempotencyKey: input.idempotencyKey,
        units: input.units,
        state: 'reserved',
        subjectKind: input.taskId ? 'task' : null,
        subjectId: input.taskId,
        expiresAt: new Date(input.expiresAt),
        createdAt: new Date(input.now),
      })
      manager.persist(row)
      await manager.flush()
      return reservationRow(row)
    },
  }
}

export async function createRequestQuotaRepository(): Promise<QuotaRepository> {
  const { createRequestContainer } = await import('@open-mercato/shared/lib/di/container')
  const container = await createRequestContainer()
  return createOrmQuotaRepository(container.resolve<EntityManager>('em').fork())
}
