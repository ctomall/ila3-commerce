#!/usr/bin/env node
/**
 * Real-Postgres runner for `scripts/reconcile-unknown.mjs`.
 *
 * The unit tests drive `resolveUnknown` through an injectable fake client, which
 * proves the control flow but not the SQL: the jsonb append, the `for update`
 * lock, and the status guard in the UPDATE itself. This runner executes the real
 * statements against a throwaway database, so a type error or a wrong jsonb
 * operator fails here instead of on the first production reconciliation.
 *
 * Usage: P6_REALDB_URL=postgres://... node reconcile-unknown-runner.mjs
 * The table is created if absent; rows are removed afterwards.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { resolveUnknown } from '../../../../../scripts/reconcile-unknown.mjs'

const url = process.env.P6_REALDB_URL
assert.ok(url, 'P6_REALDB_URL is required')
process.env.DATABASE_URL = url

const TENANT = randomUUID()
const ORG = randomUUID()

const client = new pg.Client({ connectionString: url })
await client.connect()

async function seedLink({ status = 'unknown', metadata = { unknownReason: 'local_commit_failed' } } = {}) {
  const id = randomUUID()
  await client.query(
    `insert into message_channel_links
       (id, message_id, external_conversation_id, provider_key, channel_type, direction,
        delivery_status, channel_metadata, tenant_id, organization_id, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,now())`,
    [id, randomUUID(), randomUUID(), 'whatsapp-business', 'whatsapp', 'outbound', status, JSON.stringify(metadata), TENANT, ORG],
  )
  return id
}

async function readLink(id) {
  const row = await client.query('select delivery_status, channel_metadata from message_channel_links where id = $1', [id])
  return row.rows[0]
}

try {
  await client.query(`create table if not exists message_channel_links (
    id uuid primary key,
    message_id uuid not null,
    external_conversation_id uuid not null,
    external_message_id uuid null,
    provider_key text not null,
    channel_type text not null,
    direction text not null,
    delivery_status text not null default 'pending',
    channel_payload jsonb null,
    channel_content_type text null,
    interactive_state jsonb null,
    channel_metadata jsonb null,
    tenant_id uuid not null,
    organization_id uuid null,
    created_at timestamptz not null
  )`)

  // A. dry-run: reads, plans, writes nothing.
  const dryId = await seedLink()
  const dry = await resolveUnknown({
    linkId: dryId,
    outcome: 'confirmed-not-sent',
    note: 'provider dashboard shows no message',
    operator: 'ops',
    apply: false,
  })
  assert.equal(dry.ok, true)
  assert.equal(dry.applied, false)
  const afterDry = await readLink(dryId)
  assert.equal(afterDry.delivery_status, 'unknown', 'dry-run must not change the status')
  assert.equal(afterDry.channel_metadata.reconciliation, undefined, 'dry-run must not write metadata')
  console.log('PASS dry-run leaves the row untouched')

  // B. apply: appends the entry, keeps other keys, keeps status unknown.
  const appliedId = await seedLink()
  const applied = await resolveUnknown({
    linkId: appliedId,
    outcome: 'confirmed-sent',
    note: 'provider dashboard shows delivered',
    operator: 'ops',
    apply: true,
  })
  assert.equal(applied.ok, true)
  assert.equal(applied.applied, true)
  const afterApply = await readLink(appliedId)
  assert.equal(afterApply.delivery_status, 'unknown', 'reconciliation is not a resend and must not fake a status')
  assert.equal(afterApply.channel_metadata.unknownReason, 'local_commit_failed', 'unrelated metadata must survive')
  assert.equal(afterApply.channel_metadata.reconciliation.length, 1)
  assert.equal(afterApply.channel_metadata.reconciliation[0].outcome, 'confirmed-sent')
  assert.equal(afterApply.channel_metadata.reconciliation[0].operator, 'ops')
  console.log('PASS apply appends the entry and preserves status + unrelated metadata')

  // C. a second resolution appends to the history instead of overwriting it.
  const second = await resolveUnknown({
    linkId: appliedId,
    outcome: 'confirmed-not-sent',
    note: 're-checked after the provider incident report',
    operator: 'ops',
    apply: true,
  })
  assert.equal(second.ok, true)
  const afterSecond = await readLink(appliedId)
  assert.deepEqual(
    afterSecond.channel_metadata.reconciliation.map((entry) => entry.outcome),
    ['confirmed-sent', 'confirmed-not-sent'],
  )
  assert.equal(afterSecond.delivery_status, 'unknown')
  console.log('PASS a second resolution appends to the history')

  // D. a link that is not unknown is refused and left alone.
  const sentId = await seedLink({ status: 'sent', metadata: {} })
  const refused = await resolveUnknown({
    linkId: sentId,
    outcome: 'confirmed-sent',
    note: 'provider dashboard shows delivered',
    apply: true,
  })
  assert.equal(refused.ok, false)
  assert.equal(refused.code, 3)
  assert.equal(refused.reason, 'not_unknown')
  const afterRefused = await readLink(sentId)
  assert.equal(afterRefused.channel_metadata.reconciliation, undefined)
  console.log('PASS a non-unknown link is refused without a write')

  // E. an unknown link id is refused.
  const missing = await resolveUnknown({
    linkId: randomUUID(),
    outcome: 'confirmed-sent',
    note: 'provider dashboard shows delivered',
    apply: true,
  })
  assert.equal(missing.ok, false)
  assert.equal(missing.reason, 'link_not_found')
  console.log('PASS a missing link is refused')

  await client.query('delete from message_channel_links where tenant_id = $1', [TENANT])
  console.log('reconcile-unknown realdb: all scenarios passed')
} finally {
  await client.end()
}
