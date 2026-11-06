#!/usr/bin/env node
/**
 * Managed patch: right-align the money and count columns on sales document lists.
 *
 * Documents are read like paper: numbers line up in a column and the eye scans the last
 * digit. The table shipped every column left-aligned, so totals and counts started at
 * different x positions.
 *
 * DataTable only honours `meta.hidden` (it never applies `meta.className`), so alignment
 * has to be expressed on the header and cell nodes themselves.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:numeric-columns] */'
const TARGET = 'node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentsTable.js'

const RIGHT_SPAN = (label) => `jsx("span", { className: "block text-right", children: t("${label}") })`

const EDITS = [
  [
    '      header: t("sales.documents.list.table.items", "Items"),',
    '      header: /* @__PURE__ */ jsx("span", { className: "block text-right", children: t("sales.documents.list.table.items", "Items") }),',
  ],
  [
    '      cell: ({ row }) => /* @__PURE__ */ jsx("span", { className: "text-sm font-semibold", children: typeof row.original.lineItemCount === "number" ? row.original.lineItemCount : "\\u2014" })',
    '      cell: ({ row }) => /* @__PURE__ */ jsx("span", { className: "text-sm font-semibold text-right tabular-nums", children: typeof row.original.lineItemCount === "number" ? row.original.lineItemCount : "\\u2014" })',
  ],
  [
    '      header: t("sales.documents.list.table.totalNet", "Total (net)"),',
    '      header: /* @__PURE__ */ jsx("span", { className: "block text-right", children: t("sales.documents.list.table.totalNet", "Total (net)") }),',
  ],
  [
    '      cell: ({ row }) => /* @__PURE__ */ jsx("span", { className: "text-sm", children: formatCurrency(row.original.totalNet ?? null, row.original.currency) })',
    '      cell: ({ row }) => /* @__PURE__ */ jsx("span", { className: "text-sm text-right tabular-nums", children: formatCurrency(row.original.totalNet ?? null, row.original.currency) })',
  ],
  [
    '      header: t("sales.documents.list.table.totalGross", "Total (gross)"),',
    '      header: /* @__PURE__ */ jsx("span", { className: "block text-right", children: t("sales.documents.list.table.totalGross", "Total (gross)") }),',
  ],
  [
    '      cell: ({ row }) => /* @__PURE__ */ jsx("span", { className: "text-sm", children: formatCurrency(row.original.totalGross ?? null, row.original.currency) })',
    '      cell: ({ row }) => /* @__PURE__ */ jsx("span", { className: "text-sm text-right tabular-nums", children: formatCurrency(row.original.totalGross ?? null, row.original.currency) })',
  ],
]

const file = path.resolve(process.cwd(), TARGET)
if (!fs.existsSync(file)) {
  console.error(`[patch:numeric-columns] target not found: ${TARGET}`)
  process.exit(1)
}
let source = fs.readFileSync(file, 'utf8')
if (source.includes(MARKER)) {
  console.log('[patch:numeric-columns] already applied')
  process.exit(0)
}
let changed = 0
for (const [from, to] of EDITS) {
  if (!source.includes(from)) {
    console.error(`[patch:numeric-columns] anchor not found: ${from.slice(0, 60)}`)
    process.exit(1)
  }
  source = source.replace(from, to)
  changed += 1
}
fs.writeFileSync(file, `${MARKER}\n${source}`)
console.log(`[patch:numeric-columns] right-aligned ${changed} header/cell nodes`)
