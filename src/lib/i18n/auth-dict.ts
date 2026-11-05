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
const AUTH_NAMESPACES = new Set(['auth', 'common', 'ui', 'appShell', 'notices', 'errors', 'validation'])

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

// ---------------------------------------------------------------------------
// Backend routes
// ---------------------------------------------------------------------------

/**
 * Namespaces every backend screen needs: the frame, generic copy, and the
 * settings/labels shared by the app shell (menus, table chrome, dialogs).
 */
// Namespaces the app shell itself renders, not just the page: the top bar
// (search, AI launcher, notifications) and the org switcher live outside the
// routed content, so trimming them away made their aria-labels fall back to the
// key string on every trimmed route.
const SHELL_NAMESPACES = [
  'ui', 'common', 'appShell', 'auth', 'modules', 'settings', 'notices', 'errors', 'validation',
  'organizationSwitcher', 'notifications', 'portal', 'search', 'ai_assistant',
]

/**
 * Per-area extra namespaces for `/backend/<area>...`.
 *
 * Deliberately conservative: an area missing from this map keeps the full
 * dictionary. A wrong entry shows English fallback copy, which is why every
 * addition is verified with the DOM residue scan before shipping.
 */
const AREA_NAMESPACES: Record<string, string[]> = {
  customers: ['customers', 'sales'],
  sales: ['sales', 'customers'],
  catalog: ['catalog', 'currencies', 'sales'],
  wms: ['wms', 'catalog'],
  checkout: ['checkout', 'sales', 'catalog'],
  staff: ['staff', 'resources'],
  workflows: ['workflows', 'business_rules'],
  integrations: ['integrations'],
  messages: ['messages'],
  documents: ['documents', 'attachments'],
}

/** Extract the first segment after /backend. */
export function backendArea(pathname: string): string | null {
  if (!pathname.startsWith('/backend')) return null
  const rest = pathname.slice('/backend'.length)
  const segment = rest.split('/').filter(Boolean)[0]
  return segment ?? 'dashboard'
}

/**
 * Namespaces a backend route needs, or `null` when the route must keep the full
 * dictionary (settings/config screens fan out across every module's copy).
 */
export function namespacesForBackendRoute(pathname: string): string[] | null {
  const area = backendArea(pathname)
  if (!area) return null
  if (area === 'config' || area === 'settings' || area === 'profile') return null
  const extra = AREA_NAMESPACES[area]
  if (!extra) return null
  return [...SHELL_NAMESPACES, ...extra]
}

export function trimDictionaryToNamespaces(dict: Dict, namespaces: string[]): Dict {
  const allowed = new Set(namespaces)
  const trimmed: Dict = {}
  for (const [key, value] of Object.entries(dict)) {
    const dot = key.indexOf('.')
    const namespace = dot === -1 ? key : key.slice(0, dot)
    if (allowed.has(namespace)) trimmed[key] = value
  }
  return trimmed
}

/** Namespaces the auth shell keeps (kept here so both trims share one list). */
export function authNamespaces(): string[] {
  return [...AUTH_NAMESPACES]
}
