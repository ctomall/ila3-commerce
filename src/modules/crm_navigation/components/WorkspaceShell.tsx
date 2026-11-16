"use client"
import * as React from 'react'
import { usePathname } from 'next/navigation'
import { subscribeOrganizationScopeChanged, getCurrentOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/organizationEvents'
import { AppShell, type AppShellProps } from '@open-mercato/ui/backend/AppShell'

/** Preserve the installed shell; only select its public navigation data source. */
export function WorkspaceShell({ initialScope, ...props }: AppShellProps & { initialScope?: {tenantId:string|null;organizationId:string|null} }) {
  const pathname = usePathname()
  const [scopeVersion, setScopeVersion] = React.useState(getCurrentOrganizationScopeVersion)
  const previousScope = React.useRef(initialScope)
  React.useEffect(() => subscribeOrganizationScopeChanged(next => {
    const previous = previousScope.current
    previousScope.current = next
    if (previous && previous.tenantId === next.tenantId && previous.organizationId === next.organizationId) return
    setScopeVersion(getCurrentOrganizationScopeVersion())
  }), [])
  const api = `/api/crm_navigation/navigation?chrome=1&path=${encodeURIComponent(pathname ?? '/backend')}&scope=${scopeVersion}`
  return <AppShell key={scopeVersion} {...props} adminNavApi={api} />
}
