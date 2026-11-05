#!/usr/bin/env node
/**
 * Managed patch: stop force-collapsing the sidebar on settings pages.
 *
 * Entering a settings/profile route called setCollapsed(true), so the settings
 * navigation rendered as a 79px icon rail with 40 unlabelled entries (1913px
 * tall). Keeping the user's own collapse preference means settings reuse the
 * labelled, grouped sidebar: 8 groups, collapsed except the active one.
 *
 * The restore-on-return logic is left alone; it becomes a no-op because the
 * saved value equals the current one.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:settings-sidebar] */'
const TARGET = 'node_modules/@open-mercato/ui/dist/backend/AppShell.js'

const OLD = `    if (previous === "main" && sidebarMode !== "main") {
      collapsedBeforeSectionRef.current = collapsed;
      if (!collapsed) setCollapsed(true);
    } else if`
const NEW = `    if (previous === "main" && sidebarMode !== "main") {
      ${MARKER}
      collapsedBeforeSectionRef.current = collapsed;
    } else if`

const file = path.resolve(process.cwd(), TARGET)
if (!fs.existsSync(file)) {
  console.error(`[patch:settings-sidebar] target not found: ${TARGET}`)
  process.exit(1)
}
const source = fs.readFileSync(file, 'utf8')
if (source.includes(MARKER)) {
  console.log('[patch:settings-sidebar] already applied')
  process.exit(0)
}
if (!source.includes(OLD)) {
  console.error('[patch:settings-sidebar] anchor not found — package changed, update the patch')
  process.exit(1)
}
fs.writeFileSync(file, source.replace(OLD, NEW))
console.log('[patch:settings-sidebar] settings pages keep the expanded sidebar')
