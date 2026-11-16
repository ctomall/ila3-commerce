import type { Workspace } from './workspaces'
export type NavigationPreference = { recentWorkspace: string | null; favorites: string[] }
export const EMPTY_NAVIGATION_PREFERENCE: NavigationPreference = { recentWorkspace: null, favorites: [] }
export function navigationPreferenceKey(user: string, tenant: string | null, organization: string | null): string {
  return `crm:navigation:v1:${[user, tenant ?? '', organization ?? ''].map(encodeURIComponent).join(':')}`
}
export function isNavigationPreference(value: unknown): value is NavigationPreference {
  if (!value || typeof value !== 'object') return false
  const candidate = value as NavigationPreference
  return (candidate.recentWorkspace === null || typeof candidate.recentWorkspace === 'string') &&
    Array.isArray(candidate.favorites) && candidate.favorites.length <= 100 && candidate.favorites.every(href => typeof href === 'string' && href.length <= 2048)
}
/** Preferences are references, never an alternate source of permissions or labels. */
export function sanitizeNavigationPreference(value: NavigationPreference, spaces: readonly Workspace[], otherAuthorizedHrefs: readonly string[] = []): NavigationPreference {
  const allowed = new Set([...spaces.flatMap(space => space.groups.flatMap(group => group.items.map(item => item.href))), ...otherAuthorizedHrefs])
  return {
    recentWorkspace: spaces.some(space => space.id === value.recentWorkspace) ? value.recentWorkspace : null,
    favorites: [...new Set(value.favorites)].filter(href => allowed.has(href)).slice(0,100),
  }
}
