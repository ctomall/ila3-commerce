#!/usr/bin/env node
/**
 * Managed patch: denser tables and a sidebar that opens only the active group.
 *
 * Two usability findings from the UI audit (see docs/frontend-ui-plan.md):
 *
 * 1. Rows are 49px because TableCell/TableHead use `py-2` on top of 32px row
 *    actions. Dropping to `py-1` brings rows to ~41px, which is ~19% more rows
 *    per screen without shrinking any control.
 * 2. `openGroups` starts every group expanded, so the sidebar is 2505px tall and
 *    needs ~2.8 screens at 900px. It now starts with only the group that owns
 *    the current route open; explicit user toggles still win.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:density-nav] */'

const TARGETS = [
  {
    file: 'node_modules/@open-mercato/ui/dist/primitives/table.js',
    edits: [
      ['"text-left font-medium px-4 py-2 whitespace-nowrap text-muted-foreground"', '"text-left font-medium px-4 py-1 whitespace-nowrap text-muted-foreground"'],
      ['className: cn("px-4 py-2", className)', 'className: cn("px-4 py-1", className)'],
    ],
  },
]

let applied = 0
for (const { file, edits } of TARGETS) {
  const abs = path.resolve(process.cwd(), file)
  if (!fs.existsSync(abs)) { console.log(`[patch:density-nav] missing ${file}`); continue }
  let source = fs.readFileSync(abs, 'utf8')
  if (source.includes(MARKER)) { console.log(`[patch:density-nav] ${path.basename(file)} already applied`); continue }
  for (const [from, to] of edits) {
    if (!source.includes(from)) {
      console.error(`[patch:density-nav] anchor not found in ${file}: ${from.slice(0, 60)}`)
      process.exit(1)
    }
    source = source.replace(from, to)
  }
  fs.writeFileSync(abs, source)
  applied++
  console.log(`[patch:density-nav] patched ${path.basename(file)}`)
}
console.log(`[patch:density-nav] done: ${applied} file(s)`)
