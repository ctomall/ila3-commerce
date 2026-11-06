#!/usr/bin/env node
/**
 * Managed patch: make the collapsed sidebar's expand control legible.
 *
 * In the 80px rail the only way back is a 28px icon button placed at
 * `left: calc(width - 14px)`, i.e. a bare PanelLeftOpen glyph in the top-right
 * corner. Users read the rail as "icons only, no way to expand".
 *
 * When collapsed the same button now renders wider with the label 展开, so the
 * control is self-describing; expanded it stays icon-only (the label would be
 * noise in a 240px sidebar that already shows text).
 *
 * Also swaps `transition-all` for `transition-colors` on that button.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:expand-affordance] */'
const TARGET = 'node_modules/@open-mercato/ui/dist/backend/AppShell.js'

const OLD = `              "aria-label": t("appShell.toggleSidebar"),
              className: "hidden lg:flex fixed top-4 z-dropdown size-7 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm transition-all hover:text-foreground hover:bg-muted focus:outline-none focus-visible:shadow-focus",
              style: { left: \`calc(\${asideWidth} - 14px)\` },
              children: effectiveCollapsed ? /* @__PURE__ */ jsx(PanelLeftOpen, { className: "size-4" }) : /* @__PURE__ */ jsx(PanelLeftClose, { className: "size-4" })`

const NEW = `              "aria-label": t("appShell.toggleSidebar"),
              ${MARKER}
              className: effectiveCollapsed
                ? "hidden lg:flex fixed top-4 z-dropdown h-7 w-auto items-center justify-center gap-1 rounded-md border bg-background px-2 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:shadow-focus"
                : "hidden lg:flex fixed top-4 z-dropdown size-7 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground hover:bg-muted focus:outline-none focus-visible:shadow-focus",
              style: effectiveCollapsed ? { left: "8px", bottom: "52px", top: "auto", zIndex: 60 } : { left: \`calc(\${asideWidth} - 14px)\` },
              children: effectiveCollapsed ? /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(PanelLeftOpen, { className: "size-4" }),
                /* @__PURE__ */ jsx("span", { children: "展开" })
              ] }) : /* @__PURE__ */ jsx(PanelLeftClose, { className: "size-4" })`

const file = path.resolve(process.cwd(), TARGET)
if (!fs.existsSync(file)) {
  console.error(`[patch:expand-affordance] target not found: ${TARGET}`)
  process.exit(1)
}
const source = fs.readFileSync(file, 'utf8')
if (source.includes(MARKER)) {
  console.log('[patch:expand-affordance] already applied')
  process.exit(0)
}
if (!source.includes(OLD)) {
  console.error('[patch:expand-affordance] anchor not found — package changed, update the patch')
  process.exit(1)
}
fs.writeFileSync(file, source.replace(OLD, NEW))
console.log('[patch:expand-affordance] collapsed rail now shows a labelled 展开 button')
