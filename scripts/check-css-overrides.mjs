#!/usr/bin/env node
/**
 * Guard the number of `!important` overrides in the app stylesheet.
 *
 * Forcing styles with `!important` bypasses the design tokens, so the count is
 * part of the design contract rather than a free-for-all. The budget only goes
 * down: raise it deliberately in a review, never to make a one-off fix pass.
 */
import fs from 'node:fs'
import path from 'node:path'

const BUDGET = 13
const TARGET = 'src/app/globals.css'

const file = path.resolve(process.cwd(), TARGET)
if (!fs.existsSync(file)) {
  console.error(`[css-overrides] missing ${TARGET}`)
  process.exit(1)
}
const lines = fs.readFileSync(file, 'utf8').split('\n')
const hits = lines
  .map((text, index) => ({ text, line: index + 1 }))
  .filter((entry) => entry.text.includes('!important'))

console.log(`[css-overrides] !important: ${hits.length} (budget ${BUDGET})`)
for (const hit of hits) console.log(`  ${TARGET}:${hit.line}  ${hit.text.trim()}`)

if (hits.length > BUDGET) {
  console.error(`[css-overrides] over budget by ${hits.length - BUDGET}: prefer a token in @theme over !important`)
  process.exit(1)
}
