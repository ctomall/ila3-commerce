/**
 * M5/M6 quota reservations over the four bucket levels.
 *
 * The arithmetic is already pure (`src/lib/leadgen/quota.ts`); this service adds
 * idempotency (the client's Idempotency-Key is stored on the reservation row) and
 * the all-or-nothing write across levels: a reservation must succeed on tenant,
 * department, employee and task buckets together, or not at all.
 */
import { headroom, reserve, type Bucket } from '@/lib/leadgen/quota'

export type QuotaKind = 'lead' | 'crm_write' | 'send'

export type QuotaBucketRow = {
  id: string
  scopeKind: 'tenant' | 'department' | 'employee' | 'task'
  scopeId: string | null
  quotaKind: QuotaKind
  periodKey: string
  limitUnits: number
  reservedUnits: number
  consumedUnits: number
}

export type ReservationRow = {
  id: string
  leaseToken: string
  bucketId: string
  units: number
  state: 'reserved' | 'consumed' | 'refunded' | 'expired'
  expiresAt: string
  idempotencyKey: string
  /** What this lease is for: a run/task, or (for sends) the exact draft. */
  subjectKind: 'task' | 'draft' | null
  subjectId: string | null
}

export type QuotaRepository = {
  listBuckets(input: {
    tenantId: string
    organizationId: string
    quotaKind?: QuotaKind
    periodKey: string
  }): Promise<QuotaBucketRow[]>
  findReservation(input: {
    tenantId: string
    organizationId: string
    idempotencyKey: string
  }): Promise<ReservationRow | null>
  /** Increments reserved_units on every bucket, or throws when any level is short. */
  reserveBuckets(input: {
    buckets: QuotaBucketRow[]
    units: number
  }): Promise<void>
  insertReservation(input: {
    id: string
    tenantId: string
    organizationId: string
    bucketId: string
    leaseToken: string
    idempotencyKey: string
    units: number
    expiresAt: string
    subjectKind: 'task' | 'draft' | null
    subjectId: string | null
    now: string
  }): Promise<ReservationRow>
}

export type QuotaResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      code: 'quota_not_configured' | 'quota_exceeded' | 'invalid_input' | 'draft_required'
      extra?: Record<string, unknown>
    }

/** Monthly period; the caller-visible buckets are all for the current key. */
export function currentPeriodKey(nowIso: string): string {
  return nowIso.slice(0, 7)
}

export function toBuckets(rows: readonly QuotaBucketRow[]): Bucket[] {
  return rows.map((row) => ({
    scope: row.scopeKind,
    limit: row.limitUnits,
    reserved: row.reservedUnits,
    consumed: row.consumedUnits,
  }))
}

export function createQuotaService(deps: {
  repo: QuotaRepository
  now: () => string
  newId: () => string
  leaseMs: number
}) {
  const { repo, now, newId, leaseMs } = deps

  async function list(input: {
    tenantId: string
    organizationId: string
    quotaKind?: QuotaKind
  }): Promise<QuotaResult<{ periodKey: string; buckets: Array<QuotaBucketRow & { remaining: number }> }>> {
    const periodKey = currentPeriodKey(now())
    const rows = await repo.listBuckets({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      quotaKind: input.quotaKind,
      periodKey,
    })
    return {
      ok: true,
      value: {
        periodKey,
        buckets: rows.map((row) => ({
          ...row,
          remaining: headroom({ scope: row.scopeKind, limit: row.limitUnits, reserved: row.reservedUnits, consumed: row.consumedUnits }),
        })),
      },
    }
  }

  async function reserveUnits(input: {
    tenantId: string
    organizationId: string
    quotaKind: QuotaKind
    units: number
    idempotencyKey: string
    taskId?: string | null
    /** A `send` reservation must name the draft it may fund. */
    draftId?: string | null
  }): Promise<QuotaResult<{ reservation: ReservationRow; replayed: boolean; remaining: number }>> {
    if (!Number.isInteger(input.units) || input.units < 1) return { ok: false, code: 'invalid_input' }
    if (!input.idempotencyKey || input.idempotencyKey.length < 8) return { ok: false, code: 'invalid_input' }
    // A generic `send` lease could fund any draft; the dispatch boundary needs the
    // lease to name the body it pays for, so the binding is required at reservation.
    if (input.quotaKind === 'send' && !input.draftId) return { ok: false, code: 'draft_required' }
    if (input.quotaKind !== 'send' && input.draftId) return { ok: false, code: 'invalid_input' }
    const replay = await repo.findReservation({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
    })
    if (replay) {
      return { ok: true, value: { reservation: replay, replayed: true, remaining: 0 } }
    }
    const periodKey = currentPeriodKey(now())
    const rows = await repo.listBuckets({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      quotaKind: input.quotaKind,
      periodKey,
    })
    if (rows.length === 0) return { ok: false, code: 'quota_not_configured' }
    const decision = reserve(rows.map((row) => ({
      scope: row.scopeKind,
      limit: row.limitUnits,
      reserved: row.reservedUnits,
      consumed: row.consumedUnits,
    })), input.units)
    if (!decision.ok) {
      return { ok: false, code: 'quota_exceeded', extra: { reason: decision.reason, available: decision.available } }
    }
    try {
      await repo.reserveBuckets({ buckets: rows, units: input.units })
    } catch {
      return { ok: false, code: 'quota_exceeded', extra: { reason: 'concurrent reservation lost' } }
    }
    const at = now()
    const expiresAt = new Date(Date.parse(at) + leaseMs).toISOString()
    const reservation = await repo.insertReservation({
      id: newId(),
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      bucketId: rows[0].id,
      leaseToken: newId(),
      idempotencyKey: input.idempotencyKey,
      units: input.units,
      expiresAt,
      subjectKind: input.quotaKind === 'send' ? 'draft' : input.taskId ? 'task' : null,
      subjectId: input.quotaKind === 'send' ? (input.draftId ?? null) : (input.taskId ?? null),
      now: at,
    })
    return { ok: true, value: { reservation, replayed: false, remaining: decision.remainingAfter } }
  }

  return { list, reserveUnits }
}

export type QuotaService = ReturnType<typeof createQuotaService>
