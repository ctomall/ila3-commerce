#!/usr/bin/env node
/**
 * Managed patch: render list load failures as an alert block (T11).
 *
 * Depends on apply-list-load-error.mjs, which makes pages pass `error` to
 * DataTable. Before that wiring existed this branch was dead code, and a visual
 * patch here was inert — that is why it was reverted once already.
 *
 * Replaces the bare `text-destructive` cell with: error illustration, localized
 * title, and the raw message as secondary detail (never as the only text).
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:list-error-visual] */'
const TARGET = 'node_modules/@open-mercato/ui/dist/backend/DataTable.js'

const OLD = `: error ? /* @__PURE__ */ jsx(TableRow, { children: /* @__PURE__ */ jsx(TableCell, { colSpan: mergedColumns.length + (rowActions || injectedRowActions.length > 0 ? 1 : 0) + (hasInjectedBulkActions ? 1 : 0), className: "h-24 text-center text-destructive", children: error }) })`
const NEW = `: error ? /* @__PURE__ */ jsx(TableRow, { children: /* @__PURE__ */ jsx(TableCell, { colSpan: mergedColumns.length + (rowActions || injectedRowActions.length > 0 ? 1 : 0) + (hasInjectedBulkActions ? 1 : 0), className: "p-0", children: /* @__PURE__ */ jsxs("div", { role: "alert", className: "flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", children: [
            /* @__PURE__ */ jsx("img", { src: "/brand/state-error.svg", alt: "", "aria-hidden": "true", width: 160, height: 120, className: "opacity-80 text-destructive" }),
            /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-destructive", children: t("ui.dataTable.error.title", "加载失败") }),
            /* @__PURE__ */ jsx("p", { className: "max-w-md break-words text-xs text-muted-foreground", children: t("ui.dataTable.error.hint", "请刷新页面重试；若持续失败，请联系管理员。") }),
            typeof error === "string" ? /* @__PURE__ */ jsx("p", { className: "max-w-md break-words text-[11px] text-muted-foreground/70", children: error }) : null
          ] }) }) }) ${MARKER}`

const file = path.resolve(process.cwd(), TARGET)
if (!fs.existsSync(file)) {
  console.error(`[patch:list-error-visual] target not found: ${TARGET}`)
  process.exit(1)
}
const source = fs.readFileSync(file, 'utf8')
if (source.includes(MARKER)) {
  console.log('[patch:list-error-visual] already applied')
  process.exit(0)
}
if (!source.includes(OLD)) {
  console.error('[patch:list-error-visual] anchor not found — package changed, update the patch')
  process.exit(1)
}
fs.writeFileSync(file, source.replace(OLD, NEW))
console.log('[patch:list-error-visual] list error branch now renders alert + illustration')
