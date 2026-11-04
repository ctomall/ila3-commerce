#!/usr/bin/env node
/**
 * Give `select` custom-field options a display label.
 *
 * `custom_field_defs.config_json.options` holds bare codes ("healthy",
 * "monitor", "at_risk"). Filters and the inline select editor already accept
 * `{ value, label }` objects (see `normalizeCustomFieldFilterOptions`), but a
 * bare code makes every surface render the raw enum.
 *
 * This migration rewrites the options to `{ value, label }` for the fields we
 * have Chinese labels for. Idempotent: rows already in object form are skipped,
 * and values without a known label are left untouched (never invented).
 *
 * Usage: node scripts/migrate-custom-field-option-labels.mjs [--dry]
 */
import 'dotenv/config'
import pg from 'pg'
import { statusLabels } from '../src/lib/status-label.ts'

const dry = process.argv.includes('--dry')

/** key -> { code: label } — extend as more fields are localized. */
const LABELS = {
  relationship_health: statusLabels('health'),
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[cf-labels] DATABASE_URL is not set')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url })

function toObjects(options, labelMap) {
  if (!Array.isArray(options)) return { changed: false, options }
  let changed = false
  const next = options.map((option) => {
    if (option && typeof option === 'object' && 'value' in option) return option
    const value = String(option)
    const label = labelMap?.[value]
    if (!label) return option
    changed = true
    return { value, label }
  })
  return { changed, options: next }
}

await client.connect()
try {
  const { rows } = await client.query(
    `select id, key, config_json from custom_field_defs
      where kind in ('select','dictionary') and is_active and deleted_at is null`,
  )
  let updated = 0
  let skipped = 0
  for (const row of rows) {
    const labelMap = LABELS[row.key]
    if (!labelMap) { skipped++; continue }
    const config = row.config_json ?? {}
    const { changed, options } = toObjects(config.options, labelMap)
    if (!changed) { skipped++; continue }
    console.log(`[cf-labels] ${row.key}: ${JSON.stringify(config.options)} -> ${JSON.stringify(options)}`)
    if (!dry) {
      await client.query(
        `update custom_field_defs set config_json = $1::jsonb, updated_at = now() where id = $2`,
        [JSON.stringify({ ...config, options }), row.id],
      )
    }
    updated++
  }
  console.log(`[cf-labels] done: updated=${updated} skipped=${skipped} rows=${rows.length}${dry ? ' (dry run)' : ''}`)
} finally {
  await client.end()
}
