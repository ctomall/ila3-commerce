/**
 * Quota ledger maths (M5/M6), as pure functions over a bucket snapshot.
 *
 * The database holds the rows; this decides headroom, lease validity and the effective
 * limit across the four levels. Keeping it pure means the same arithmetic can be unit
 * tested and reused by the reservation command.
 */

export type Bucket = {
  /** Level this bucket belongs to; the effective limit is the minimum across levels. */
  scope: 'tenant' | 'department' | 'employee' | 'task'
  limit: number
  reserved: number
  consumed: number
}

export type Reservation = {
  leaseToken: string
  bucketScope: Bucket['scope']
  units: number
  state: 'reserved' | 'consumed' | 'refunded' | 'expired'
  expiresAt: string
}

export type ReserveResult =
  | { ok: true; units: number; remainingAfter: number }
  | { ok: false; reason: string; available: number }

export function headroom(bucket: Bucket): number {
  return Math.max(0, bucket.limit - bucket.consumed - bucket.reserved)
}

/** Effective limit for one reservation is the smallest headroom across the levels. */
export function effectiveHeadroom(buckets: Bucket[]): number {
  if (buckets.length === 0) return 0
  return Math.min(...buckets.map(headroom))
}

export function reserve(buckets: Bucket[], units: number): ReserveResult {
  if (!Number.isInteger(units) || units <= 0) {
    return { ok: false, reason: '预留数量必须是正整数', available: effectiveHeadroom(buckets) }
  }
  const available = effectiveHeadroom(buckets)
  if (available < units) {
    const blocking = buckets
      .filter((b) => headroom(b) < units)
      .map((b) => `${b.scope} 剩余 ${headroom(b)}`)
      .join('、')
    return { ok: false, reason: `额度不足：${blocking}`, available }
  }
  return { ok: true, units, remainingAfter: available - units }
}

/** Consume requires a matching lease, an unexpired reservation and the reserved state. */
export function consume(
  reservation: Reservation,
  expectedLease: string,
  now: string,
): { ok: true; consumedUnits: number } | { ok: false; reason: string } {
  if (reservation.leaseToken !== expectedLease) return { ok: false, reason: 'lease 不匹配' }
  if (reservation.state !== 'reserved') return { ok: false, reason: `状态为 ${reservation.state}，不能消费` }
  const expires = Date.parse(reservation.expiresAt)
  const current = Date.parse(now)
  if (!Number.isFinite(expires) || !Number.isFinite(current)) return { ok: false, reason: '时间无法解析' }
  if (expires <= current) return { ok: false, reason: '预留已过期，应先回收' }
  return { ok: true, consumedUnits: reservation.units }
}

export function refund(
  reservation: Reservation,
  expectedLease: string,
): { ok: true; refundedUnits: number } | { ok: false; reason: string } {
  if (reservation.leaseToken !== expectedLease) return { ok: false, reason: 'lease 不匹配' }
  if (reservation.state !== 'reserved') return { ok: false, reason: `状态为 ${reservation.state}，不能退还` }
  return { ok: true, refundedUnits: reservation.units }
}

/** Sweeper: reservations past their lease are returned, never silently kept. */
export function expiredReservations(reservations: Reservation[], now: string): Reservation[] {
  const current = Date.parse(now)
  return reservations.filter((r) => r.state === 'reserved' && Date.parse(r.expiresAt) <= current)
}

/**
 * Apply one reservation to its bucket snapshot. The returned bucket is what the caller
 * writes back inside the same transaction that takes the row lock.
 */
export function applyReservation(bucket: Bucket, reservation: Reservation): Bucket {
  if (reservation.state === 'reserved') {
    return { ...bucket, reserved: bucket.reserved + reservation.units }
  }
  if (reservation.state === 'consumed') {
    return { ...bucket, reserved: Math.max(0, bucket.reserved - reservation.units), consumed: bucket.consumed + reservation.units }
  }
  if (reservation.state === 'refunded') {
    return { ...bucket, reserved: Math.max(0, bucket.reserved - reservation.units) }
  }
  return { ...bucket, reserved: Math.max(0, bucket.reserved - reservation.units) }
}
