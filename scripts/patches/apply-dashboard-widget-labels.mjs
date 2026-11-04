#!/usr/bin/env node
/**
 * Managed patch: localize the dashboard "recent" widgets.
 *
 * Two defects, both in the same prebuilt widget clients:
 *
 * 1. `formatDate(value, locale)` calls `toLocaleString(locale ?? void 0, ...)`.
 *    `locale` starts as `undefined`, so the runtime default wins — in a browser
 *    that is en-US, which is why the Chinese dashboard still showed
 *    "Nov 3, 2026, 3:10 PM". Fall back to the document language instead.
 *
 * 2. The new-deals widget renders `item.status` verbatim, so the dashboard shows
 *    `open` / `win` / `lost` / `in_progress`. The dictionary already carries
 *    `customers.deals.kanban.quickDeal.status.<value>`, so the patch routes the
 *    value through `t()` with the raw code as fallback — no new translations and
 *    no second source of truth.
 *
 * Idempotent. Run before `yarn build`; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:dashboard-locale] */'
const STATUS_MARKER = '/* [patched:dashboard-status] */'

const BASE = 'node_modules/@open-mercato/core/dist/modules/customers/widgets/dashboard'
const DATE_TARGETS = [`${BASE}/new-deals/widget.client.js`, `${BASE}/new-customers/widget.client.js`]

const DATE_OLD = 'return date.toLocaleString(locale ?? void 0, { dateStyle: "medium", timeStyle: "short" });'
const DATE_NEW = `return date.toLocaleString(locale ?? (typeof document !== "undefined" && document.documentElement.lang ? document.documentElement.lang : void 0), { dateStyle: "medium", timeStyle: "short" }); ${MARKER}`

const LOCALE_INIT_OLD = 'setLocale(navigator.language);'
const LOCALE_INIT_MARKER = '/* [patched:dashboard-locale-init] */'
const LOCALE_INIT_NEW = `setLocale(document.documentElement.lang || navigator.language); ${LOCALE_INIT_MARKER}`

const STATUS_TARGET = `${BASE}/new-deals/widget.client.js`
const STATUS_OLD = 'children: item.status ?? t("customers.widgets.common.unknown")'
const STATUS_NEW = `children: item.status ? t(\`customers.deals.kanban.quickDeal.status.\${item.status}\`, item.status) : t("customers.widgets.common.unknown") ${STATUS_MARKER}`

const root = process.cwd()
let patched = 0
let already = 0
let skipped = 0

function patchDate(relative) {
  const file = path.resolve(root, relative)
  if (!fs.existsSync(file)) { skipped++; return }
  const source = fs.readFileSync(file, 'utf8')
  if (source.includes(MARKER)) { already++; return }
  if (!source.includes(DATE_OLD)) { skipped++; return }
  fs.writeFileSync(file, source.replace(DATE_OLD, DATE_NEW))
  patched++
  console.log(`[patch:dashboard] date locale -> ${path.basename(path.dirname(relative))}`)
}

function patchLocaleInit(relative) {
  const file = path.resolve(root, relative)
  if (!fs.existsSync(file)) { skipped++; return }
  const source = fs.readFileSync(file, 'utf8')
  if (source.includes(LOCALE_INIT_MARKER)) { already++; return }
  if (!source.includes(LOCALE_INIT_OLD)) { skipped++; return }
  fs.writeFileSync(file, source.replace(LOCALE_INIT_OLD, LOCALE_INIT_NEW))
  patched++
  console.log(`[patch:dashboard] locale init -> ${path.basename(path.dirname(relative))}`)
}

function patchStatus(relative) {
  const file = path.resolve(root, relative)
  if (!fs.existsSync(file)) { skipped++; return }
  const source = fs.readFileSync(file, 'utf8')
  if (source.includes(STATUS_MARKER)) { already++; return }
  if (!source.includes(STATUS_OLD)) { skipped++; return }
  fs.writeFileSync(file, source.replace(STATUS_OLD, STATUS_NEW))
  patched++
  console.log('[patch:dashboard] deal status label -> new-deals')
}

for (const target of DATE_TARGETS) {
  patchDate(target)
  patchLocaleInit(target)
}
patchStatus(STATUS_TARGET)

console.log(`[patch:dashboard] done: patched=${patched} already=${already} skipped=${skipped}`)
