#!/usr/bin/env node
/**
 * Normalize i18n dictionaries: strip stray carriage returns.
 *
 * Many zh values were produced by a Windows-side pipeline and end with `\r`,
 * e.g. "最大步数\r". Those CRs leak into rendered text (invisible but real),
 * break exact-match comparisons in tests, and make diffing noisy.
 *
 * Idempotent: running twice is a no-op. Only the CR character is removed —
 * no trimming, no whitespace rewriting, so intentional spacing is preserved.
 *
 * Usage: node scripts/normalize-i18n.mjs [--dry]
 */
import fs from 'node:fs'
import path from 'node:path'

const dry = process.argv.includes('--dry')
const dir = path.resolve(process.cwd(), 'src/i18n')
const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json'))

let totalValues = 0
let totalChanged = 0

for (const name of files) {
  const file = path.join(dir, name)
  const raw = fs.readFileSync(file, 'utf8')
  const data = JSON.parse(raw)
  let changed = 0
  const keys = Object.keys(data)
  totalValues += keys.length

  for (const key of keys) {
    const value = data[key]
    if (typeof value !== 'string' || !value.includes('\r')) continue
    data[key] = value.replace(/\r/g, '')
    changed++
  }

  totalChanged += changed
  if (changed === 0) {
    console.log(`[i18n-normalize] ${name}: clean (${keys.length} keys)`)
    continue
  }
  if (!dry) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
  }
  console.log(`[i18n-normalize] ${name}: ${changed} value(s) ${dry ? 'would change' : 'cleaned'} (${keys.length} keys)`)
}

console.log(`[i18n-normalize] done: ${totalChanged} changed of ${totalValues} values${dry ? ' (dry run)' : ''}`)
