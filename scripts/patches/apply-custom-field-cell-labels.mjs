#!/usr/bin/env node
/**
 * Managed patch: render localized labels for `select` / `dictionary` custom
 * fields in the customers list tables.
 *
 * Findings that shaped this patch (all verified before writing it):
 *   - `applyCustomFieldVisibility` is not the path that builds these columns;
 *     the customers pages build `customColumns` inline.
 *   - Those columns already set `cell: ({ getValue }) => renderCustomFieldCell(getValue())`,
 *     and `renderCustomFieldCell` only stringifies the raw value — it never sees
 *     the field definition, so it cannot resolve an option label.
 *
 * The patch therefore threads the definition into the cell:
 *   cell: ({ getValue }) => renderCustomFieldCellForDef(getValue(), def)
 * and adds that helper next to `renderCustomFieldCell`.
 *
 * Idempotent. A no-op on pages that do not match (deals uses a different shape).
 * Run before `yarn build`; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:cf-label] */'
const CELL_OLD = 'cell: ({ getValue }) => renderCustomFieldCell(getValue())'
const CELL_NEW = `cell: ({ getValue }) => renderCustomFieldCellForDef(getValue(), def) ${MARKER}`
const RENDERER_ANCHOR = 'const renderCustomFieldCell = (value) => {'

const HELPER = `${MARKER}
const renderCustomFieldCellForDef = (value, def) => {
  if (value == null || typeof value !== "string") return renderCustomFieldCell(value);
  const options = Array.isArray(def && def.options) ? def.options : [];
  const hit = options.find((option) => String(option && option.value != null ? option.value : option) === value);
  const label = hit && typeof hit === "object" ? hit.label ?? hit.value : void 0;
  return renderCustomFieldCell(label ?? value);
};
`

const DEALS_TARGET = 'node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/page.js'
const DEALS_MARKER = '/* [patched:cf-label-deals] */'
const DEALS_OLD = `        const stringValue = typeof value === "string" ? value.trim() : String(value);
        if (!stringValue) return noValue;
        return /* @__PURE__ */ jsx("span", { className: "text-sm", children: stringValue });`
const DEALS_NEW = `        const stringValue = typeof value === "string" ? value.trim() : String(value);
        if (!stringValue) return noValue;
        const __cfOptions = Array.isArray(def && def.options) ? def.options : [];
        const __cfHit = __cfOptions.find((option) => String(option && option.value != null ? option.value : option) === stringValue);
        const __cfLabel = __cfHit && typeof __cfHit === "object" ? __cfHit.label ?? __cfHit.value : void 0;
        return /* @__PURE__ */ jsx("span", { className: "text-sm", children: __cfLabel ?? stringValue }); ${DEALS_MARKER}`

const TARGETS = [
  'node_modules/@open-mercato/core/dist/modules/customers/backend/customers/companies/page.js',
  'node_modules/@open-mercato/core/dist/modules/customers/backend/customers/people/page.js',
]


/**
 * Remove the earlier (ineffective) injections this patch used to make in
 * customFieldColumns.js. Kept so a tree patched by an older revision converges
 * back to a clean state instead of carrying dead code.
 */
function cleanupLegacy(root) {
  const file = path.resolve(root, 'node_modules/@open-mercato/ui/dist/backend/utils/customFieldColumns.js')
  if (!fs.existsSync(file)) return
  let src = fs.readFileSync(file, 'utf8')
  const before = src.length
  src = src.replace(/\/\* \[patched:custom-field-cell-labels\] \*\/[\s\S]*?(?=function applyCustomFieldVisibility)/, '')
  src = src.replace(/ {4}if \(!c\.cell\) \{\n      const renderer = customFieldCellRenderer\(def\);\n      if \(renderer\) c\.cell = renderer;\n    \}\n/, '')
  src = src.replace(/ {4}\/\* \[patched:custom-field-cell-labels:missing\] \*\/\n {4}\{\n      const renderer = customFieldCellRenderer\(d\);\n      if \(renderer\) col\.cell = renderer;\n    \}\n/, '')
  if (src.length !== before) {
    fs.writeFileSync(file, src)
    console.log('[patch:cf-label] removed legacy injections from customFieldColumns.js')
  }
}

const root = process.cwd()
cleanupLegacy(root)
let patched = 0
let already = 0
let skipped = 0

for (const target of TARGETS) {
  const file = path.resolve(root, target)
  if (!fs.existsSync(file)) { skipped++; continue }
  let source = fs.readFileSync(file, 'utf8')

  if (source.includes(MARKER)) { already++; continue }
  if (!source.includes(CELL_OLD) || !source.includes(RENDERER_ANCHOR)) { skipped++; continue }

  source = source.replace(RENDERER_ANCHOR, HELPER + '\n    ' + RENDERER_ANCHOR)
  source = source.replace(CELL_OLD, CELL_NEW)
  fs.writeFileSync(file, source)
  patched++
  console.log(`[patch:cf-label] patched ${path.basename(path.dirname(target))}/page.js`)
}

// deals/page.js builds its custom-field cell inline instead of via a named helper.
{
  const file = path.resolve(root, DEALS_TARGET)
  if (fs.existsSync(file)) {
    const source = fs.readFileSync(file, 'utf8')
    if (source.includes(DEALS_MARKER)) already++
    else if (source.includes(DEALS_OLD)) {
      fs.writeFileSync(file, source.replace(DEALS_OLD, DEALS_NEW))
      patched++
      console.log('[patch:cf-label] patched deals/page.js')
    } else skipped++
  } else skipped++
}

console.log(`[patch:cf-label] done: patched=${patched} already=${already} skipped=${skipped}`)
