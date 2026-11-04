#!/usr/bin/env node
/**
 * Translate seeded dictionary DATA (dictionary names + entry labels) into Chinese.
 *
 * Value-based and idempotent: every batch pair "English -> Chinese" is applied to
 * all rows whose current label/name equals that English string. Rows are never
 * overwritten twice (running again is a no-op because the English no longer matches).
 *
 * Inputs (inside the project):
 *   scripts/i18n-zh/batches/14.txt      id<TAB>English
 *   scripts/i18n-zh/batches/14.zh.txt   id|Chinese
 *
 * Output: scripts/i18n-zh/data/dict-labels-applied.json (what changed, for reverting).
 *
 * Usage: node scripts/i18n-zh/apply-dict-labels.mjs [--dry]
 */
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import pg from 'pg'

const here = path.dirname(url.fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const dry = process.argv.includes('--dry')

function readEnv(file) {
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const env = readEnv(path.join(root, '.env'))
const connectionString =
  process.env.DATABASE_URL || env.DATABASE_URL || 'postgres://mercato:mercato_2026@127.0.0.1:5432/open_mercato'

const sources = new Map()
for (const line of fs.readFileSync(path.join(here, 'batches/14.txt'), 'utf8').split('\n')) {
  if (!line.trim()) continue
  const i = line.indexOf('\t')
  if (i > 0) sources.set(line.slice(0, i), line.slice(i + 1))
}
const translations = new Map()
for (const line of fs.readFileSync(path.join(here, 'batches/14.zh.txt'), 'utf8').split('\n')) {
  if (!line.trim()) continue
  const i = line.indexOf('|')
  if (i > 0) translations.set(line.slice(0, i), line.slice(i + 1))
}

// English -> Chinese (guaranteed consistent: same English always maps to one Chinese)
const pairs = new Map()
for (const [id, english] of sources) {
  const chinese = translations.get(id)
  if (!chinese) continue
  if (pairs.has(english) && pairs.get(english) !== chinese) {
    console.warn(`conflict for "${english}": "${pairs.get(english)}" vs "${chinese}" — keeping the first`)
    continue
  }
  pairs.set(english, chinese)
}
console.log('distinct English labels to translate:', pairs.size)

const targets = [
  { table: 'dictionaries', column: 'name', where: 'deleted_at IS NULL' },
  { table: 'dictionary_entries', column: 'label', where: '1=1' },
  { table: 'customer_dictionary_entries', column: 'label', where: '1=1' },
]

const client = new pg.Client({ connectionString })
await client.connect()
const applied = []
let updated = 0

await client.query('BEGIN')
try {
  for (const t of targets) {
    for (const [english, chinese] of pairs) {
      if (english === chinese) continue
      if (dry) {
        const count = await client.query(
          `SELECT count(*)::int AS n FROM ${t.table} WHERE ${t.column} = $1 AND ${t.where}`,
          [english],
        )
        if (count.rows[0].n > 0) applied.push({ table: t.table, from: english, to: chinese, rows: count.rows[0].n })
        updated += count.rows[0].n
        continue
      }
      const res = await client.query(
        `UPDATE ${t.table} SET ${t.column} = $1 WHERE ${t.column} = $2 AND ${t.where}`,
        [chinese, english],
      )
      if (res.rowCount > 0) {
        updated += res.rowCount
        applied.push({ table: t.table, from: english, to: chinese, rows: res.rowCount })
      }
    }
  }
  if (dry) await client.query('ROLLBACK')
  else await client.query('COMMIT')
} catch (err) {
  await client.query('ROLLBACK')
  throw err
} finally {
  await client.end()
}

const byTable = applied.reduce((acc, a) => {
  acc[a.table] = (acc[a.table] || 0) + a.rows
  return acc
}, {})
console.log(`${dry ? '[dry] rows that would change' : 'rows updated'}: ${updated}`, byTable)

if (!dry) {
  fs.writeFileSync(
    path.join(here, 'data/dict-labels-applied.json'),
    `${JSON.stringify(applied, null, 1)}\n`,
    'utf8',
  )
  console.log('wrote scripts/i18n-zh/data/dict-labels-applied.json')
}
