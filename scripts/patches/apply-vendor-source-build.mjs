#!/usr/bin/env node
/**
 * Managed patch: install the source-built package files.
 *
 * `vendor/open-mercato/prebuilt/**` holds files compiled from the private mirror's
 * `packages/**` sources — the mirror is the source of truth and commits the same
 * build. This script copies them over the registry build and stamps one marker per
 * file so `verify-patches` can assert the install did not silently revert.
 *
 * The tree is `prebuilt/<pkg>/<path inside that package's dist>`, deliberately not
 * `dist/`: the repository's .gitignore drops every `dist/`, and a vendored file that
 * git does not track is a build that only works on the machine that built it.
 *
 * One patch, several targets: the manifest carries a single entry with a `targets`
 * list because all of these files are installed by this one script for one concern
 * (own the source, stop rewriting dist by hand). `verify-patches` asserts the marker
 * in every listed target.
 *
 * Why copy instead of `file:` dependencies: the remaining managed patches still
 * rewrite the same dist trees, so switching the dependency source is a separate
 * migration. Until then this keeps the fixed files reproducible across `yarn install`.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const MARKER = '/* [patched:vendor-source-build] */'
const VENDOR = 'vendor/open-mercato/prebuilt'

const FILES = [
  'ui/utils/format-locale.js',
  'ui/utils/format.js',
  'ui/backend/DataTable.js',
  'core/modules/sales/components/documents/SalesDocumentsTable.js',
  'core/modules/sales/commands/documents.js',
  'core/modules/dictionaries/commands/factory.js',
  'core/modules/sales/api/quotes/convert/route.js',
  'core/modules/sales/api/quotes/send/route.js',
  'core/modules/customers/lib/customFieldOptionLabel.js',
  'core/modules/customers/backend/customers/companies/page.js',
  'core/modules/customers/backend/customers/people/page.js',
  'core/modules/customers/backend/customers/deals/page.js',
  'core/modules/communication_channels/subscribers/outbound-bridge.js',
]

/**
 * Content guards: a rebuild that lost the fix must fail here instead of shipping.
 * Cheap assertions on the compiled output, not a substitute for the runtime checks.
 */
const MUST_CONTAIN = {
  'ui/backend/DataTable.js': ['"aria-sort"'],
  'ui/utils/format-locale.js': ['setFormatLocale'],
  'core/modules/sales/commands/documents.js': ['convertNotAccepted'],
  'core/modules/customers/lib/customFieldOptionLabel.js': ['resolveCustomFieldOptionLabel'],
  'core/modules/customers/backend/customers/companies/page.js': ['list.error.network'],
  'core/modules/communication_channels/subscribers/outbound-bridge.js': ['ownership_rejected'],
}

let failed = 0
for (const relative of FILES) {
  const [pkg, ...rest] = relative.split('/')
  const from = path.join(VENDOR, relative)
  const dest = path.resolve(root, `node_modules/@open-mercato/${pkg}/dist/${rest.join('/')}`)
  const src = path.resolve(root, from)
  if (!fs.existsSync(src)) {
    console.error(`[patches] vendor-source-build: missing ${from}`)
    failed++
    continue
  }
  const vendored = fs.readFileSync(src, 'utf8')
  const guardMiss = (MUST_CONTAIN[relative] || []).filter((needle) => !vendored.includes(needle))
  if (guardMiss.length) {
    console.error(`[patches] vendor-source-build: ${from} lost ${guardMiss.join(', ')} — rebuild it from the mirror`)
    failed++
    continue
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const body = vendored.replace(/^\/\* \[patched:[a-z-]+ \*\/\n/, '')
  fs.writeFileSync(dest, `${MARKER}\n${body}`)
  console.log(`[patches] vendor-source-build: ${path.relative(root, dest)}`)
}

if (failed > 0) process.exit(1)
