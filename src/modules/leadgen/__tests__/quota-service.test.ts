/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals'
import {
  createQuotaService,
  type QuotaBucketRow,
  type QuotaRepository,
  type ReservationRow,
} from '../services/quota-service'

const NOW = '2026-11-12T06:00:00.000Z'
const PERIOD = '2026-11'

function bucket(overrides: Partial<QuotaBucketRow> = {}): QuotaBucketRow {
  return {
    id: 'bucket-1', scopeKind: 'tenant', scopeId: null, quotaKind: 'lead',
    periodKey: PERIOD, limitUnits: 10, reservedUnits: 0, consumedUnits: 0, ...overrides,
  }
}

function makeRepo(rows: QuotaBucketRow[] = [bucket()]) {
  const state = { buckets: [...rows], reservations: [] as ReservationRow[], failReserve: false }
  const repo: QuotaRepository = {
    listBuckets: jest.fn(async (input: { quotaKind?: string }) =>
      state.buckets.filter((row) => !input.quotaKind || row.quotaKind === input.quotaKind)),
    findReservation: jest.fn(async (input: { idempotencyKey: string }) =>
      state.reservations.find((row) => row.idempotencyKey === input.idempotencyKey) ?? null),
    reserveBuckets: jest.fn(async (input: { units: number }) => {
      if (state.failReserve) throw new Error('lost')
      for (const row of state.buckets) row.reservedUnits += input.units
    }),
    insertReservation: jest.fn(async (input: { id: string; leaseToken: string; bucketId: string; units: number; expiresAt: string; idempotencyKey: string; subjectKind?: 'task' | 'draft' | null; subjectId?: string | null }) => {
      const row: ReservationRow = {
        id: input.id, leaseToken: input.leaseToken, bucketId: input.bucketId, units: input.units,
        state: 'reserved',
        subjectKind: input.subjectKind ?? null,
        subjectId: input.subjectId ?? null, expiresAt: input.expiresAt, idempotencyKey: input.idempotencyKey,
      }
      state.reservations.push(row)
      return row
    }),
  }
  return { repo, state }
}

const serviceFor = (repo: QuotaRepository) =>
  createQuotaService({ repo, now: () => NOW, newId: (() => { let n = 0; return () => `id-${++n}` })(), leaseMs: 300_000 })

describe('quota service', () => {
  it('reports headroom for the current period', async () => {
    const { repo } = makeRepo([bucket({ reservedUnits: 3, consumedUnits: 2 })])
    const result = await serviceFor(repo).list({ tenantId: 't', organizationId: 'o' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.periodKey).toBe(PERIOD)
      expect(result.value.buckets[0].remaining).toBe(5)
    }
  })

  it('reserves on every level and replays the same idempotency key', async () => {
    const { repo, state } = makeRepo([
      bucket({ id: 'tenant', scopeKind: 'tenant' }),
      bucket({ id: 'employee', scopeKind: 'employee', scopeId: 'u1', limitUnits: 3 }),
    ])
    const service = serviceFor(repo)
    const input = { tenantId: 't', organizationId: 'o', quotaKind: 'lead' as const, units: 2, idempotencyKey: 'idem-key-1' }
    const first = await service.reserveUnits(input)
    const second = await service.reserveUnits(input)
    expect(first.ok && first.value.replayed).toBe(false)
    expect(second.ok && second.value.replayed).toBe(true)
    expect(state.buckets.map((row) => row.reservedUnits)).toEqual([2, 2])
    expect(repo.insertReservation).toHaveBeenCalledTimes(1)
  })

  it('refuses over quota with the shortfall', async () => {
    const { repo } = makeRepo([bucket({ limitUnits: 2, reservedUnits: 2 })])
    const result = await serviceFor(repo).reserveUnits({
      tenantId: 't', organizationId: 'o', quotaKind: 'lead', units: 1, idempotencyKey: 'idem-key-2',
    })
    expect(result).toMatchObject({ ok: false, code: 'quota_exceeded' })
    expect(result.ok === false && result.extra?.available).toBe(0)
  })

  it('refuses when no bucket is configured and when units are invalid', async () => {
    const { repo } = makeRepo([])
    const service = serviceFor(repo)
    await expect(
      service.reserveUnits({ tenantId: 't', organizationId: 'o', quotaKind: 'lead', units: 1, idempotencyKey: 'idem-key-3' }),
    ).resolves.toMatchObject({ ok: false, code: 'quota_not_configured' })
    await expect(
      service.reserveUnits({ tenantId: 't', organizationId: 'o', quotaKind: 'lead', units: 0, idempotencyKey: 'idem-key-4' }),
    ).resolves.toMatchObject({ ok: false, code: 'invalid_input' })
  })

  it('turns a lost concurrent reservation into quota_exceeded', async () => {
    const { repo, state } = makeRepo()
    state.failReserve = true
    const result = await serviceFor(repo).reserveUnits({
      tenantId: 't', organizationId: 'o', quotaKind: 'lead', units: 1, idempotencyKey: 'idem-key-5',
    })
    expect(result).toMatchObject({ ok: false, code: 'quota_exceeded' })
  })

  it('refuses a send reservation that does not name its draft', async () => {
    const { repo } = makeRepo([bucket({ quotaKind: 'send' })])
    const result = await serviceFor(repo).reserveUnits({
      tenantId: 't', organizationId: 'o', quotaKind: 'send', units: 1, idempotencyKey: 'send-key-1',
    })
    expect(result).toMatchObject({ ok: false, code: 'draft_required' })
  })

  it('binds a send reservation to the exact draft', async () => {
    const { repo, state } = makeRepo([bucket({ quotaKind: 'send' })])
    const result = await serviceFor(repo).reserveUnits({
      tenantId: 't', organizationId: 'o', quotaKind: 'send', units: 1,
      idempotencyKey: 'send-key-2', draftId: 'draft-9',
    })
    expect(result.ok).toBe(true)
    expect(state.reservations[0]).toMatchObject({ subjectKind: 'draft', subjectId: 'draft-9' })
  })

  it('refuses a draft on a non-send reservation', async () => {
    const { repo } = makeRepo()
    const result = await serviceFor(repo).reserveUnits({
      tenantId: 't', organizationId: 'o', quotaKind: 'lead', units: 1,
      idempotencyKey: 'lead-key-1', draftId: 'draft-9',
    })
    expect(result).toMatchObject({ ok: false, code: 'invalid_input' })
  })
})
