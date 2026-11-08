#!/usr/bin/env node
/**
 * Managed patch: stop carriage returns from becoming part of a dictionary label.
 *
 * Every one of the 291 entries in this tenant was imported in one batch and every one
 * of them ends in a CR (`已发送\r`, `AED – 阿联酋迪拉姆\r`, ...). The importer splits
 * CRLF input on "\n", so the CR survives; `normalizeDictionaryValue` trims it for the
 * lookup key but the raw label is written straight through, and the UI then renders
 * the trailing control character.
 *
 * The patch normalises at the single write point — `applySnapshot` in the dictionary
 * command factory, which both create and update go through — so no importer can put
 * control characters into a label again. Existing rows are cleaned separately.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'

const MARKER = '/* [patched:dictionary-control-chars] */'
const TARGET = 'node_modules/@open-mercato/core/dist/modules/dictionaries/commands/factory.js'

const HELPER = `${MARKER}
function stripControlChars(value) {
  if (typeof value !== "string") return value;
  return value.replace(/[\\u0000-\\u001F\\u007F]+/g, " ").replace(/\\s+/g, " ").trim();
}
`

const EDITS = [
  [
    'function applySnapshot(entry, snapshot) {\n',
    `function applySnapshot(entry, snapshot) {\n  ${HELPER}  snapshot = { ...snapshot, value: stripControlChars(snapshot.value), label: stripControlChars(snapshot.label) };\n`,
  ],
]

function main() {
  if (!fs.existsSync(TARGET)) {
    console.error(`[patch:dictionary-control-chars] missing ${TARGET}`)
    process.exit(1)
  }
  let text = fs.readFileSync(TARGET, 'utf8')
  if (text.includes(MARKER)) {
    console.log(`[patch:dictionary-control-chars] already applied: ${TARGET}`)
    return
  }
  for (const [from, to] of EDITS) {
    if (!text.includes(from)) {
      console.error(`[patch:dictionary-control-chars] anchor not found:\n${from.slice(0, 120)}`)
      process.exit(1)
    }
    text = text.replace(from, to)
  }
  fs.writeFileSync(TARGET, text)
  console.log(`[patch:dictionary-control-chars] done: ${TARGET}`)
}

main()
