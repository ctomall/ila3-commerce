/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals'
import {
  createSuppressionService,
  type SuppressionReason,
  type SuppressionRepository,
  type SuppressionRow,
} from '../services/suppression-service'
import { recipientHashOf } from '../services/outreach-service'

const NOW = '2026-11-12T19:00:00.000Z'
const TENANT = 'tenant-1'
const ORG = 'org-1'

function makeRepo(seed: SuppressionRow[] = []) {
  const state = { rows: [...seed] }
  let seq = 0
  const repo: SuppressionRepository = {
    findActive: jest.fn(async (input: { tenantId: string; emailHash: string }) =>
      state.rows.find((row) => row.tenantId === input.tenantId && row.emailHash === input.emailHash && !row.releasedAt) ?? null),
    insert: jest.fn(async (input: Parameters<SuppressionRepository['insert']>[0]) => {
      if (state.rows.some((row) => row.emailHash === input.emailHash && !row.releasedAt)) {
        throw new Error('duplicate key value violates unique constraint')
      }
      const row: SuppressionRow = {
        id: input.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        emailHash: input.emailHash,
        email: input.email,
        reason: input.reason,
        sourceSendId: input.sourceSendId,
        createdAt: input.now,
        releasedAt: null,
      }
      state.rows.push(row)
      return row
    }),
    list: jest.fn(async (input: { tenantId: string; limit: number }) =>
      state.rows
        .filter((row) => row.tenantId === input.tenantId && !row.releasedAt)
        .slice(0, input.limit)),
    release: jest.fn(async (input: { tenantId: string; emailHash: string; now: string }) => {
      let changed = 0
      for (const row of state.rows) {
        if (row.tenantId === input.tenantId && row.emailHash === input.emailHash && !row.releasedAt) {
          row.releasedAt = input.now
          changed += 1
        }
      }
      return changed
    }),
  }
  return { repo, state, nextId: () => `sup-${++seq}` }
}

function serviceFor(repo: SuppressionRepository) {
  const { nextId } = makeRepo()
  void nextId
  let n = 0
  return createSuppressionService({ repo, now: () => NOW, newId: () => `sup-${++n}` })
}

describe('suppression service', () => {
  it('records an address and replays the same active row', async () => {
    const { repo, state } = makeRepo()
    const service = serviceFor(repo)

    const first = await service.add({ tenantId: TENANT, organizationId: ORG, email: 'buyer@example.com', reason: 'unsubscribe' })
    const second = await service.add({ tenantId: TENANT, organizationId: ORG, email: 'BUYER@example.com ', reason: 'unsubscribe' })

    expect(first.ok && first.value.created).toBe(true)
    expect(second.ok && second.value.created).toBe(false)
    if (first.ok && second.ok) expect(second.value.suppression.id).toBe(first.value.suppression.id)
    expect(state.rows).toHaveLength(1)
    expect(state.rows[0].emailHash).toBe(recipientHashOf('buyer@example.com'))
  })

  it('reports a suppression by address and clears it on release', async () => {
    const { repo, state } = makeRepo()
    const service = serviceFor(repo)
    await service.add({ tenantId: TENANT, organizationId: ORG, email: 'buyer@example.com', reason: 'complaint' })

    await expect(service.check({ tenantId: TENANT, email: 'buyer@example.com' })).resolves.toEqual({
      ok: true,
      value: { suppressed: true, reason: 'complaint' },
    })

    await expect(
      service.release({ tenantId: TENANT, organizationId: ORG, email: 'buyer@example.com' }),
    ).resolves.toEqual({ ok: true, value: { released: 1 } })
    await expect(service.check({ tenantId: TENANT, email: 'buyer@example.com' })).resolves.toEqual({
      ok: true,
      value: { suppressed: false, reason: null },
    })
    // Releasing twice is a no-op, not an error.
    await expect(
      service.release({ tenantId: TENANT, organizationId: ORG, email: 'buyer@example.com' }),
    ).resolves.toEqual({ ok: true, value: { released: 0 } })
    expect(state.rows).toHaveLength(1)
  })

  it('does not see another tenant suppression', async () => {
    const { repo } = makeRepo()
    const service = serviceFor(repo)
    await service.add({ tenantId: 'tenant-2', organizationId: ORG, email: 'buyer@example.com', reason: 'bounce' })

    await expect(service.check({ tenantId: TENANT, email: 'buyer@example.com' })).resolves.toEqual({
      ok: true,
      value: { suppressed: false, reason: null },
    })
  })

  it('refuses an invalid address or reason', async () => {
    const { repo } = makeRepo()
    const service = serviceFor(repo)
    await expect(
      service.add({ tenantId: TENANT, organizationId: ORG, email: 'not-an-email', reason: 'unsubscribe' }),
    ).resolves.toEqual({ ok: false, code: 'invalid_input' })
    await expect(
      service.add({
        tenantId: TENANT,
        organizationId: ORG,
        email: 'buyer@example.com',
        reason: 'because' as SuppressionReason,
      }),
    ).resolves.toEqual({ ok: false, code: 'invalid_input' })
  })

  it('lists only the active suppressions of this tenant', async () => {
    const { repo } = makeRepo()
    const service = serviceFor(repo)
    await service.add({ tenantId: TENANT, organizationId: ORG, email: 'a@example.com', reason: 'unsubscribe' })
    await service.add({ tenantId: TENANT, organizationId: ORG, email: 'b@example.com', reason: 'bounce' })
    await service.add({ tenantId: 'tenant-2', organizationId: ORG, email: 'c@example.com', reason: 'complaint' })
    await service.release({ tenantId: TENANT, organizationId: ORG, email: 'b@example.com' })

    const listed = await service.list({ tenantId: TENANT })
    expect(listed.ok).toBe(true)
    if (listed.ok) {
      expect(listed.value.items.map((row) => row.email)).toEqual(['a@example.com'])
    }
  })
})
