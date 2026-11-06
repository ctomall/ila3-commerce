#!/usr/bin/env node
/**
 * Managed patch: merge settings partitions into the short list people scan.
 *
 * Works from a pristine package too: it installs the merge table (copied from
 * src/nav/settings-sections.json), adds the merge helper and wraps the existing
 * serializer. A previous incarnation replaced an inline literal that only existed
 * because of an even older patch, so it could never apply on a clean install.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:settings-groups] */'
const DIR = 'node_modules/@open-mercato/core/dist/modules/auth/lib'
const TARGET = `${DIR}/backendChrome.js`
const DATA_SRC = 'src/nav/settings-sections.json'
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

// 1. The table: replace an older inline literal when present, otherwise import the
//    copied data file. Either way `__SETTINGS_SECTION_MERGE` ends up defined once.
const IMPORT = `import __SETTINGS_SECTION_MERGE_DATA from "./settings-sections.generated.json" with { type: "json" };\nconst __SETTINGS_SECTION_MERGE = __SETTINGS_SECTION_MERGE_DATA;\n`
const inline = source.match(/const __SETTINGS_SECTION_MERGE = \{[\s\S]*?\};\n/)
if (inline) {
  source = source.replace(inline[0], IMPORT)
} else {
  if (source.includes('__SETTINGS_SECTION_MERGE')) {
    console.error('[patch:settings-groups] unexpected existing merge reference')
    process.exit(1)
  }
  // Appending is safe (ES modules allow an import declaration anywhere at top level)
  // and avoids guessing where the last import ends: the previous heuristic landed inside
  // a multi-line import block on a fresh package and broke the build.
  source = `${source}\n${IMPORT}`
}

// 2. The merge itself, wrapped around the existing serializer.
const HELPER = `${MARKER}
function __mergeSettingsSections(groups) {
  if (!Array.isArray(groups)) return groups;
  const merged = new Map();
  for (const group of groups) {
    if (!group) continue;
    const target = __SETTINGS_SECTION_MERGE[group.labelKey] || __SETTINGS_SECTION_MERGE[group.id];
    const id = target ? target.id : group.id;
    const labelKey = target ? target.labelKey : group.labelKey;
    const label = target ? target.label : group.label;
    const order = target ? target.order : group.order;
    if (!merged.has(id)) {
      merged.set(id, { id, label, labelKey, order, items: [] });
    }
    const bucket = merged.get(id);
    if (Array.isArray(group.items)) bucket.items.push(...group.items);
  }
  return Array.from(merged.values());
}

`
const SERIALIZER = 'async function serializeSectionGroups(groups) {\n'
if (!source.includes(SERIALIZER)) {
  console.error('[patch:settings-groups] serializeSectionGroups not found — package changed')
  process.exit(1)
}
source = source.replace(HELPER + SERIALIZER, SERIALIZER) // keep idempotent on re-runs
source = source.replace(SERIALIZER, HELPER + SERIALIZER + '  groups = __mergeSettingsSections(groups);\n')

fs.writeFileSync(file, source)
console.log('[patch:settings-groups] settings partitions merged via repository data')
