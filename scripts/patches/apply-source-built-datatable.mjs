#!/usr/bin/env node
/**
 * Managed patch: install the source-built DataTable.
 *
 * packages/ui/src/backend/DataTable.tsx in the private mirror now carries aria-sort,
 * the empty-state illustration and the error art, so the three dist patches on this
 * file are gone. The build output is committed under vendor/ and copied in here, which
 * keeps `npm ci` + build reproducible instead of relying on a manual copy.
 *
 * Rebuild the vendor file with:
 *   cd <mirror>/packages/ui && node build.mjs
 *   cp dist/backend/DataTable.js <repo>/vendor/open-mercato/ui/DataTable.js
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:source-built-data-table] */'
const TARGET = 'node_modules/@open-mercato/ui/dist/backend/DataTable.js'
const SOURCE = 'vendor/open-mercato/ui/DataTable.js'

const target = path.resolve(process.cwd(), TARGET)
const source = path.resolve(process.cwd(), SOURCE)
if (!fs.existsSync(source)) {
  console.error(`[patch:source-built-datatable] vendored build missing: ${SOURCE}`)
  process.exit(1)
}
if (!fs.existsSync(target)) {
  console.error(`[patch:source-built-datatable] target missing: ${TARGET}`)
  process.exit(1)
}

const vendored = fs.readFileSync(source, 'utf8')
const current = fs.readFileSync(target, 'utf8')
if (current.includes(MARKER)) {
  console.log('[patch:source-built-datatable] already installed')
  process.exit(0)
}
if (!vendored.includes('"aria-sort"')) {
  console.error('[patch:source-built-datatable] vendored build has no aria-sort — rebuild it from the mirror')
  process.exit(1)
}
fs.writeFileSync(target, `${MARKER}\n${vendored}`)
console.log('[patch:source-built-datatable] installed the source-built DataTable')
