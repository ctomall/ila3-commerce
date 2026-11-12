#!/usr/bin/env node
/**
 * Patch budget.
 *
 * Every managed patch is a place where this install diverges from upstream, so the
 * count only goes down: it can shrink freely, adding one needs a deliberate budget
 * bump in review, the same way the !important budget works. Entries are grouped per
 * target file, and a patch that installs several files from source declares them as
 * `targets`, so the number tracks concerns rather than lines. The file count is
 * printed alongside it so that folding does not look like progress on its own.
 */
import fs from 'node:fs'
import path from 'node:path'

// 2026-11-12: raised 15 -> 21 in review. The communications outbound reliability
// work added six distinct concerns (attempt-unknown, inactive-channel-failed,
// tenant-channel-shared, outbound-thread-reuse-v2, dedupe-external-message-id,
// send-as-user-team-channel); each carries its own marker and test, and none
// could be expressed through the app-layer hook surface. Fold candidates remain
// the three AppShell entries, which this bump deliberately does not touch.
const BUDGET = 21
const manifestPath = path.resolve(process.cwd(), 'scripts/patches/manifest.json')

if (!fs.existsSync(manifestPath)) {
  console.error(`[patch-budget] missing ${manifestPath}`)
  process.exit(1)
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const patches = Array.isArray(manifest.patches) ? manifest.patches : []
const files = patches.reduce(
  (sum, patch) => sum + (Array.isArray(patch.targets) ? patch.targets.length : patch.target ? 1 : 0),
  0,
)

console.log(`[patch-budget] ${patches.length} patch(es) over ${files} file(s), budget ${BUDGET}`)
for (const patch of patches) {
  const targets = Array.isArray(patch.targets) ? patch.targets : [patch.target]
  console.log(`  ${patch.id} -> ${targets.length === 1 ? targets[0] : `${targets.length} targets`}`)
}

if (patches.length > BUDGET) {
  console.error(
    `[patch-budget] over budget by ${patches.length - BUDGET}. Prefer an app-layer hook ` +
      '(docs/upstream-hooks-proposal.md) over another patch, or raise the budget in review.',
  )
  process.exit(1)
}
