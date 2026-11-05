#!/usr/bin/env node
/**
 * Managed patch: denser dashboard widget rows.
 *
 * Each recent-record row used p-3 padding, a 1.5 step between lines and a 2-step
 * gap above the "查看记录" link, which put a row at ~90px and a 900px screen at
 * five records. The row keeps every field; only the spacing tightens.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:dashboard-density] */'
const BASE = 'node_modules/@open-mercato/core/dist/modules/customers/widgets/dashboard'
const TARGETS = [`${BASE}/new-deals/widget.client.js`, `${BASE}/customer-todos/widget.client.js`, `${BASE}/next-interactions/widget.client.js`]

const EDITS = [
  ['"rounded-md border p-3"', '"rounded-md border p-2"'],
  ['"space-y-1.5"', '"space-y-1"'],
  ['"mt-2 text-xs"', '"mt-1 text-xs"'],
]

let applied = 0
for (const target of TARGETS) {
  const file = path.resolve(process.cwd(), target)
  if (!fs.existsSync(file)) { console.log(`[patch:dashboard-density] missing ${target}`); continue }
  let source = fs.readFileSync(file, 'utf8')
  if (source.includes(MARKER)) { console.log(`[patch:dashboard-density] ${path.basename(path.dirname(target))} already applied`); continue }
  let changed = 0
  for (const [from, to] of EDITS) {
    if (source.includes(from)) { source = source.replace(from, to); changed++ }
  }
  if (changed === 0) { console.log(`[patch:dashboard-density] no anchors in ${target}`); continue }
  source = `${MARKER}\n${source}`
  fs.writeFileSync(file, source)
  applied++
  console.log(`[patch:dashboard-density] patched ${path.basename(path.dirname(target))} (${changed} edits)`)
}
console.log(`[patch:dashboard-density] done: ${applied} file(s)`)
