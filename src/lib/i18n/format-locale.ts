/**
 * Make bottom-of-the-stack formatters follow the document language.
 *
 * `packages/ui` and `packages/core` format money and dates inline — `new
 * Intl.NumberFormat(void 0, …)`, `date.toLocaleString()`, `toLocaleDateString()` — and
 * about 200 compiled files do it without a locale, so `Intl` falls back to the runtime
 * default. A deployment running with `OM_FORCE_LOCALE=zh` therefore rendered `$680.00`
 * and `11/13/2026` on every list.
 *
 * Passing a locale at ~200 call sites is not a patch anyone should maintain, so the
 * default is installed once, here: the wrappers only fill in a locale when the caller
 * omitted it, and delegate to the original implementation in every other case
 * (`resolvedOptions`, `formatToParts`, `supportedLocalesOf`, options handling).
 *
 * This is an interim measure on the way to the vendored source build: once the UI and
 * core packages are built from the mirror, the same rule belongs in their `format.ts`
 * helpers and this shim should be deleted. It is intentionally narrow — it never
 * overrides an explicit locale, so a page that wants `en-US` still gets `en-US`.
 */

type LocaleGetter = () => string | undefined

let installed = false
let currentLocale: LocaleGetter = () => undefined
const originals: { numberFormat?: typeof Intl.NumberFormat; dateTimeFormat?: typeof Intl.DateTimeFormat; dateMethods: Record<string, ((...args: unknown[]) => string) | undefined> } = { dateMethods: {} }

function resolveLocale(): string | undefined {
  try {
    return currentLocale()
  } catch {
    return undefined
  }
}

function wrapIntlConstructor(Original: new (locales?: unknown, options?: unknown) => Intl.NumberFormat | Intl.DateTimeFormat): unknown {
  function Patched(this: unknown, locales?: unknown, options?: unknown) {
    return new Original(locales === undefined ? resolveLocale() : locales, options)
  }
  Patched.prototype = Original.prototype
  Patched.supportedLocalesOf = (Original as unknown as { supportedLocalesOf: unknown }).supportedLocalesOf
  return Patched
}

function wrapDateMethod(name: 'toLocaleString' | 'toLocaleDateString' | 'toLocaleTimeString') {
  const target = Date.prototype as unknown as Record<string, (...args: unknown[]) => string>
  const original = target[name]
  if (typeof original !== 'function') return
  originals.dateMethods[name] = originals.dateMethods[name] ?? original
  target[name] = function patched(this: Date, locales?: unknown, options?: unknown) {
    return original.call(this, locales === undefined ? resolveLocale() : locales, options)
  }
}

/**
 * Installs the wrappers once. Repeated calls only swap the locale source, which is what
 * the server does per request and the client does on hydration.
 */
export function installFormatLocale(getLocale: LocaleGetter): void {
  currentLocale = getLocale
  if (installed) return
  installed = true

  originals.numberFormat = originals.numberFormat ?? Intl.NumberFormat
  originals.dateTimeFormat = originals.dateTimeFormat ?? Intl.DateTimeFormat
  Intl.NumberFormat = wrapIntlConstructor(
    Intl.NumberFormat as unknown as new (locales?: unknown, options?: unknown) => Intl.NumberFormat,
  ) as typeof Intl.NumberFormat
  Intl.DateTimeFormat = wrapIntlConstructor(
    Intl.DateTimeFormat as unknown as new (locales?: unknown, options?: unknown) => Intl.DateTimeFormat,
  ) as typeof Intl.DateTimeFormat
  wrapDateMethod('toLocaleString')
  wrapDateMethod('toLocaleDateString')
  wrapDateMethod('toLocaleTimeString')
}

/** Locale for this environment: the server passes its resolved config locale, the browser reads `<html lang>`. */
export function browserLocale(): string | undefined {
  if (typeof document === 'undefined') return undefined
  return document.documentElement.lang || undefined
}

/** Test-only: restore the untouched intrinsics. */
export function resetFormatLocaleForTests(): void {
  if (originals.numberFormat) Intl.NumberFormat = originals.numberFormat
  if (originals.dateTimeFormat) Intl.DateTimeFormat = originals.dateTimeFormat
  const target = Date.prototype as unknown as Record<string, unknown>
  for (const [name, original] of Object.entries(originals.dateMethods)) {
    if (original) target[name] = original
  }
  originals.dateMethods = {}
  originals.numberFormat = undefined
  originals.dateTimeFormat = undefined
  installed = false
  currentLocale = () => undefined
}
