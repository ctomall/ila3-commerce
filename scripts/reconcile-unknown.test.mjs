import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  OUTCOMES,
  resolveUnknown,
  appendReconciliation,
  buildReconciliationEntry,
  isReconciled,
  main,
  partitionUnknown,
  validateResolution,
} from './reconcile-unknown.mjs'

test('accepts a complete resolution and rejects the rest', () => {
  assert.equal(validateResolution({ outcome: 'confirmed-sent', note: 'provider dashboard shows delivered' }).ok, true)
  assert.equal(validateResolution({ outcome: 'confirmed-not-sent', note: 'provider dashboard shows no message' }).ok, true)

  const badOutcome = validateResolution({ outcome: 'maybe', note: 'long enough note' })
  assert.equal(badOutcome.ok, false)
  assert.match(badOutcome.errors.join(' '), /--outcome/)

  const shortNote = validateResolution({ outcome: 'confirmed-sent', note: '  short  ' })
  assert.equal(shortNote.ok, false)
  assert.match(shortNote.errors.join(' '), /--note/)

  const blankOperator = validateResolution({ outcome: 'confirmed-sent', note: 'long enough note', operator: '   ' })
  assert.equal(blankOperator.ok, false)
})

test('an entry carries the outcome, a trimmed note, the operator and a timestamp', () => {
  const entry = buildReconciliationEntry({
    outcome: 'confirmed-sent',
    note: '  checked the provider dashboard  ',
    operator: '  ops  ',
    at: '2026-11-12T00:00:00.000Z',
  })
  assert.deepEqual(entry, {
    outcome: 'confirmed-sent',
    note: 'checked the provider dashboard',
    operator: 'ops',
    at: '2026-11-12T00:00:00.000Z',
  })
  assert.equal(buildReconciliationEntry({ outcome: 'confirmed-sent', note: 'x' }).operator, null)
})

test('appending preserves other metadata and earlier entries, without mutating the input', () => {
  const original = { unknownReason: 'local_commit_failed', reconciliation: [{ outcome: 'confirmed-not-sent', note: 'first pass' }] }
  const next = appendReconciliation(original, { outcome: 'confirmed-sent', note: 'second pass' })
  assert.equal(original.reconciliation.length, 1)
  assert.equal(next.unknownReason, 'local_commit_failed')
  assert.deepEqual(next.reconciliation.map((e) => e.outcome), ['confirmed-not-sent', 'confirmed-sent'])
  assert.deepEqual(appendReconciliation(undefined, { outcome: 'confirmed-sent' }).reconciliation.length, 1)
  assert.deepEqual(appendReconciliation({ reconciliation: 'not-an-array' }, { outcome: 'x' }).reconciliation, [{ outcome: 'x' }])
})

test('only an unknown row with no reconciliation entry is open debt', () => {
  const rows = [
    { id: 'a', delivery_status: 'unknown', channel_metadata: {} },
    { id: 'b', delivery_status: 'unknown', channel_metadata: { reconciliation: [] } },
    { id: 'c', delivery_status: 'unknown', channel_metadata: { reconciliation: [{ outcome: 'confirmed-sent' }] } },
    { id: 'd', delivery_status: 'unknown' },
  ]
  const { resolved, unresolved } = partitionUnknown(rows)
  assert.deepEqual(unresolved.map((r) => r.id), ['a', 'b', 'd'])
  assert.deepEqual(resolved.map((r) => r.id), ['c'])
  assert.equal(isReconciled(rows[2]), true)
  assert.equal(isReconciled(rows[0]), false)
})

test('argument errors are refused before any database access', async () => {
  assert.equal(await main(['--resolve', 'x', '--outcome', 'maybe', '--note', 'long enough note']), 2)
  assert.equal(await main(['--resolve', 'x', '--outcome', 'confirmed-sent', '--note', 'short']), 2)
  assert.equal(await main(['--resolve']), 2)
  assert.ok(OUTCOMES.includes('confirmed-sent'))
})

