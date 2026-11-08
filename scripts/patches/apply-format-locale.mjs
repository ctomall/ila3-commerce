#!/usr/bin/env node
/**
 * Managed patch: make money and dates follow the document language.
 *
 * `formatCurrency(value, currency, locale)` and `formatDate(value, locale)` accept a
 * locale, and about thirty call sites omit it. `Intl` then falls back to the runtime
 * default, so a deployment running with OM_FORCE_LOCALE=zh still printed "$680.00" and
 * "11/13/2026" because the browser was en-US.
 *
 * The page already carries the right value in <html lang>, so the formatter only has to
 * read it. One line per function makes every call site localised, which is why this
 * belongs in the mirror's packages/ui/src/utils/format.ts and not in thirty dist patches.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'

const MARKER = '/* [patched:format-locale] */'
const TARGET = 'node_modules/@open-mercato/ui/dist/utils/format.js'

const HELPERS = `${MARKER}
function resolveFormatLocale(locale) {
  if (locale) return locale;
  if (typeof document !== "undefined") {
    const lang = document.documentElement && document.documentElement.lang;
    if (lang) return lang;
  }
  return void 0;
}
`

const EDITS = [
  [
    'function formatCurrency(value, currency, locale) {\n',
    'function formatCurrency(value, currency, locale) {\n  locale = resolveFormatLocale(locale);\n',
  ],
  [
    'function formatDate(value, locale) {\n',
    'function formatDate(value, locale) {\n  locale = resolveFormatLocale(locale);\n',
  ],
]

const file = fs.readFileSync(TARGET, 'utf8')
if (file.includes(MARKER)) {
  console.log('[patches] format-locale: already applied')
  process.exit(0)
}

let next = HELPERS + file
for (const [from, to] of EDITS) {
  if (!next.includes(from)) {
    console.error(`[patches] format-locale: anchor not found: ${JSON.stringify(from.slice(0, 40))}`)
    process.exit(1)
  }
  next = next.replace(from, to)
}

fs.writeFileSync(TARGET, next)
console.log('[patches] format-locale: applied')
