#!/usr/bin/env node
/**
 * Apply the Chinese custom-field labels to `custom_field_defs`.
 *
 * Why this is a data migration and not an i18n change: these strings live in
 * `config_json` of seeded field definitions, so forcing the UI locale does not
 * touch them. The "Relationship health" column header and raw `complex` /
 * `medium` option values come from here.
 *
 * What it changes:
 *   - `config_json.label` -> Chinese, when the map has the key
 *   - `config_json.options` -> [{ value, label }] objects (values untouched)
 *
 * Idempotent and reversible: the previous config_json is written to
 * `.mercato/custom-field-defs.backup.json` before the first write.
 *
 * Usage: node scripts/migrate-custom-field-zh.mjs [--dry]
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { CUSTOM_FIELD_LABELS, CUSTOM_FIELD_OPTIONS } from '../src/lib/custom-field-zh.ts'

const dry = process.argv.includes('--dry')
const url = process.env.DATABASE_URL
if (!url) {
  console.error('[cf-zh] DATABASE_URL is not set')
  process.exit(1)
}

const BACKUP = path.resolve(process.cwd(), '.mercato/custom-field-defs.backup.json')

function labelOptions(options, multi) {
  if (!Array.isArray(options)) return { changed: false, options }
  let changed = false
  const next = options.map((option) => {
    if (option && typeof option === 'object' && 'value' in option) {
      const label = CUSTOM_FIELD_OPTIONS[String(option.value)]
      if (!label || option.label === label) return option
      changed = true
      return { ...option, label }
    }
    const value = String(option)
    const label = CUSTOM_FIELD_OPTIONS[value]
    if (!label) return option
    changed = true
    return { value, label }
  })
  return { changed, options: next }
}

const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  const { rows } = await client.query(
    `select id, key, config_json from custom_field_defs where is_active and deleted_at is null`,
  )
  const snapshot = rows.map((r) => ({ id: r.id, key: r.key, config_json: r.config_json }))
  if (!fs.existsSync(BACKUP) && !dry) {
    fs.mkdirSync(path.dirname(BACKUP), { recursive: true })
    fs.writeFileSync(BACKUP, JSON.stringify(snapshot, null, 2))
    console.log(`[cf-zh] backup written: ${path.relative(process.cwd(), BACKUP)} (${snapshot.length} rows)`)
  }

  let updated = 0
  let skipped = 0
  for (const row of rows) {
    const config = row.config_json ?? {}
    const nextLabel = CUSTOM_FIELD_LABELS[row.key]
    const { changed, options } = labelOptions(config.options, config.multi)
    const labelChanged = Boolean(nextLabel && config.label !== nextLabel)
    if (!labelChanged && !changed) { skipped++; continue }

    const nextConfig = { ...config }
    if (labelChanged) nextConfig.label = nextLabel
    if (changed) nextConfig.options = options
    if (dry) {
      console.log(`[cf-zh] ${row.key}: ${JSON.stringify(config.label)} -> ${JSON.stringify(nextConfig.label)}`)
    } else {
      await client.query(
        `update custom_field_defs set config_json = $1::jsonb, updated_at = now() where id = $2`,
        [JSON.stringify(nextConfig), row.id],
      )
    }
    updated++
  }
  console.log(`[cf-zh] done: updated=${updated} skipped=${skipped} rows=${rows.length}${dry ? ' (dry run)' : ''}`)
} finally {
  await client.end()
}
