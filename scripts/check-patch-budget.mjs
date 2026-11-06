#!/usr/bin/env node
/**
 * Patch budget.
 *
 * S5 (moving the remaining patches to the app layer) is deferred until the package
 * exposes the hooks described in docs/upstream-hooks-proposal.md, so 27 managed
 * patches is the accepted baseline. This check makes that baseline explicit: the
 * number can go down freely, but adding a patch needs a deliberate budget bump in
 * review, the same way the !important budget works.
 */
import fs from 'node:fs'
import path from 'node:path'

const BUDGET = 27
const manifestPath = path.resolve(process.cwd(), 'scripts/patches/manifest.json')

if (!fs.existsSync(manifestPath)) {
  console.error(`[patch-budget] missing ${manifestPath}`)
  process.exit(1)
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const patches = Array.isArray(manifest.patches) ? manifest.patches : []

console.log(`[patch-budget] ${patches.length} patch(es), budget ${BUDGET}`)
for (const patch of patches) console.log(`  ${patch.id} -> ${patch.target}`)

if (patches.length > BUDGET) {
  console.error(
    `[patch-budget] over budget by ${patches.length - BUDGET}. Prefer an app-layer hook ` +
      '(docs/upstream-hooks-proposal.md) over another patch, or raise the budget in review.',
  )
  process.exit(1)
}
