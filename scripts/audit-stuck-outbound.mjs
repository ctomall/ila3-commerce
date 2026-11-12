#!/usr/bin/env node
/**
 * Read-only reconciliation audit for outbound messages that may be stuck.
 *
 * Context (2026-11-10, ADR-08): the hub worker refuses to deliver when a
 * channel is inactive/removed, and that throw path does NOT mark the channel
 * link as failed, so a send can sit in `queued` forever after retries are
 * exhausted. Accepted sends are also intentionally not revoked when the actor
 * loses permission. This script only reports; it never writes.
 *
 * Usage:
 *   node scripts/audit-stuck-outbound.mjs [--json] [--minutes 30] [--allow-stuck]
 *
 * Unknown-outcome links (D2 patch: the provider accepted, the local commit did
 * not land) are terminal and expected under failures, so they are reported as a
 * reconciliation list but do NOT fail the audit by default; `--strict-unknown`
 * counts them as findings for a gate that wants zero reconciliation debt.
 *
 * Exit codes: 0 = clean (or allowed), 1 = stale rows found, 2 = audit failed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { isMainEntry } from './lib/is-main-entry.mjs'
import { isReconciled } from './reconcile-unknown.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ACTIVE_LINK_STATES = ['queued', 'pending']

export function classify({ links = [], unknown = [], ledger = [], completed = [], minutes = 30, now = Date.now() }) {
  const cutoff = now - minutes * 60_000
  const staleLinks = links.filter((row) => {
    if (!ACTIVE_LINK_STATES.includes(row.delivery_status)) return false
    const at = row.created_at ? new Date(row.created_at).getTime() : NaN
    return Number.isFinite(at) && at < cutoff
  })
  const danglingLedger = ledger.filter((row) => {
    if (row.message_id) return false
    const at = row.created_at ? new Date(row.created_at).getTime() : NaN
    return Number.isFinite(at) && at < cutoff
  })
  // A ledger row that points at a message but has no outbound channel link means
  // the send was accepted and composed, yet nothing was ever queued for delivery.
  const completedWithoutLink = completed.filter((row) => {
    if (!row.message_id || row.link_id) return false
    const at = row.created_at ? new Date(row.created_at).getTime() : NaN
    return Number.isFinite(at) && at < cutoff
  })
  // Unknown is already a terminal state; age does not make it more urgent, so
  // every such link is listed for reconciliation regardless of the window.
  const unknownLinks = unknown.filter((row) => row.delivery_status === 'unknown')
  // An operator can close the debt with scripts/reconcile-unknown.mjs, which only
  // appends to `channel_metadata.reconciliation` and never changes the status. A
  // reconciled link stays listed for the record but is no longer open debt.
  const unresolvedUnknownLinks = unknownLinks.filter((row) => !isReconciled(row))
  return {
    staleLinks,
    danglingLedger,
    completedWithoutLink,
    unknownLinks,
    unresolvedUnknownLinks,
    minutes,
  }
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

async function readFacts(minutes) {
  const url = readDatabaseUrl()
  if (!url) throw new Error('DATABASE_URL is not configured')
  const client = new pg.Client({ connectionString: url, statement_timeout: 30000 })
  await client.connect()
  try {
    const links = await client.query(
      `select id, message_id, external_conversation_id, provider_key, delivery_status, created_at
         from message_channel_links
        where direction = 'outbound'
          and delivery_status = any($1::text[])
          and created_at < now() - ($2::int * interval '1 minute')
        order by created_at
        limit 200`,
      [ACTIVE_LINK_STATES, minutes],
    )
    const unknownRows = await client.query(
      `select id, message_id, external_conversation_id, provider_key, delivery_status,
              channel_metadata, created_at
         from message_channel_links
        where direction = 'outbound'
          and delivery_status = 'unknown'
        order by created_at desc
        limit 50`,
    )
    let ledger = []
    let completed = []
    let ledgerAvailable = true
    try {
      const rows = await client.query(
        `select id, tenant_id, user_id, client_request_id, message_id, created_at
           from communications_send_requests
          where message_id is null
            and created_at < now() - ($1::int * interval '1 minute')
          order by created_at
          limit 200`,
        [minutes],
      )
      ledger = rows.rows
      const composed = await client.query(
        `select sr.id, sr.client_request_id, sr.message_id, sr.created_at, l.id as link_id
           from communications_send_requests sr
           left join message_channel_links l
             on l.message_id = sr.message_id and l.direction = 'outbound'
          where sr.message_id is not null
            and l.id is null
            and sr.created_at < now() - ($1::int * interval '1 minute')
          order by sr.created_at
          limit 200`,
        [minutes],
      )
      completed = composed.rows
    } catch (error) {
      // 42P01 = the ledger table has not been migrated yet; that is reported,
      // not silently treated as "no dangling rows".
      if (error.code === '42P01') ledgerAvailable = false
      else throw error
    }
    return { links: links.rows, unknown: unknownRows.rows, ledger, completed, ledgerAvailable }
  } finally {
    await client.end()
  }
}

export async function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json')
  const allowStuck = argv.includes('--allow-stuck')
  const strictUnknown = argv.includes('--strict-unknown')
  const minutesArg = argv.indexOf('--minutes')
  const minutes = minutesArg >= 0 ? Number(argv[minutesArg + 1]) : 30
  if (!Number.isFinite(minutes) || minutes <= 0) {
    console.error('audit-stuck-outbound: --minutes must be a positive number')
    return 2
  }
  let facts
  try {
    facts = await readFacts(minutes)
  } catch (error) {
    console.error(`audit-stuck-outbound: cannot read database: ${error.message}`)
    return 2
  }
  const result = classify({ links: facts.links, unknown: facts.unknown, ledger: facts.ledger, completed: facts.completed, minutes })
  const summary = {
    minutes,
    ledgerAvailable: facts.ledgerAvailable,
    staleLinks: result.staleLinks.length,
    danglingLedger: result.danglingLedger.length,
    completedWithoutLink: result.completedWithoutLink.length,
    unknownLinks: result.unknownLinks.length,
    unresolvedUnknownLinks: result.unresolvedUnknownLinks.length,
    rows: {
      links: result.staleLinks,
      ledger: result.danglingLedger,
      completed: result.completedWithoutLink,
      unknown: result.unknownLinks.map((row) => ({
        id: row.id,
        messageId: row.message_id,
        providerKey: row.provider_key,
        reason: row.channel_metadata?.unknownReason ?? row.channel_metadata?.lastError ?? null,
        createdAt: row.created_at,
      })),
    },
  }
  if (json) {
    console.log(JSON.stringify(summary, null, 2))
  } else {
    console.log(
      `audit-stuck-outbound: ${summary.staleLinks} stale outbound link(s), ` +
        `${summary.danglingLedger} dangling ledger row(s), ` +
        `${summary.completedWithoutLink} composed send(s) without a link older than ${minutes}m, ` +
        `${summary.unknownLinks} unknown-outcome send(s) to reconcile ` +
        `(${summary.unresolvedUnknownLinks} unresolved)` +
        (summary.ledgerAvailable ? '' : ' (ledger table not migrated)'),
    )
    for (const row of result.staleLinks) {
      console.log(`  link ${row.id} message=${row.message_id} status=${row.delivery_status} since=${row.created_at}`)
    }
    for (const row of result.danglingLedger) {
      console.log(`  ledger ${row.id} clientRequestId=${row.client_request_id} since=${row.created_at}`)
    }
    for (const row of result.completedWithoutLink) {
      console.log(`  composed ${row.id} clientRequestId=${row.client_request_id} message=${row.message_id}`)
    }
    for (const row of result.unknownLinks) {
      const reason = row.channel_metadata?.unknownReason ?? row.channel_metadata?.lastError ?? 'unknown'
      console.log(`  unknown ${row.id} message=${row.message_id} provider=${row.provider_key} reason=${reason} at=${row.created_at}`)
    }
  }
  const findings =
    summary.staleLinks > 0 ||
    summary.danglingLedger > 0 ||
    summary.completedWithoutLink > 0 ||
    (strictUnknown && summary.unresolvedUnknownLinks > 0)
  return findings ? (allowStuck ? 0 : 1) : 0
}

if (isMainEntry(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code
  })
}
