"use client"
import * as React from 'react'
import { usePathname } from 'next/navigation'
import { subscribeOrganizationScopeChanged, getCurrentOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/organizationEvents'
import { readVersionedPreference } from '@open-mercato/shared/lib/browser/versionedPreference'
import { AppShell, type AppShellProps } from '@open-mercato/ui/backend/AppShell'
import { isNavigationPreference, navigationPreferenceKey } from '@/nav/workspace-preferences'

type ShellScope = { userId?: string | null; tenantId: string | null; organizationId: string | null }

/**
 * Read the workspace the person was last in. Server renders have no storage, and
 * the value is only a projection hint: the route re-validates it against the
 * caller's authorized catalogue before using it.
 */
function readRecentWorkspace(scope: ShellScope | undefined): string | null {
  if (!scope?.userId || typeof window === 'undefined') return null
  try {
    const preference = readVersionedPreference(
      navigationPreferenceKey(scope.userId, scope.tenantId, scope.organizationId),
      1,
      isNavigationPreference,
      { recentWorkspace: null, favorites: [] },
    )
    return preference.recentWorkspace
  } catch {
    return null
  }
}

/** Preserve the installed shell; only select its public navigation data source. */
export function WorkspaceShell({ initialScope, ...props }: AppShellProps & { initialScope?: ShellScope }) {
  const pathname = usePathname()
  const [scopeVersion, setScopeVersion] = React.useState(getCurrentOrganizationScopeVersion)
  const previousScope = React.useRef(initialScope)
  React.useEffect(() => subscribeOrganizationScopeChanged(next => {
    const previous = previousScope.current
    previousScope.current = next
    if (previous && previous.tenantId === next.tenantId && previous.organizationId === next.organizationId) return
    setScopeVersion(getCurrentOrganizationScopeVersion())
  }), [])
  const query = new URLSearchParams({
    chrome: '1',
    path: pathname ?? '/backend',
    scope: String(scopeVersion),
  })
  const recent = readRecentWorkspace(initialScope)
  if (recent) query.set('workspace', recent)
  return <AppShell key={scopeVersion} {...props} adminNavApi={`/api/crm_navigation/navigation?${query.toString()}`} />
}
