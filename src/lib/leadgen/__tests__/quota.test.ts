import { describe, expect, it } from '@jest/globals'
import {
  applyReservation,
  consume,
  effectiveHeadroom,
  expiredReservations,
  headroom,
  refund,
  reserve,
  type Bucket,
  type Reservation,
} from '../quota'

const NOW = '2026-11-08T10:00:00Z'

const tenant: Bucket = { scope: 'tenant', limit: 100, reserved: 10, consumed: 20 }
const employee: Bucket = { scope: 'employee', limit: 12, reserved: 0, consumed: 9 }

const reservation: Reservation = {
  leaseToken: 'lease-1',
  bucketScope: 'employee',
  units: 2,
  state: 'reserved',
  expiresAt: '2026-11-08T11:00:00Z',
}

describe('headroom', () => {
  it('subtracts both reserved and consumed', () => {
    expect(headroom(tenant)).toBe(70)
    expect(headroom({ ...tenant, reserved: 90 })).toBe(0)
  })

  it('takes the minimum across levels — the tightest bucket wins', () => {
    expect(effectiveHeadroom([tenant, employee])).toBe(3)
    expect(effectiveHeadroom([])).toBe(0)
  })
})

describe('reserve', () => {
  it('accepts when every level has room and reports what is left', () => {
    const result = reserve([tenant, employee], 2)
    expect(result).toEqual({ ok: true, units: 2, remainingAfter: 1 })
  })

  it('refuses and names the blocking level', () => {
    const result = reserve([tenant, employee], 5)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.available).toBe(3)
      expect(result.reason).toContain('employee')
    }
  })

  it('refuses non-positive or fractional units', () => {
    expect(reserve([tenant], 0).ok).toBe(false)
    expect(reserve([tenant], 1.5).ok).toBe(false)
  })
})

describe('consume / refund', () => {
  it('requires the matching lease and the reserved state', () => {
    expect(consume(reservation, 'lease-1', NOW).ok).toBe(true)
    expect(consume(reservation, 'lease-2', NOW).ok).toBe(false)
    expect(consume({ ...reservation, state: 'consumed' }, 'lease-1', NOW).ok).toBe(false)
    expect(refund(reservation, 'lease-1').ok).toBe(true)
    expect(refund({ ...reservation, state: 'refunded' }, 'lease-1').ok).toBe(false)
  })

  it('refuses to consume an expired reservation', () => {
    const result = consume(reservation, 'lease-1', '2026-11-08T11:00:01Z')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('过期')
  })
})

describe('sweeper and bucket application', () => {
  it('finds only expired, still-reserved rows', () => {
    const rows: Reservation[] = [
      { ...reservation, leaseToken: 'a', expiresAt: '2026-11-08T09:00:00Z' },
      { ...reservation, leaseToken: 'b', expiresAt: '2026-11-08T12:00:00Z' },
      { ...reservation, leaseToken: 'c', state: 'consumed', expiresAt: '2026-11-08T09:00:00Z' },
    ]
    expect(expiredReservations(rows, NOW).map((r) => r.leaseToken)).toEqual(['a'])
  })

  it('moves units between reserved and consumed without losing or duplicating any', () => {
    const reserved = applyReservation(employee, reservation)
    expect(reserved.reserved).toBe(2)

    const consumed = applyReservation(reserved, { ...reservation, state: 'consumed' })
    expect(consumed.reserved).toBe(0)
    expect(consumed.consumed).toBe(11)

    const refunded = applyReservation(reserved, { ...reservation, state: 'refunded' })
    expect(refunded.reserved).toBe(0)
    expect(refunded.consumed).toBe(9)

    // never negative, even if applied twice
    expect(applyReservation({ ...employee, reserved: 0 }, { ...reservation, state: 'refunded' }).reserved).toBe(0)
  })
})
