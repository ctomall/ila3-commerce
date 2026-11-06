#!/usr/bin/env node
/**
 * Managed patch: load the settings-section merge from repository data.
 *
 * Partitions used to be merged by a table written directly into the package,
 * which meant changing the grouping meant editing node_modules (and any package
 * upgrade erased it). The table now lives in
 * `scripts/patches/data/settings-sections.json`; this patch copies it next to the
 * module and replaces the inline literal with an import, so the grouping is data
 * the repository owns.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:settings-groups] */'
const DIR = 'node_modules/@open-mercato/core/dist/modules/auth/lib'
const TARGET = `${DIR}/backendChrome.js`
const DATA_SRC = 'scripts/patches/data/settings-sections.json'
const DATA_DEST = `${DIR}/settings-sections.generated.json`

const src = path.resolve(process.cwd(), DATA_SRC)
const dest = path.resolve(process.cwd(), DATA_DEST)
const file = path.resolve(process.cwd(), TARGET)
if (!fs.existsSync(src)) {
  console.error(`[patch:settings-groups] data file missing: ${DATA_SRC}`)
  process.exit(1)
}
if (!fs.existsSync(file)) {
  console.error(`[patch:settings-groups] target not found: ${TARGET}`)
  process.exit(1)
}

fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.copyFileSync(src, dest)

let source = fs.readFileSync(file, 'utf8')
if (source.includes(MARKER)) {
  console.log('[patch:settings-groups] already applied')
  process.exit(0)
}

const literal = source.match(/const __SETTINGS_SECTION_MERGE = \{[\s\S]*?\};\n/)
if (!literal) {
  console.error('[patch:settings-groups] merge literal not found — package changed')
  process.exit(1)
}
source = source.replace(
  literal[0],
  `${MARKER}\nimport __SETTINGS_SECTION_MERGE_DATA from "./settings-sections.generated.json" with { type: "json" };\nconst __SETTINGS_SECTION_MERGE = __SETTINGS_SECTION_MERGE_DATA;\n`,
)
fs.writeFileSync(file, source)
console.log('[patch:settings-groups] merge table now loaded from repository data')
