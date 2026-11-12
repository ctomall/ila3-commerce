#!/usr/bin/env node
/**
 * Real-Postgres proof for `recordUnmatchedReceipt`.
 *
 * The unit tests stub the EntityManager, which proves the control flow but not
 * that the row can actually be written: a wrong column name or a nullable
 * mismatch would fail at runtime, and the helper swallows that failure by design
 * (a webhook must not 5xx because its bookkeeping failed). That makes a silent
 * "recorded nothing" indistinguishable from success — exactly what this runner
 * rules out, using the shipped entity mapping and the real SQL.
 *
 * Usage: P6_REALDB_URL=postgres://... node realdb/dead-letter-runner.mjs
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { MikroORM } from '@mikro-orm/postgresql'
import { ChannelIngestDeadLetter } from '@open-mercato/core/modules/communication_channels/data/entities'
import { recordUnmatchedReceipt } from '../../lib/unmatched-receipt.ts'

const clientUrl = process.env.P6_REALDB_URL
assert.ok(clientUrl, 'P6_REALDB_URL is required')

const TENANT = randomUUID()
const ORG = randomUUID()
const CHANNEL = randomUUID()

const orm = await MikroORM.init({ entities: [ChannelIngestDeadLetter], clientUrl, debug: false })
const em = orm.em.fork()

try {
  // The hub migration owns this table; create it byte-for-byte the way the
  // migration does so the entity mapping is what is being tested.
  await em.getConnection().execute(`create table if not exists channel_ingest_dead_letters (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null,
    organization_id uuid null,
    channel_id uuid not null,
    provider_key text not null,
    external_uid text null,
    external_message_id text null,
    error_class text not null,
    error_message text not null,
    raw_body text null,
    created_at timestamptz not null
  )`)

  const base = {
    em,
    tenantId: TENANT,
    organizationId: ORG,
    channelId: CHANNEL,
    providerKey: 'whatsapp-business',
  }

  const first = await recordUnmatchedReceipt({
    ...base,
    errorClass: 'receipt_unmatched',
    errorMessage: 'no external message for provider id wamid.T1',
    externalMessageId: 'wamid.T1',
    raw: { status: 'delivered', nested: { id: 'wamid.T1' } },
  })
  assert.equal(first, 'recorded', 'the receipt must be written, not silently skipped')

  const rows = await em.getConnection().execute(
    `select tenant_id, organization_id, channel_id, provider_key, external_message_id, error_class, error_message, raw_body, created_at
       from channel_ingest_dead_letters where tenant_id = ?`,
    [TENANT],
  )
  assert.equal(rows.length, 1)
  const row = rows[0]
  assert.equal(row.tenant_id, TENANT)
  assert.equal(row.organization_id, ORG)
  assert.equal(row.channel_id, CHANNEL)
  assert.equal(row.provider_key, 'whatsapp-business')
  assert.equal(row.external_message_id, 'wamid.T1')
  assert.equal(row.error_class, 'receipt_unmatched')
  assert.equal(row.raw_body.includes('wamid.T1'), true)
  // The driver may hand back a string; what matters is that onCreate filled it.
  assert.ok(Number.isFinite(Date.parse(String(row.created_at))), 'created_at must be filled by onCreate')
  console.log('PASS unmatched receipt is written with the real entity mapping')

  const second = await recordUnmatchedReceipt({
    ...base,
    errorClass: 'receipt_unmatched',
    errorMessage: 'no external message (retry)',
    externalMessageId: 'wamid.T1',
  })
  assert.equal(second, 'duplicate')
  let count = await em.getConnection().execute(
    'select count(*)::int as n from channel_ingest_dead_letters where tenant_id = ?',
    [TENANT],
  )
  assert.equal(count[0].n, 1, 'the same provider id must not be recorded twice')
  console.log('PASS the same receipt is deduplicated')

  const third = await recordUnmatchedReceipt({
    ...base,
    errorClass: 'receipt_unmatched_link',
    errorMessage: 'message exists but has no link',
    externalMessageId: 'wamid.T1',
  })
  assert.equal(third, 'recorded')
  count = await em.getConnection().execute(
    'select count(*)::int as n from channel_ingest_dead_letters where tenant_id = ?',
    [TENANT],
  )
  assert.equal(count[0].n, 2, 'a different error class is a different fact')
  console.log('PASS a different error class is recorded separately')

  const readRow = await recordUnmatchedReceipt({
    ...base,
    providerKey: 'messenger',
    errorClass: 'read_unmatched_conversation',
    errorMessage: 'no conversation for PSID PSID-1',
    externalUid: 'PSID-1',
    raw: { psid: 'PSID-1', watermark: 1760000000000 },
  })
  assert.equal(readRow, 'recorded')
  const uidRows = await em.getConnection().execute(
    "select external_uid, external_message_id from channel_ingest_dead_letters where tenant_id = ? and error_class = 'read_unmatched_conversation'",
    [TENANT],
  )
  assert.equal(uidRows.length, 1)
  assert.equal(uidRows[0].external_uid, 'PSID-1')
  assert.equal(uidRows[0].external_message_id, null)
  console.log('PASS a watermark is recorded by conversation id')

  await em.getConnection().execute('delete from channel_ingest_dead_letters where tenant_id = ?', [TENANT])
  console.log('dead-letter realdb: all scenarios passed')
} finally {
  await orm.close(true)
}
