#!/usr/bin/env node
/**
 * Persistent one-assistant-per-employee binding backfill.
 *
 * The chat route provisions a binding lazily on first use, which means an
 * enabled employee who never chats has no binding yet. This operator tool
 * reports that gap and (with --apply) inserts the missing active bindings.
 *
 * Dry-run is the default: it prints counts and user ids only, never emails.
 *
 *   node scripts/dsh-bind-employees.mjs             # report
 *   node scripts/dsh-bind-employees.mjs --apply     # insert missing rows
 *   node scripts/dsh-bind-employees.mjs --tenant=<uuid>
 */
import { Pool } from 'pg'

const ASSISTANT_ID = 'crm-assistant'
const args = process.argv.slice(2)
const apply = args.includes('--apply')
const tenantArg = args.find((a) => a.startsWith('--tenant='))
const tenantId = tenantArg ? tenantArg.slice('--tenant='.length) : null

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[dsh-bind] DATABASE_URL is not set')
  process.exit(2)
}

const pool = new Pool({ connectionString: url, max: 2 })
try {
  const users = await pool.query(
    `select id, tenant_id, organization_id
       from users
      where deleted_at is null
        and ($1::uuid is null or tenant_id = $1::uuid)`,
    [tenantId],
  )
  const bindings = await pool.query(
    `select user_id from dsh_assistant_bindings
      where ($1::uuid is null or tenant_id = $1::uuid)`,
    [tenantId],
  )
  const bound = new Set(bindings.rows.map((row) => row.user_id))
  const missing = users.rows.filter((row) => !bound.has(row.id))

  console.log(`[dsh-bind] users=${users.rowCount} bindings=${bound.size} missing=${missing.length}`)
  for (const row of missing) {
    console.log(`[dsh-bind] missing user=${row.id} tenant=${row.tenant_id} org=${row.organization_id}`)
  }

  if (!apply) {
    console.log('[dsh-bind] dry-run only; pass --apply to insert')
  } else if (missing.length === 0) {
    console.log('[dsh-bind] nothing to insert')
  } else {
    let inserted = 0
    for (const row of missing) {
      const result = await pool.query(
        `insert into dsh_assistant_bindings
           (tenant_id, organization_id, user_id, assistant_id, status, revision, created_at, updated_at)
         values ($1, $2, $3, $4, 'active', 1, now(), now())
         on conflict (tenant_id, organization_id, user_id) do nothing`,
        [row.tenant_id, row.organization_id, row.id, ASSISTANT_ID],
      )
      inserted += result.rowCount
    }
    console.log(`[dsh-bind] inserted=${inserted}`)
  }
} finally {
  await pool.end()
}