function fakeClient({ row, updateRows = [{ id: 'link-1' }] } = {}) {
  const calls = []
  const client = {
    calls,
    async query(sql, params) {
      calls.push({ sql: String(sql).trim().split('\n')[0], params })
      if (String(sql).includes('for update')) return { rows: row ? [row] : [] }
      if (String(sql).includes('update message_channel_links')) return { rows: updateRows }
      return { rows: [] }
    },
  }
  const withDb = async (fn) => fn(client)
  return { client, withDb }
}

const UNKNOWN_ROW = {
  id: 'link-1',
  message_id: 'msg-1',
  provider_key: 'whatsapp-business',
  delivery_status: 'unknown',
  channel_metadata: { unknownReason: 'local_commit_failed' },
  created_at: new Date().toISOString(),
}

test('a missing link and a non-unknown link are both refused without writing', async () => {
  const missing = fakeClient({ row: null })
  const r1 = await resolveUnknown({ linkId: 'link-1', outcome: 'confirmed-sent', note: 'checked provider', withDb: missing.withDb })
  assert.equal(r1.ok, false)
  assert.equal(r1.code, 3)
  assert.equal(r1.reason, 'link_not_found')

  const sent = fakeClient({ row: { ...UNKNOWN_ROW, delivery_status: 'sent' } })
  const r2 = await resolveUnknown({ linkId: 'link-1', outcome: 'confirmed-sent', note: 'checked provider', withDb: sent.withDb })
  assert.equal(r2.ok, false)
  assert.equal(r2.reason, 'not_unknown')
  assert.equal(sent.client.calls.some((c) => c.sql.startsWith('update')), false)
})

test('dry-run reads the row, plans the entry and never writes', async () => {
  const { client, withDb } = fakeClient({ row: UNKNOWN_ROW })
  const result = await resolveUnknown({
    linkId: 'link-1',
    outcome: 'confirmed-not-sent',
    note: 'provider dashboard shows no message',
    operator: 'ops',
    withDb,
  })
  assert.equal(result.ok, true)
  assert.equal(result.applied, false)
  assert.equal(result.entry.outcome, 'confirmed-not-sent')
  assert.deepEqual(result.nextMetadata.reconciliation.map((e) => e.outcome), ['confirmed-not-sent'])
  assert.equal(result.nextMetadata.unknownReason, 'local_commit_failed')
  assert.equal(client.calls.some((c) => c.sql.startsWith('update')), false)
  assert.equal(client.calls.some((c) => c.sql === 'commit'), false)
})

test('apply appends the entry and keeps the delivery status untouched', async () => {
  const { client, withDb } = fakeClient({ row: UNKNOWN_ROW })
  const result = await resolveUnknown({
    linkId: 'link-1',
    outcome: 'confirmed-sent',
    note: 'provider dashboard shows delivered',
    apply: true,
    withDb,
  })
  assert.equal(result.ok, true)
  assert.equal(result.applied, true)
  const update = client.calls.find((c) => c.sql.startsWith('update'))
  assert.ok(update, 'an update must be issued')
  const metadata = JSON.parse(update.params[1])
  assert.equal(metadata.reconciliation[0].outcome, 'confirmed-sent')
  assert.equal(metadata.unknownReason, 'local_commit_failed')
  // The SQL must never touch delivery_status: a reconciliation is not a resend.
  assert.equal(/delivery_status\s*=/.test(update.sql), false)
  assert.equal(client.calls.some((c) => c.sql === 'commit'), true)
})

test('a link that stopped being unknown between read and write is refused', async () => {
  const { client, withDb } = fakeClient({ row: UNKNOWN_ROW, updateRows: [] })
  const result = await resolveUnknown({
    linkId: 'link-1',
    outcome: 'confirmed-sent',
    note: 'provider dashboard shows delivered',
    apply: true,
    withDb,
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'raced')
  assert.equal(client.calls.some((c) => c.sql === 'rollback'), true)
})
