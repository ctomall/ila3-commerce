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
 * Exit codes: 0 = clean (or allowed), 1 = stale rows found, 2 = audit failed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ACTIVE_LINK_STATES = ['queued', 'pending']

export function classify({ links = [], ledger = [], minutes = 30, now = Date.now() }) {
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
  return { staleLinks, danglingLedger, minutes }
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
    let ledger = []
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
    } catch (error) {
      // 42P01 = the ledger table has not been migrated yet; that is reported,
      // not silently treated as "no dangling rows".
      if (error.code === '42P01') ledgerAvailable = false
      else throw error
    }
    return { links: links.rows, ledger, ledgerAvailable }
  } finally {
    await client.end()
  }
}

export async function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json')
  const allowStuck = argv.includes('--allow-stuck')
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
  const result = classify({ links: facts.links, ledger: facts.ledger, minutes })
  const summary = {
    minutes,
    ledgerAvailable: facts.ledgerAvailable,
    staleLinks: result.staleLinks.length,
    danglingLedger: result.danglingLedger.length,
    rows: { links: result.staleLinks, ledger: result.danglingLedger },
  }
  if (json) {
    console.log(JSON.stringify(summary, null, 2))
  } else {
    console.log(
      `audit-stuck-outbound: ${summary.staleLinks} stale outbound link(s), ` +
        `${summary.danglingLedger} dangling ledger row(s) older than ${minutes}m` +
        (summary.ledgerAvailable ? '' : ' (ledger table not migrated)'),
    )
    for (const row of result.staleLinks) {
      console.log(`  link ${row.id} message=${row.message_id} status=${row.delivery_status} since=${row.created_at}`)
    }
    for (const row of result.danglingLedger) {
      console.log(`  ledger ${row.id} clientRequestId=${row.client_request_id} since=${row.created_at}`)
    }
  }
  return summary.staleLinks > 0 || summary.danglingLedger > 0 ? (allowStuck ? 0 : 1) : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code
  })
}
