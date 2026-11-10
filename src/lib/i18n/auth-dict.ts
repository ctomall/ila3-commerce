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
// startPage is public and rendered on /start, which is an auth-suffix route: without it the
// whole welcome block fell back to its English defaults on a Chinese deployment.
const AUTH_NAMESPACES = new Set(['auth', 'common', 'ui', 'appShell', 'notices', 'errors', 'validation', 'startPage'])

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
  'organizationSwitcher', 'notifications', 'portal', 'search', 'ai_assistant', 'startPage',
]

/**
 * Shell namespaces that are far too large to ship whole.
 *
 * `ai_assistant` and `search` are 38 KB and 16 KB of dictionary each, serialized
 * twice (root + backend provider), so allowing them wholesale added ~172 KB to
 * every trimmed page for a handful of aria-labels. Only the keys the shell
 * chrome renders are kept.
 */
const SHELL_KEY_ALLOWLIST: Record<string, string[]> = {
  search: ['search.dialog.actions.'],
  ai_assistant: ['ai_assistant.launcher.'],
}

/**
 * Per-area extra namespaces for `/backend/<area>...`.
 *
 * Deliberately conservative: an area missing from this map keeps the full
 * dictionary. A wrong entry shows English fallback copy, which is why every
 * addition is verified with the DOM residue scan before shipping.
 */
const AREA_NAMESPACES: Record<string, string[]> = {
  // The customer detail renders the file/activity/change-log/warranty tabs and the
  // document + workflow cards, so trimming to customers+sales alone left their
  // labels as raw keys ("documents.relatedDocuments.title" etc.) on the page a
  // salesperson actually works in.
  // The compose dialog opened from a customer renders the attachment picker
  // (attachments.library.upload.choose), so the area needs the attachments namespace.
  customers: ['customers', 'sales', 'documents', 'workflows', 'warranty_claims', 'audit_logs', 'messages', 'attachments'],
  sales: ['sales', 'customers'],
  // Catalog product lists render the EUDR injection column, whose header is a raw
  // dictionary key (eudr.productColumn.header) — without this it reached the screen.
  catalog: ['catalog', 'currencies', 'sales', 'eudr'],
  wms: ['wms', 'catalog'],
  checkout: ['checkout', 'sales', 'catalog'],
  staff: ['staff', 'resources'],
  workflows: ['workflows', 'business_rules'],
  integrations: ['integrations'],
  // The message table header renders communication_channels.columns.*, and the composer
  // renders the attachment picker, so both namespaces ship with this area.
  messages: ['messages', 'communication_channels', 'attachments'],
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
    if (!allowed.has(namespace)) continue
    const prefixes = SHELL_KEY_ALLOWLIST[namespace]
    if (prefixes && !prefixes.some((prefix) => key.startsWith(prefix))) continue
    trimmed[key] = value
  }
  return trimmed
}

/** Namespaces the auth shell keeps (kept here so both trims share one list). */
export function authNamespaces(): string[] {
  return [...AUTH_NAMESPACES]
}
