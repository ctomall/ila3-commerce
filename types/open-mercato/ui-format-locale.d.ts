/**
 * Types for the source-built locale runtime shipped in vendor/open-mercato.
 *
 * The published @open-mercato/ui export map points its `types` condition at
 * package sources that the registry tarball does not carry, so this subpath has
 * no declaration of its own. Declaring it here keeps the call sites typed while
 * the dependency migration is in progress.
 */
declare module '@open-mercato/ui/utils/format-locale' {
  export function setFormatLocale(locale: string | undefined | null): void
  export function getFormatLocale(): string | undefined
  export function resolveFormatLocale(locale?: string | null): string | undefined
  export function resetFormatLocale(): void
}
