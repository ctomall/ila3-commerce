/**
 * The two controls a dispatch must respect before it can record a send:
 * a suppression hit on the recipient, and a funded `send` quota reservation.
 *
 * Both read only existing tables (`leadgen_suppressions`, `leadgen_quota_*`);
 * no provider is contacted and no new schema is introduced.
 */
import type { EntityManager } from '@mikro-orm/postgresql'
import type { SendGuards } from './send-service'

export function createOrmSendGuards(em: EntityManager): SendGuards {
  return {
    async isSuppressed(input) {
      const rows = (await em.getConnection().execute(
        'select 1 as hit from "leadgen_suppressions" where "tenant_id" = ? and "organization_id" = ? and "email_hash" = ? and "released_at" is null limit 1',
        [input.tenantId, input.organizationId, input.emailHash],
      )) as unknown as Array<{ hit: number }> | undefined
      return Array.isArray(rows) && rows.length === 1
    },

    async consumeLease(input) {
      let outcome: { ok: true; reservationId: string; units: number } | { ok: false; code: 'lease_not_found' | 'lease_not_send' | 'lease_expired' | 'lease_already_used' } = {
        ok: false,
        code: 'lease_not_found',
      }
      try {
        await em.transactional(async (tx) => {
          const claimed = (await tx.getConnection().execute(
            'update "leadgen_quota_reservations" r set "state" = \'consumed\', "consumed_at" = now() where r."lease_token" = ? and r."tenant_id" = ? and r."organization_id" = ? and r."state" = \'reserved\' and r."expires_at" > now() and exists (select 1 from "leadgen_quota_buckets" b where b."id" = r."bucket_id" and b."quota_kind" = \'send\') returning r."id", r."bucket_id", r."units"',
            [input.leaseToken, input.tenantId, input.organizationId],
          )) as unknown as Array<{ id: string; bucket_id: string; units: number }> | undefined
          if (!Array.isArray(claimed) || claimed.length !== 1) throw new Error('lease-not-consumed')
          const row = claimed[0]
          const moved = (await tx.getConnection().execute(
            'update "leadgen_quota_buckets" set "reserved_units" = "reserved_units" - ?, "consumed_units" = "consumed_units" + ?, "version" = "version" + 1, "updated_at" = now() where "id" = ? and "reserved_units" >= ? returning "id"',
            [row.units, row.units, row.bucket_id, row.units],
          )) as unknown as Array<{ id: string }> | undefined
          if (!Array.isArray(moved) || moved.length !== 1) throw new Error('bucket-not-moved')
          outcome = { ok: true, reservationId: row.id, units: Number(row.units) }
        })
      } catch {
        // The transaction rolled back: nothing moved. Explain why by reading the row.
        const rows = (await em.getConnection().execute(
          'select r."state", r."expires_at" <= now() as expired, b."quota_kind" from "leadgen_quota_reservations" r join "leadgen_quota_buckets" b on b."id" = r."bucket_id" where r."lease_token" = ? and r."tenant_id" = ? and r."organization_id" = ? limit 1',
          [input.leaseToken, input.tenantId, input.organizationId],
        )) as unknown as Array<{ state: string; expired: boolean; quota_kind: string }> | undefined
        if (!Array.isArray(rows) || rows.length !== 1) return { ok: false, code: 'lease_not_found' }
        const row = rows[0]
        if (row.quota_kind !== 'send') return { ok: false, code: 'lease_not_send' }
        if (row.state !== 'reserved') return { ok: false, code: 'lease_already_used' }
        if (row.expired) return { ok: false, code: 'lease_expired' }
        return { ok: false, code: 'lease_not_found' }
      }
      return outcome
    },

    async refundLease(input) {
      await em.transactional(async (tx) => {
        const reverted = (await tx.getConnection().execute(
          'update "leadgen_quota_reservations" set "state" = \'refunded\', "refunded_at" = now() where "lease_token" = ? and "tenant_id" = ? and "organization_id" = ? and "state" = \'consumed\' returning "id", "bucket_id", "units"',
          [input.leaseToken, input.tenantId, input.organizationId],
        )) as unknown as Array<{ id: string; bucket_id: string; units: number }> | undefined
        if (!Array.isArray(reverted) || reverted.length !== 1) return
        const row = reverted[0]
        await tx.getConnection().execute(
          'update "leadgen_quota_buckets" set "reserved_units" = "reserved_units" + ?, "consumed_units" = "consumed_units" - ?, "version" = "version" + 1, "updated_at" = now() where "id" = ? and "consumed_units" >= ?',
          [row.units, row.units, row.bucket_id, row.units],
        )
      })
    },
  }
}

export async function createRequestSendGuards(): Promise<SendGuards> {
  const { createRequestContainer } = await import('@open-mercato/shared/lib/di/container')
  const container = await createRequestContainer()
  return createOrmSendGuards(container.resolve<EntityManager>('em').fork())
}
