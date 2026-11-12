#!/usr/bin/env node
/**
 * Reconcile an outbound send whose provider outcome is UNKNOWN.
 *
 * Context (ADR-02 + the `outbound-attempt-unknown` managed patch): when the
 * provider may have accepted a message but the local commit did not land, the
 * link is marked `unknown` and is never re-sent automatically — a blind retry
 * could deliver the same message twice. That leaves a real debt: someone has to
 * establish whether the customer got it, and nothing in the UI records that
 * decision.
 *
 * This tool closes the debt explicitly and auditably:
 *   - it only ever touches links whose status is `unknown`;
 *   - it appends a `reconciliation` entry (outcome + note + operator + time) to
 *     the link's channel metadata and does NOT change the delivery status — so
 *     no send is triggered and no status is faked;
 *   - it is read-only unless `--apply` is passed, so listing and planning are
 *     safe on production.
 *
 * Usage:
 *   node scripts/reconcile-unknown.mjs [--json]                      # list debt
 *   node scripts/reconcile-unknown.mjs --resolve <linkId> \
 *        --outcome confirmed-sent|confirmed-not-sent \
 *        --note "how it was established" [--operator name] [--apply] [--json]
 *
 * Exit codes: 0 = ok / dry-run, 2 = bad arguments or DB error, 3 = the link is
 * missing or not in the `unknown` state.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { isMainEntry } from './lib/is-main-entry.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIN_NOTE_LENGTH = 8

export const OUTCOMES = ['confirmed-sent', 'confirmed-not-sent']

export function validateResolution({ outcome, note, operator } = {}) {
  const errors = []
  if (!OUTCOMES.includes(outcome)) {
    errors.push(`--outcome must be one of: ${OUTCOMES.join(', ')}`)
  }
  const text = typeof note === 'string' ? note.trim() : ''
  if (text.length < MIN_NOTE_LENGTH) {
    errors.push(`--note must be at least ${MIN_NOTE_LENGTH} characters; it is the audit trail`)
  }
  if (operator !== undefined && operator !== null && String(operator).trim() === '') {
    errors.push('--operator must not be blank when provided')
  }
  return { ok: errors.length === 0, errors, note: text }
}

export function buildReconciliationEntry({ outcome, note, operator, at } = {}) {
  return {
    outcome,
    note: typeof note === 'string' ? note.trim() : '',
    operator: typeof operator === 'string' && operator.trim() !== '' ? operator.trim() : null,
    at: at ?? new Date().toISOString(),
  }
}

/**
 * Append one entry to `channel_metadata.reconciliation`, preserving any earlier
 * entries and every other metadata key. Pure: returns a new object.
 */
export function appendReconciliation(metadata, entry) {
  const base = metadata && typeof metadata === 'object' ? metadata : {}
  const history = Array.isArray(base.reconciliation) ? base.reconciliation : []
  return { ...base, reconciliation: [...history, entry] }
}

/**
 * Split unknown links into those an operator already reconciled and the rest.
 * A reconciliation array with at least one entry is what closes the debt; the
 * delivery status stays `unknown` either way.
 */
export function partitionUnknown(rows = []) {
  const resolved = []
  const unresolved = []
  for (const row of rows) {
    const history = row?.channel_metadata?.reconciliation
    if (Array.isArray(history) && history.length > 0) resolved.push(row)
    else unresolved.push(row)
  }
  return { resolved, unresolved }
}

