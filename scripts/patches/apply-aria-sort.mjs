#!/usr/bin/env node
/**
 * Managed patch: expose the sort direction to assistive tech.
 *
 * Sortable column headers render a button with a chevron, but the `th` carried
 * no `aria-sort`, so a screen reader could not tell whether a column was sorted
 * or in which direction (measured: 6 sortable headers, 0 with aria-sort).
 *
 * The value comes from TanStack's own `header.column.getIsSorted()`, so it stays
 * in sync with the chevron the sighted user sees.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:aria-sort] */'
const TARGET = 'node_modules/@open-mercato/ui/dist/backend/DataTable.js'

const OLD = `                  className: cn("group relative", responsiveClass(priority, columnMeta?.hidden) + stickyClass),
                  style: typeof sizedWidth === "number" ? { width: sizedWidth, minWidth: sizedWidth, maxWidth: sizedWidth } : void 0,`

const NEW = `                  className: cn("group relative", responsiveClass(priority, columnMeta?.hidden) + stickyClass),
                  ${MARKER}
                  "aria-sort": (() => {
                    const sortState = header.column.getIsSorted ? header.column.getIsSorted() : false;
                    if (sortState === "asc") return "ascending";
                    if (sortState === "desc") return "descending";
                    return "none";
                  })(),
                  style: typeof sizedWidth === "number" ? { width: sizedWidth, minWidth: sizedWidth, maxWidth: sizedWidth } : void 0,`



const DND_MARKER = '/* [patched:aria-sort-dnd] */'
const DND_EDITS = [
  {
    from: 'function SortableHeaderCell({ id, children, className, width }) {',
    to: `function SortableHeaderCell({ id, children, className, width, ariaSort }) { ${DND_MARKER}`,
  },
  {
    from: 'return /* @__PURE__ */ jsx(TableHead, { ref: setNodeRef, style, className, ...attributes, ...listeners, children });',
    to: 'return /* @__PURE__ */ jsx(TableHead, { ref: setNodeRef, style, className, ...attributes, ...listeners, "aria-sort": ariaSort, children });',
  },
  {
    from: 'return enableHeaderDnd ? /* @__PURE__ */ jsxs(SortableHeaderCell, { id: header.id, width: sizedWidth, className: cn("group", responsiveClass(priority, columnMeta?.hidden) + stickyClass), children: [',
    to: 'return enableHeaderDnd ? /* @__PURE__ */ jsxs(SortableHeaderCell, { id: header.id, width: sizedWidth, className: cn("group", responsiveClass(priority, columnMeta?.hidden) + stickyClass), ariaSort: (() => { const sortState = header.column.getIsSorted ? header.column.getIsSorted() : false; if (sortState === "asc") return "ascending"; if (sortState === "desc") return "descending"; return "none"; })(), children: [',
  },
]

const file = path.resolve(process.cwd(), TARGET)
if (!fs.existsSync(file)) {
  console.error(`[patch:aria-sort] target not found: ${TARGET}`)
  process.exit(1)
}
const source = fs.readFileSync(file, 'utf8')
for (const { from, to } of DND_EDITS) {
  if (source.includes(from)) source = source.replace(from, to)
}
if (source.includes(MARKER) && source.includes(DND_MARKER)) {
  fs.writeFileSync(file, source)
  console.log('[patch:aria-sort] already applied')
  process.exit(0)
}
if (!source.includes(OLD)) {
  console.error('[patch:aria-sort] anchor not found — package changed, update the patch')
  process.exit(1)
}
fs.writeFileSync(file, source.replace(OLD, NEW))
console.log('[patch:aria-sort] sortable headers now report aria-sort')
