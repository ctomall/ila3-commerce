#!/usr/bin/env node
/**
 * Managed patch: remove the patched sidebar footer now that it is injected.
 *
 * The footer was previously written into AppShell by two patches. It now ships as
 * an app injection widget (src/modules/settings_home/widgets/injection/
 * sidebar-footer) targeting `backend:sidebar:footer`, which reads the shell's
 * collapse state through useSidebarCollapse(). This patch takes the package back
 * to its original shape: the nav fills the aside again and no footer markup
 * remains, so only the injected one renders.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:sidebar-footer-injected] */'
const TARGET = 'node_modules/@open-mercato/ui/dist/backend/AppShell.js'

const OLD = `            /* @__PURE__ */ jsxs("div", {
              /* [patched:sidebar-footer-inline] */
              /* [patched:sidebar-footer] */
              /* [patched:expand-affordance] */
              className: "flex shrink-0 items-center gap-1 border-t px-2 py-2",`

const file = path.resolve(process.cwd(), TARGET)
if (!fs.existsSync(file)) {
  console.error(`[patch:sidebar-footer-removed] target not found: ${TARGET}`)
  process.exit(1)
}
let source = fs.readFileSync(file, 'utf8')
if (source.includes(MARKER)) {
  console.log('[patch:sidebar-footer-removed] already applied')
  process.exit(0)
}

const start = source.indexOf(OLD)
if (start === -1) {
  // On a pristine package there is no patched footer to remove, which is the desired
  // end state. Record the marker so verification sees this entry as satisfied.
  source = `${MARKER}\n${source}`
  fs.writeFileSync(file, source)
  console.log('[patch:sidebar-footer-removed] nothing to remove (pristine package)')
  process.exit(0)
}
// The footer block ends with the line `            }),` followed by the scroll-hint block.
const endMarker = '            }),\n'
const end = source.indexOf(endMarker, start)
if (end === -1) {
  console.error('[patch:sidebar-footer-removed] footer end not found')
  process.exit(1)
}
source = source.slice(0, start) + MARKER + '\n' + source.slice(end + endMarker.length)

// Restore the aside children to the plain nav call (drop the flex wrapper added
// for the in-layout footer).
const WRAPPED = '            /* @__PURE__ */ jsx("div", { className: "flex min-h-0 flex-1 flex-col", children: renderSidebar(effectiveCollapsed, false, isSectionView) }),'
if (!source.includes(WRAPPED)) {
  console.log('[patch:sidebar-footer-removed] no wrapper to unwrap (pristine package)')
  fs.writeFileSync(file, source)
  process.exit(0)
}
source = source.replace(WRAPPED, '            renderSidebar(effectiveCollapsed, false, isSectionView),')
fs.writeFileSync(file, source)
console.log('[patch:sidebar-footer-removed] shell footer removed; injection renders it now')
