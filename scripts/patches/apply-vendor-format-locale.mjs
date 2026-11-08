#!/usr/bin/env node
/**
 * Managed patch: install the source-built locale-aware formatters.
 *
 * `vendor/open-mercato/**` holds files compiled from the mirror's packages/**
 * sources (source of truth, committed there as well). This script copies them
 * over the registry build and stamps a marker so `verify-patches` can assert the
 * install did not silently revert to the unlocalized upstream files.
 *
 * Why copy instead of `file:` dependencies: the other 17 managed patches rewrite
 * the same dist trees, so switching the dependency source is a separate migration.
 * Until those patches are ported, this keeps the fix reproducible across a
 * `yarn install` instead of living in node_modules only.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const MARKER = '/* [patched:vendor-format-locale] */'

const FILES = [
  ['vendor/open-mercato/ui/dist/utils/format-locale.js', 'node_modules/@open-mercato/ui/dist/utils/format-locale.js'],
  ['vendor/open-mercato/ui/dist/utils/format.js', 'node_modules/@open-mercato/ui/dist/utils/format.js'],
  [
    'vendor/open-mercato/core/dist/modules/sales/components/documents/SalesDocumentsTable.js',
    'node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentsTable.js',
  ],
]

for (const [from, to] of FILES) {
  const src = path.resolve(root, from)
  const dest = path.resolve(root, to)
  if (!fs.existsSync(src)) {
    console.error(`[patches] vendor-format-locale: missing ${from}`)
    process.exit(1)
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const body = fs.readFileSync(src, 'utf8').replace(/^\/\* \[patched:vendor-format-locale\] \*\/\n/, '')
  fs.writeFileSync(dest, `${MARKER}\n${body}`)
  console.log(`[patches] vendor-format-locale: ${to}`)
}
