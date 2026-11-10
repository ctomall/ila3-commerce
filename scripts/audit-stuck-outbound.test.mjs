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

test('a clean board reports nothing', () => {
  const { staleLinks, danglingLedger } = classify({ now: NOW, minutes: 30, links: [], ledger: [] })
  assert.equal(staleLinks.length, 0)
  assert.equal(danglingLedger.length, 0)
})
