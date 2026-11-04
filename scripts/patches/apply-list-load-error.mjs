#!/usr/bin/env node
/**
 * Managed patch: surface list load failures instead of showing an empty table (T11).
 *
 * The customers lists catch a failed fetch, raise a toast, and leave `rows` at
 * its previous value — so the table reads as "no data". Users cannot tell a
 * broken backend from an empty database.
 *
 * This patch records the failure in component state and passes it to DataTable
 * as `error`, which renders the alert branch. The toast is kept (it is transient
 * feedback), the table now also stays in a failed state until a reload succeeds.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:list-load-error] */'
const TARGETS = [
  'node_modules/@open-mercato/core/dist/modules/customers/backend/customers/companies/page.js',
  'node_modules/@open-mercato/core/dist/modules/customers/backend/customers/people/page.js',
]

const STATE_ANCHOR = 'const [isLoading, setIsLoading] = React.useState(true);'
const STATE_NEW = `${STATE_ANCHOR}
  const [loadError, setLoadError] = React.useState(null); ${MARKER}`

const OK_ANCHOR = `          flash(message, "error");
          if (!cancelled) setCacheStatus(null);
          return;`
const OK_NEW = `          flash(message, "error");
          if (!cancelled) setLoadError(message);
          if (!cancelled) setCacheStatus(null);
          return;`


const SUCCESS_ANCHOR = '        setCacheStatus(call.cacheStatus ?? null);'
const SUCCESS_NEW = `        setCacheStatus(call.cacheStatus ?? null);
        setLoadError(null);`

const PROPS_ANCHOR = '          isLoading\n        }'
const PROPS_NEW = `          isLoading,
          error: loadError
        }`

let applied = 0
for (const target of TARGETS) {
  const file = path.resolve(process.cwd(), target)
  if (!fs.existsSync(file)) { console.log(`[patch:list-load-error] missing ${target}`); continue }
  let source = fs.readFileSync(file, 'utf8')
  if (source.includes(MARKER)) { console.log(`[patch:list-load-error] ${path.basename(path.dirname(target))} already applied`); continue }

  for (const [from, to] of [[STATE_ANCHOR, STATE_NEW], [OK_ANCHOR, OK_NEW], [SUCCESS_ANCHOR, SUCCESS_NEW], [PROPS_ANCHOR, PROPS_NEW]]) {
    if (!source.includes(from)) {
      console.error(`[patch:list-load-error] anchor not found in ${target}: ${from.slice(0, 60)}`)
      process.exit(1)
    }
    source = source.replace(from, to)
  }

  // The catch branch differs per page (its i18n key varies), so insert by
  // position: right after the flash() call inside `catch (err) {`.
  const catchIdx = source.indexOf('} catch (err) {')
  if (catchIdx === -1) {
    console.error(`[patch:list-load-error] catch block not found in ${target}`)
    process.exit(1)
  }
  const flashIdx = source.indexOf('flash(message, "error");', catchIdx)
  if (flashIdx === -1) {
    console.error(`[patch:list-load-error] catch flash not found in ${target}`)
    process.exit(1)
  }
  const insertAt = flashIdx + 'flash(message, "error");'.length
  source = source.slice(0, insertAt) + '\n          setLoadError(message);' + source.slice(insertAt)

  fs.writeFileSync(file, source)
  applied++
  console.log(`[patch:list-load-error] patched ${path.basename(path.dirname(target))}/page.js`)
}
console.log(`[patch:list-load-error] done: ${applied} file(s)`)
