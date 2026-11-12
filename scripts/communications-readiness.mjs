#!/usr/bin/env node
/**
 * Read-only readiness checklist for the communications module.
 *
 * Answers one question: "can a keyed send actually work right now, and what is
 * missing?" It never writes and never prints secret values (only presence).
 *
 * Usage: node scripts/communications-readiness.mjs [--json]
 * Exit codes: 0 = ready, 1 = blocked, 2 = audit failed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { classify as classifyOutbound } from './audit-stuck-outbound.mjs'
import { isMainEntry } from './lib/is-main-entry.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function evaluate(facts) {
  const blockers = []
  const warnings = []
  if (!facts.ledgerTable) blockers.push('migration pending: communications_send_requests is missing')
  if (facts.ledgerTable && !facts.payloadHashColumn) blockers.push('migration pending: payload_hash column is missing')
  if (facts.ledgerTable && facts.migrationRows < 2) blockers.push(`migration rows: expected >= 2, found ${facts.migrationRows}`)
  if (!facts.channels.total) warnings.push('no communication channels configured')
  else if (!facts.channels.connected) warnings.push('no channel in connected status')
  if (facts.stuck.staleLinks > 0) warnings.push(`${facts.stuck.staleLinks} stale outbound link(s) older than ${facts.stuck.minutes}m`)
  if (facts.stuck.danglingLedger > 0) warnings.push(`${facts.stuck.danglingLedger} dangling send claim(s)`)
  if (facts.stuck.completedWithoutLink > 0) warnings.push(`${facts.stuck.completedWithoutLink} composed send(s) without a delivery link`)
  if (facts.stuck.unknownLinks > 0) warnings.push(`${facts.stuck.unknownLinks} unknown-outcome send(s) need reconciliation (see audit-stuck-outbound)`)
  if (!facts.webhookVerifyToken) warnings.push('META_WEBHOOK_VERIFY_TOKEN is not configured (WhatsApp verify endpoint returns 503)')
  return { ready: blockers.length === 0, blockers, warnings }
}

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const line = fs
      .readFileSync(path.join(ROOT, '.env'), 'utf8')
      .split('\n')
      .find((l) => l.startsWith('DATABASE_URL='))
    if (line) return line.slice('DATABASE_URL='.length).trim()
  } catch {}
  return null
}

function hasVerifyToken() {
  if (process.env.META_WEBHOOK_VERIFY_TOKEN) return true
  try {
    return /^META_WEBHOOK_VERIFY_TOKEN=.+/m.test(fs.readFileSync(path.join(ROOT, '.env'), 'utf8'))
  } catch {
    return false
  }
}

async function readFacts(minutes = 30) {
  const url = readDatabaseUrl()
  if (!url) throw new Error('DATABASE_URL is not configured')
  const client = new pg.Client({ connectionString: url, statement_timeout: 30000 })
  await client.connect()
  try {
    const table = await client.query("select coalesce(to_regclass('public.communications_send_requests')::text,'') as t")
    const ledgerTable = Boolean(table.rows[0]?.t)
    let payloadHashColumn = false
    let migrationRows = 0
    if (ledgerTable) {
      const col = await client.query(
        "select 1 from information_schema.columns where table_name='communications_send_requests' and column_name='payload_hash'",
      )
      payloadHashColumn = col.rowCount > 0
      const rows = await client.query('select count(*)::int as n from mikro_orm_migrations_communications')
      migrationRows = rows.rows[0].n
    }
    const channels = await client.query(
      `select count(*)::int as total,
              count(*) filter (where is_active)::int as active,
              count(*) filter (where status='connected')::int as connected
         from communication_channels where deleted_at is null`,
    )
    let links = []
    let ledger = []
    let completed = []
    let unknown = []
    if (ledgerTable) {
      const l = await client.query(
        `select id, message_id, external_conversation_id, provider_key, delivery_status, created_at
           from message_channel_links
          where direction='outbound' and delivery_status = any($1::text[])
            and created_at < now() - ($2::int * interval '1 minute')
          limit 200`,
        [['queued', 'pending'], minutes],
      )
      links = l.rows
      // Terminal unknown outcomes are not "stuck" but they are reconciliation
      // debt the 202 warning points operators at; surface them here too.
      const u = await client.query(
        `select id, message_id, external_conversation_id, provider_key, delivery_status, channel_metadata, created_at
           from message_channel_links
          where direction='outbound' and delivery_status='unknown'
          order by created_at desc
          limit 50`,
      )
      unknown = u.rows
      const d = await client.query(
        `select id, client_request_id, message_id, created_at from communications_send_requests
          where message_id is null and created_at < now() - ($1::int * interval '1 minute') limit 200`,
        [minutes],
      )
      ledger = d.rows
      const c = await client.query(
        `select sr.id, sr.client_request_id, sr.message_id, sr.created_at, l.id as link_id
           from communications_send_requests sr
           left join message_channel_links l on l.message_id = sr.message_id and l.direction='outbound'
          where sr.message_id is not null and l.id is null
            and sr.created_at < now() - ($1::int * interval '1 minute') limit 200`,
        [minutes],
      )
      completed = c.rows
    }
    const stuck = classifyOutbound({ links, unknown, ledger, completed, minutes })
    return {
      ledgerTable,
      payloadHashColumn,
      migrationRows,
      channels: channels.rows[0],
      webhookVerifyToken: hasVerifyToken(),
      stuck: {
        minutes,
        staleLinks: stuck.staleLinks.length,
        danglingLedger: stuck.danglingLedger.length,
        completedWithoutLink: stuck.completedWithoutLink.length,
        unknownLinks: stuck.unknownLinks.length,
      },
    }
  } finally {
    await client.end()
  }
}

export async function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json')
  let facts
  try {
    facts = await readFacts()
  } catch (error) {
    console.error(`communications-readiness: cannot read database: ${error.message}`)
    return 2
  }
  const verdict = evaluate(facts)
  const output = { ...verdict, facts }
  if (json) {
    console.log(JSON.stringify(output, null, 2))
  } else {
    console.log(`communications-readiness: ${verdict.ready ? 'READY' : 'BLOCKED'}`)
    for (const item of verdict.blockers) console.log(`  blocker: ${item}`)
    for (const item of verdict.warnings) console.log(`  warning: ${item}`)
    console.log(
      `  facts: ledger=${facts.ledgerTable} payload_hash=${facts.payloadHashColumn} migrations=${facts.migrationRows} ` +
        `channels=${facts.channels.total}/${facts.channels.connected} connected verifyToken=${facts.webhookVerifyToken}`,
    )
  }
  return verdict.ready ? 0 : 1
}

if (isMainEntry(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code
  })
}
