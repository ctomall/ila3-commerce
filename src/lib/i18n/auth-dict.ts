/**
 * Dictionary trimming for the unauthenticated shell.
 *
 * The root layout hands the *entire* merged dictionary to the client provider.
 * On /login that is 13.5k keys / ~1.5 MB of RSC payload for a page that needs a
 * few hundred, and it costs every visitor a large download over the tunnel.
 *
 * The backend must keep the full dictionary (module pages translate heavily),
 * so trimming is scoped to the auth routes only, chosen from the pathname the
 * middleware already publishes as `x-next-url`.
 */
import type { Dict } from '@open-mercato/shared/lib/i18n/context'

/** Route prefixes that render the unauthenticated shell. */
const AUTH_ROUTE_PREFIXES = ['/login', '/start', '/reset', '/forgot-password', '/verify', '/register']

/**
 * Namespaces the auth shell actually uses: the frame (`appShell`, `ui`,
 * `common`), the auth flow itself, plus generic error/validation copy.
 * Everything module-specific is dropped.
 */
const AUTH_NAMESPACES = new Set(['auth', 'common', 'ui', 'appShell', 'errors', 'validation'])

export function isAuthRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return AUTH_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function trimDictionaryForAuthRoute(dict: Dict): Dict {
  const trimmed: Dict = {}
  for (const [key, value] of Object.entries(dict)) {
    const dot = key.indexOf('.')
    const namespace = dot === -1 ? key : key.slice(0, dot)
    if (AUTH_NAMESPACES.has(namespace)) trimmed[key] = value
  }
  return trimmed
}
