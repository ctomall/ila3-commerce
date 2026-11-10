#!/usr/bin/env node
/**
 * Managed patch: accessible active state + reduced-motion variant for the stock
 * AppShell sidebar.
 *
 * The installed shell is prebuilt: it renders the sidebar but does not mark the
 * current destination with `aria-current`, and its desktop width transition runs
 * even when the user asked for reduced motion. The retired app-owned rail did
 * mark the active group; leaving the stock shell as-is would be an a11y
 * regression. This patch keeps the stock look and only adds the missing
 * attributes/class:
 *
 *   - `aria-current="page"` on the active main item, active child item and
 *     active settings/profile section item (exactly one is active at a time);
 *   - `motion-reduce:transition-none` on the desktop aside width transition and
 *     the grid-column transition that mirrors it.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs and the patch
 * reproducibility gate. Fails loudly (non-zero) when an anchor no longer
 * matches, so an upstream build change cannot silently drop the a11y fix.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:nav-a11y] */'
const TARGET = 'node_modules/@open-mercato/ui/dist/backend/AppShell.js'
const file = path.resolve(process.cwd(), TARGET)

if (!fs.existsSync(file)) {
  console.error(`[patch:nav-a11y] target not found: ${TARGET}`)
  process.exit(1)
}

let source = fs.readFileSync(file, 'utf8')

if (source.includes(MARKER)) {
  const applied = source.split(MARKER).length - 1
  if (applied !== 5) {
    console.error(`[patch:nav-a11y] marker present ${applied} time(s), expected 5 — partial patch`)
    process.exit(1)
  }
  console.log('[patch:nav-a11y] already applied')
  process.exit(0)
}

// Each entry replaces an anchor that exists in the pristine package as well as
// in the already-patched tree: never depend on another patch's output.
const EDITS = [
  {
    name: 'settings/profile section item aria-current',
    from: 'style: spacingStyle,',
    to: 'style: spacingStyle,\n                "aria-current": isActive ? "page" : void 0, ' + MARKER,
  },
  {
    name: 'main sidebar item aria-current',
    from: '"aria-disabled": i.enabled === false,',
    to: '"aria-disabled": i.enabled === false,\n                          "aria-current": isParentActive ? "page" : void 0, ' + MARKER,
  },
  {
    name: 'child sidebar item aria-current',
    from: '"aria-disabled": c.enabled === false,',
    to: '"aria-disabled": c.enabled === false,\n                              "aria-current": childActive ? "page" : void 0, ' + MARKER,
  },
  {
    name: 'aside width reduced-motion',
    from: 'transition-[width] duration-200 ease-out`',
    to: 'transition-[width] duration-200 ease-out motion-reduce:transition-none` ' + MARKER,
  },
  {
    name: 'grid column reduced-motion',
    from: '${gridColsClass}`,',
    to: '${gridColsClass}`, ' + MARKER,
  },
]

for (const edit of EDITS) {
  const occurrences = source.split(edit.from).length - 1
  if (occurrences !== 1) {
    console.error(
      `[patch:nav-a11y] ${edit.name} anchor matched ${occurrences} time(s), expected 1 — package changed`,
    )
    process.exit(1)
  }
  source = source.replace(edit.from, edit.to)
}

// The grid transition class is edited separately: it must also carry the
// reduced-motion variant, not only the marker.
const gridFrom = 'transition-[grid-template-columns] duration-200 ease-out'
if (!source.includes(gridFrom)) {
  console.error('[patch:nav-a11y] grid transition anchor not found — package changed')
  process.exit(1)
}
source = source.replace(gridFrom, `${gridFrom} motion-reduce:transition-none`)
if (!source.includes('transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none')) {
  console.error('[patch:nav-a11y] grid reduced-motion replacement failed')
  process.exit(1)
}

const applied = source.split(MARKER).length - 1
if (applied !== 5) {
  console.error(`[patch:nav-a11y] wrote ${applied} marker(s), expected 5`)
  process.exit(1)
}

fs.writeFileSync(file, source)
console.log('[patch:nav-a11y] added aria-current to active items and reduced-motion to width transitions')