export function isReconciled(row) {
  const history = row?.channel_metadata?.reconciliation
  return Array.isArray(history) && history.length > 0
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

const UNKNOWN_COLUMNS = `id, message_id, provider_key, delivery_status, channel_metadata, created_at`

async function withClient(fn) {
  const url = readDatabaseUrl()
  if (!url) throw new Error('DATABASE_URL is not configured')
  const client = new pg.Client({ connectionString: url, statement_timeout: 30000 })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

export async function listUnknown() {
  return withClient(async (client) => {
    const rows = await client.query(
      `select ${UNKNOWN_COLUMNS}
         from message_channel_links
        where direction = 'outbound'
          and delivery_status = 'unknown'
        order by created_at desc
        limit 200`,
    )
    return partitionUnknown(rows.rows)
  })
}

export async function resolveUnknown({ linkId, outcome, note, operator, apply = false, withDb }) {
  const run = withDb ?? withClient
  return run(async (client) => {
    await client.query('begin')
    try {
      const found = await client.query(
        `select ${UNKNOWN_COLUMNS}
           from message_channel_links
          where id = $1
          for update`,
        [linkId],
      )
      const row = found.rows[0]
      if (!row) {
        await client.query('rollback')
        return { ok: false, code: 3, reason: 'link_not_found' }
      }
      if (row.delivery_status !== 'unknown') {
        await client.query('rollback')
        return { ok: false, code: 3, reason: 'not_unknown', status: row.delivery_status }
      }
      const entry = buildReconciliationEntry({ outcome, note, operator })
      const next = appendReconciliation(row.channel_metadata, entry)
      if (!apply) {
        await client.query('rollback')
        return { ok: true, applied: false, linkId, entry, nextMetadata: next }
      }
      // Guard on the status in the write itself: a concurrent worker/reconciler
      // must not be able to reconcile a link that stopped being unknown.
      const updated = await client.query(
        `update message_channel_links
            set channel_metadata = $2::jsonb
          where id = $1
            and delivery_status = 'unknown'
          returning id`,
        [linkId, JSON.stringify(next)],
      )
      if (updated.rows.length === 0) {
        await client.query('rollback')
        return { ok: false, code: 3, reason: 'raced' }
      }
      await client.query('commit')
      return { ok: true, applied: true, linkId, entry }
    } catch (error) {
      try {
        await client.query('rollback')
      } catch {}
      throw error
    }
  })
}

export async function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json')
  const apply = argv.includes('--apply')
  const resolveIndex = argv.indexOf('--resolve')
  const outcomeIndex = argv.indexOf('--outcome')
  const noteIndex = argv.indexOf('--note')
  const operatorIndex = argv.indexOf('--operator')
  const valueAfter = (index) => (index >= 0 ? argv[index + 1] : undefined)

  if (resolveIndex >= 0) {
    const linkId = valueAfter(resolveIndex)
    if (!linkId) {
      console.error('reconcile-unknown: --resolve requires a link id')
      return 2
    }
    const validation = validateResolution({
      outcome: valueAfter(outcomeIndex),
      note: valueAfter(noteIndex),
      operator: valueAfter(operatorIndex),
    })
    if (!validation.ok) {
      for (const error of validation.errors) console.error(`reconcile-unknown: ${error}`)
      return 2
    }
    let result
    try {
      result = await resolveUnknown({
        linkId,
        outcome: valueAfter(outcomeIndex),
        note: validation.note,
        operator: valueAfter(operatorIndex),
        apply,
      })
    } catch (error) {
      console.error(`reconcile-unknown: cannot write: ${error.message}`)
      return 2
    }
    if (!result.ok) {
      console.error(`reconcile-unknown: refusing ${linkId}: ${result.reason}${result.status ? ` (status=${result.status})` : ''}`)
      return result.code
    }
    if (json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(
        result.applied
          ? `reconciled ${result.linkId} as ${result.entry.outcome} (status stays unknown; no send was triggered)`
          : `dry-run: would record ${result.entry.outcome} on ${result.linkId}; pass --apply to write`,
      )
    }
    return 0
  }

  let facts
  try {
    facts = await listUnknown()
  } catch (error) {
    console.error(`reconcile-unknown: cannot read database: ${error.message}`)
    return 2
  }
  if (json) {
    console.log(
      JSON.stringify(
        {
          unresolved: facts.unresolved.map((row) => ({
            id: row.id,
            messageId: row.message_id,
            providerKey: row.provider_key,
            reason: row.channel_metadata?.unknownReason ?? row.channel_metadata?.lastError ?? null,
            createdAt: row.created_at,
          })),
          resolvedCount: facts.resolved.length,
        },
        null,
        2,
      ),
    )
    return 0
  }
  console.log(
    `reconcile-unknown: ${facts.unresolved.length} unresolved unknown-outcome send(s), ` +
      `${facts.resolved.length} already reconciled`,
  )
  for (const row of facts.unresolved) {
    const reason = row.channel_metadata?.unknownReason ?? row.channel_metadata?.lastError ?? 'unknown'
    console.log(`  unknown ${row.id} message=${row.message_id} provider=${row.provider_key} reason=${reason} at=${row.created_at}`)
  }
  if (facts.unresolved.length > 0) {
    console.log('  resolve with: node scripts/reconcile-unknown.mjs --resolve <id> --outcome confirmed-sent|confirmed-not-sent --note "..." --apply')
  }
  return 0
}

if (isMainEntry(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code
  })
}
