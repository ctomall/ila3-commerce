#!/usr/bin/env node
/**
 * Managed patch: remove nav-only chrome when the shell has no nav groups.
 *
 * The CRM shell replaces the group list with an app-owned five-scene rail, so
 * `groups` is intentionally empty. Two pieces of the built-in sidebar chrome
 * only exist to serve that list:
 *   - the search input (it filters group items), and
 *   - the bottom "scroll to more nav" chevron (the rail no longer overflows).
 *
 * Both would otherwise sit on top of the app-owned rail as dead controls. The
 * guards are generic (`navGroups.length > 0`), not app-specific switches: any
 * installation that empties the groups gets the same behaviour.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:nav-empty-search] */'
const SCROLL_MARKER = '/* [patched:nav-empty-scroll] */'
const TARGET = 'node_modules/@open-mercato/ui/dist/backend/AppShell.js'
const file = path.resolve(process.cwd(), TARGET)
if (!fs.existsSync(file)) {
  console.error(`[patch:nav-empty-search] target not found: ${TARGET}`)
  process.exit(1)
}

let source = fs.readFileSync(file, 'utf8')
let changed = false

if (!source.includes(MARKER)) {
  const ANCHOR = '!compact && /* @__PURE__ */ jsx("div", { className: blockPadding, children: /* @__PURE__ */ jsx(\n        SearchInput,'
  if (!source.includes(ANCHOR)) {
    console.error('[patch:nav-empty-search] search anchor not found — package changed')
    process.exit(1)
  }
  const replacement = '!compact && navGroups.length > 0 && ' + MARKER + ' /* @__PURE__ */ jsx("div", { className: blockPadding, children: /* @__PURE__ */ jsx(\n        SearchInput,'
  source = source.replace(ANCHOR, replacement)
  changed = true
}

if (!source.includes(SCROLL_MARKER)) {
  const SCROLL_ANCHOR = 'sidebarScrollState !== "none" ? /* @__PURE__ */ jsx(\n              "div",'
  if (!source.includes(SCROLL_ANCHOR)) {
    console.error('[patch:nav-empty-search] chevron anchor not found — package changed')
    process.exit(1)
  }
  const replacement = 'sidebarScrollState !== "none" && navGroups.length > 0 ? ' + SCROLL_MARKER + ' /* @__PURE__ */ jsx(\n              "div",'
  source = source.replace(SCROLL_ANCHOR, replacement)
  changed = true
}

if (!changed) {
  console.log('[patch:nav-empty-search] already applied')
  process.exit(0)
}
fs.writeFileSync(file, source)
console.log('[patch:nav-empty-search] sidebar search and scroll chevron now require at least one group')
