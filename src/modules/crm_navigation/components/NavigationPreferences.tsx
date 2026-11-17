"use client"
import * as React from 'react'
import { usePathname } from 'next/navigation'
import { useBackendChrome } from '@open-mercato/ui/backend/BackendChromeProvider'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { readVersionedPreference, writeVersionedPreference } from '@open-mercato/shared/lib/browser/versionedPreference'
import { readCrmCatalog } from '@/nav/crm-navigation'
import { buildWorkspaces, selectWorkspace } from '@/nav/workspaces'
import { EMPTY_NAVIGATION_PREFERENCE, isNavigationPreference, navigationPreferenceKey, sanitizeNavigationPreference, type NavigationPreference } from '@/nav/workspace-preferences'

type Value = { preference: NavigationPreference; toggleFavorite: (href: string) => void }
const Context = React.createContext<Value>({ preference: EMPTY_NAVIGATION_PREFERENCE, toggleFavorite: () => {} })
export function useNavigationPreferences() { return React.useContext(Context) }

type Scope = { userId: string; tenantId: string | null; organizationId: string | null }
type ServerPreference = { favorites: string[]; recentWorkspace: string | null; selectedPreset?: string | null }
type LocalPreference = NavigationPreference & { savedAt?: number }

function isServerPreference(value: unknown): value is ServerPreference {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return Array.isArray(record.favorites)
    && record.favorites.every((entry) => typeof entry === 'string')
    && (record.recentWorkspace === null || typeof record.recentWorkspace === 'string')
}

export function NavigationPreferences({ userId, tenantId, organizationId, children }: Scope & { children: React.ReactNode }) {
  const { payload } = useBackendChrome()
  const pathname = usePathname()
  const catalog = readCrmCatalog(payload)
  // The chrome payload follows organization-switch events; layout props may be stale.
  const serverScope = (payload as unknown as { navigationPreferenceScope?: Scope | null } | null)?.navigationPreferenceScope
  const scopeVerified = !!serverScope && serverScope.userId === userId
  const effectiveOrganization = serverScope ? serverScope.organizationId : organizationId
  const key = navigationPreferenceKey(userId, serverScope ? serverScope.tenantId : tenantId, effectiveOrganization)
  const spaces = React.useMemo(() => buildWorkspaces(catalog?.groups ?? []), [catalog])
  const other = React.useMemo(() => [
    ...(catalog?.personal.items.map((item) => item.href) ?? []),
    ...(catalog?.manage.categories.flatMap((category) => category.items.map((item) => item.href)) ?? []),
  ], [catalog])
  const [saved, setSaved] = React.useState<{ key: string; value: NavigationPreference } | null>(null)
  const [remoteChecked, setRemoteChecked] = React.useState(false)

  // Local storage is the cache; the server copy wins when it can be read, because
  // it is the only one that survives a different browser.
  React.useEffect(() => {
    let cancelled = false
    setRemoteChecked(false)
    if (!scopeVerified) {
      setSaved({ key, value: EMPTY_NAVIGATION_PREFERENCE })
      setRemoteChecked(true)
      return
    }
    const local = readVersionedPreference(key, 1, isNavigationPreference, EMPTY_NAVIGATION_PREFERENCE) as LocalPreference
    setSaved({ key, value: local })
    void apiCall<{ preference: unknown; updatedAt: string | null }>('/api/workspace_settings/preferences', { method: 'GET' })
      .then((result) => {
        if (cancelled) return
        const remote = result.ok ? result.result?.preference : null
        const remoteAt = result.ok ? result.result?.updatedAt ?? null : null
        const serverKnown = isServerPreference(remote) && remoteAt !== null
        // Whichever copy was written last wins: without this, a favorite toggled
        // just before the read finished was overwritten by the older server row.
        const localNewer = Boolean(local.savedAt && remoteAt && local.savedAt > Date.parse(remoteAt))
        if (serverKnown && !localNewer) {
          const value = { favorites: remote!.favorites, recentWorkspace: remote!.recentWorkspace }
          setSaved({ key, value })
          writeVersionedPreference(key, 1, { ...value, savedAt: Date.parse(remoteAt!) })
        } else if (local.favorites.length > 0 || local.recentWorkspace) {
          // No server copy yet (or this browser is newer): publish what we have.
          void apiCall('/api/workspace_settings/preferences', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ favorites: local.favorites, recentWorkspace: local.recentWorkspace }),
          })
        }
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setRemoteChecked(true) })
    return () => { cancelled = true }
  }, [key, scopeVerified])

  const preference = React.useMemo(
    () => sanitizeNavigationPreference(saved?.key === key ? saved.value : EMPTY_NAVIGATION_PREFERENCE, spaces, other),
    [saved, key, spaces, other],
  )

  const commit = React.useCallback((value: NavigationPreference) => {
    const next = sanitizeNavigationPreference(value, spaces, other)
    setSaved({ key, value: next })
    if (!scopeVerified) return
    writeVersionedPreference(key, 1, { ...next, savedAt: Date.now() })
    // Best effort: the local copy stays authoritative for this browser.
    void apiCall('/api/workspace_settings/preferences', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    }).catch(() => undefined)
  }, [key, spaces, other, scopeVerified])

  React.useEffect(() => {
    if (!catalog || catalog.error || saved?.key !== key || !remoteChecked) return
    const active = selectWorkspace(spaces, pathname ?? '')
    if (active && active.id !== 'home' && active.id !== preference.recentWorkspace) {
      commit({ ...preference, recentWorkspace: active.id })
    }
  }, [catalog, saved, key, spaces, pathname, preference, commit, remoteChecked])

  const toggleFavorite = React.useCallback((href: string) => {
    commit({
      ...preference,
      favorites: preference.favorites.includes(href)
        ? preference.favorites.filter((entry) => entry !== href)
        : [...preference.favorites, href],
    })
  }, [commit, preference])

  return <Context.Provider value={{ preference, toggleFavorite }}>{children}</Context.Provider>
}
