import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify } from './audit-stuck-outbound.mjs'

const NOW = Date.parse('2026-11-10T12:00:00Z')
const old = (m) => new Date(NOW - m * 60_000).toISOString()

test('flags only queued/pending links older than the window', () => {
  const { staleLinks } = classify({
    now: NOW,
    minutes: 30,
    links: [
      { id: 'a', delivery_status: 'queued', created_at: old(45) },
      { id: 'b', delivery_status: 'pending', created_at: old(31) },
      { id: 'c', delivery_status: 'queued', created_at: old(10) },
      { id: 'd', delivery_status: 'sent', created_at: old(90) },
      { id: 'e', delivery_status: 'failed', created_at: old(90) },
    ],
  })
  assert.deepEqual(staleLinks.map((r) => r.id), ['a', 'b'])
})

test('flags ledger rows claimed but never composed', () => {
  const { danglingLedger } = classify({
    now: NOW,
    minutes: 30,
    ledger: [
      { id: 'l1', message_id: null, created_at: old(45) },
      { id: 'l2', message_id: null, created_at: old(5) },
      { id: 'l3', message_id: 'm1', created_at: old(60) },
    ],
  })
  assert.deepEqual(danglingLedger.map((r) => r.id), ['l1'])
})

test('flags composed ledger rows with no outbound link', () => {
  const { completedWithoutLink } = classify({
    now: NOW,
    minutes: 30,
    completed: [
      { id: 'c1', message_id: 'm1', link_id: null, created_at: old(45) },
      { id: 'c2', message_id: 'm2', link_id: 'l2', created_at: old(45) },
      { id: 'c3', message_id: 'm3', link_id: null, created_at: old(5) },
    ],
  })
  assert.deepEqual(completedWithoutLink.map((r) => r.id), ['c1'])
})

test('a clean board reports nothing', () => {
  const { staleLinks, danglingLedger, completedWithoutLink } = classify({ now: NOW, minutes: 30, links: [], ledger: [], completed: [] })
  assert.equal(staleLinks.length, 0)
  assert.equal(danglingLedger.length, 0)
  assert.equal(completedWithoutLink.length, 0)
})

test('a reconciled unknown link is still listed but is no longer open debt', () => {
  const { unknownLinks, unresolvedUnknownLinks } = classify({
    now: NOW,
    unknown: [
      { id: 'u1', delivery_status: 'unknown', channel_metadata: { unknownReason: 'local_commit_failed' }, created_at: old(5) },
      {
        id: 'u2',
        delivery_status: 'unknown',
        channel_metadata: {
          unknownReason: 'attempt_lease_expired',
          reconciliation: [{ outcome: 'confirmed-not-sent', note: 'provider shows no message', at: old(1) }],
        },
        created_at: old(500),
      },
    ],
  })
  assert.deepEqual(unknownLinks.map((r) => r.id), ['u1', 'u2'])
  assert.deepEqual(unresolvedUnknownLinks.map((r) => r.id), ['u1'])
})

test('reports unknown-outcome links for reconciliation without counting them as stale', () => {
  const { staleLinks, unknownLinks } = classify({
    now: NOW,
    minutes: 30,
    links: [
      { id: 'u1', delivery_status: 'unknown', created_at: old(5) },
      { id: 'u2', delivery_status: 'unknown', created_at: old(500) },
      { id: 'q1', delivery_status: 'queued', created_at: old(45) },
      { id: 's1', delivery_status: 'sent', created_at: old(90) },
    ],
    unknown: [
      { id: 'u1', delivery_status: 'unknown', channel_metadata: { unknownReason: 'local_commit_failed' }, created_at: old(5) },
      { id: 'u2', delivery_status: 'unknown', channel_metadata: { unknownReason: 'attempt_lease_expired' }, created_at: old(500) },
      { id: 'x1', delivery_status: 'sent' },
    ],
  })
  // Unknown is terminal: it must not show up as a stuck (queued/pending) link.
  assert.deepEqual(staleLinks.map((r) => r.id), ['q1'])
  // Both ages are listed: the window does not hide reconciliation debt.
  assert.deepEqual(unknownLinks.map((r) => r.id), ['u1', 'u2'])
})
