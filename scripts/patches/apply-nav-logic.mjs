#!/usr/bin/env node
/**
 * Managed patch: run the shell's navigation transforms from one shared source.
 *
 * The merge and catalogue rules used to exist twice: inline JavaScript injected into
 * backendChrome.js and a TypeScript re-implementation under src/lib/nav that the tests
 * exercised. They now live once in src/nav/logic.mjs; this patch copies it into the
 * package and reduces the injected helpers to thin wrappers that pass their data in.
 *
 * Runs after apply-nav-config (which installs those helpers on a pristine package).
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:nav-logic] */'
const DIR = 'node_modules/@open-mercato/core/dist/modules/auth/lib'
const TARGET = `${DIR}/backendChrome.js`
const LOGIC_SRC = 'src/nav/logic.js'
const LOGIC_DEST = `${DIR}/nav-logic.generated.mjs`

const src = path.resolve(process.cwd(), LOGIC_SRC)
const dest = path.resolve(process.cwd(), LOGIC_DEST)
const file = path.resolve(process.cwd(), TARGET)
if (!fs.existsSync(src)) {
  console.error(`[patch:nav-logic] source missing: ${LOGIC_SRC}`)
  process.exit(1)
}
if (!fs.existsSync(file)) {
  console.error(`[patch:nav-logic] target not found: ${TARGET}`)
  process.exit(1)
}
fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.copyFileSync(src, dest)

let source = fs.readFileSync(file, 'utf8')
if (source.includes(MARKER)) {
  console.log('[patch:nav-logic] already applied')
  process.exit(0)
}

const IMPORT = `${MARKER}\nimport { mergeSettingsSections as __mergeSettingsImpl, applyGroupCatalog as __applyGroupCatalogImpl } from "./nav-logic.generated.mjs";\n`
const WRAP_MERGE = `function __mergeSettingsSections(groups) { return __mergeSettingsImpl(groups, __SETTINGS_SECTION_MERGE); }`
const WRAP_CATALOG = `function __applyNavGroupCatalog(groups) { return __applyGroupCatalogImpl(groups, __NAV_GROUPS_DATA); }`

function replaceFunction(text, name, replacement) {
  const start = text.indexOf(`function ${name}(`)
  if (start === -1) return null
  let depth = 0
  let index = text.indexOf('{', start)
  for (; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1
    else if (text[index] === '}') {
      depth -= 1
      if (depth === 0) return text.slice(0, start) + replacement + text.slice(index + 1)
    }
  }
  return null
}

let next = replaceFunction(source, '__mergeSettingsSections', WRAP_MERGE)
if (!next) {
  console.error('[patch:nav-logic] __mergeSettingsSections not found — run apply-settings-groups first')
  process.exit(1)
}
source = next
next = replaceFunction(source, '__applyNavGroupCatalog', WRAP_CATALOG)
if (!next) {
  console.error('[patch:nav-logic] __applyNavGroupCatalog not found — run apply-nav-groups first')
  process.exit(1)
}
source = next

// Keep the marker on its own line right after the last import so a re-run finds it.
// Append rather than guess where the last import ends (see apply-settings-groups.mjs).
source = `${source}\n${IMPORT}`

fs.writeFileSync(file, source)
console.log('[patch:nav-logic] helpers now delegate to src/nav/logic.mjs')
