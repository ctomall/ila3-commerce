#!/usr/bin/env node
/**
 * Managed patch: run the shell's navigation transforms from one shared source.
 *
 * The merge and catalogue rules used to exist twice: inline JavaScript injected into
 * backendChrome.js and a TypeScript re-implementation under src/lib/nav that the tests
 * exercised. They now live once in src/nav/logic.mjs; this patch copies it into the
 * package and reduces the injected helpers to thin wrappers that pass their data in.
 *
 * The catalogue helper also receives the shell's `translate` function: a container
 * merges several module page groups, so its label cannot inherit one group's already
 * translated name — it is resolved from the catalogue's own `labelKey` instead.
 *
 * Runs after apply-nav-config (which installs those helpers on a pristine package).
 *
 * Re-runnable on an already patched package: the wrapper and its call site are
 * normalised on every run, so a node_modules tree patched by an older revision of
 * this script still receives the translate-aware contract instead of silently
 * keeping the previous one. Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:nav-logic] */'
const CATALOG_CALL_MARKER = '/* [patched:nav-logic-call] */'
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

const IMPORT = `${MARKER}\nimport { mergeSettingsSections as __mergeSettingsImpl, applyGroupCatalog as __applyGroupCatalogImpl } from "./nav-logic.generated.mjs";\n`
const WRAP_MERGE = `function __mergeSettingsSections(groups) { return __mergeSettingsImpl(groups, __SETTINGS_SECTION_MERGE); }`
const WRAP_CATALOG = `function __applyNavGroupCatalog(groups, translate) { return __applyGroupCatalogImpl(groups, __NAV_GROUPS_DATA, translate); }`

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

// 1. The shared implementation import. Appending is safe (ES modules allow an import
//    declaration anywhere at the top level) and avoids guessing where the last import
//    ends; `apply-settings-groups.mjs` already appended one the same way.
if (!source.includes(MARKER)) {
  source = `${source}\n${IMPORT}`
}

// 2. The merge helper wrapper (translation is not involved: settings sections carry
//    their own labelKey and are translated when the sections are converted).
const merged = replaceFunction(source, '__mergeSettingsSections', WRAP_MERGE)
if (!merged) {
  console.error('[patch:nav-logic] __mergeSettingsSections not found — run apply-settings-groups first')
  process.exit(1)
}
source = merged

// 3. The catalogue helper wrapper. Replace it on every run so a package patched by an
//    older script revision gains the translate argument.
const catalogued = replaceFunction(source, '__applyNavGroupCatalog', WRAP_CATALOG)
if (!catalogued) {
  console.error('[patch:nav-logic] __applyNavGroupCatalog not found — run apply-nav-groups first')
  process.exit(1)
}
source = catalogued

// 4. Pass the request translator through at the single call site. The shell resolves
//    the payload for one locale, so the container label is rendered in that locale.
const CALL = '__applyNavGroupCatalog(userPreference ? applySidebarPreference(baseForUser, userPreference) : baseForUser)'
const CALL_TRANSLATED = '__applyNavGroupCatalog(userPreference ? applySidebarPreference(baseForUser, userPreference) : baseForUser, translate)'
if (source.includes(CALL)) {
  source = source.replace(CALL, `${CALL_TRANSLATED} ${CATALOG_CALL_MARKER}`)
} else if (!source.includes(CALL_TRANSLATED)) {
  console.error('[patch:nav-logic] __applyNavGroupCatalog call site not found — package changed')
  process.exit(1)
}

fs.writeFileSync(file, source)
console.log('[patch:nav-logic] helpers now delegate to src/nav/logic.mjs')
