'use client'

import * as React from 'react'
import Link from 'next/link'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useSidebarCollapse } from '@open-mercato/ui/backend/AppShell'
import { useT } from '@open-mercato/shared/lib/i18n/context'

/**
 * Sidebar footer: account entry plus the collapse control.
 *
 * Injected into `backend:sidebar:footer` so the shell does not need a package
 * patch. The collapse state comes from the shell hook and the account name from
 * the caller's own identity endpoint.
 */
function SidebarFooter() {
  const t = useT()
  const { collapsed, setCollapsed } = useSidebarCollapse()
  const [email, setEmail] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    fetch('/api/settings_home/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.email === 'string') setEmail(data.email)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const initial = (email ?? '?').trim().charAt(0).toUpperCase()

  return (
    <div className="flex shrink-0 items-center gap-1 border-t px-2 py-2">
      <Link
        href="/backend/profile"
        aria-label={t('appShell.openUserCenter', '个人账户')}
        title={email ?? t('appShell.openUserCenter', '个人账户')}
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground transition-colors hover:bg-muted/80"
      >
        {initial}
      </Link>
      {collapsed ? null : (
        <span className="min-w-0 flex-1 truncate px-1 text-xs text-muted-foreground">
          {t('appShell.openUserCenter', '个人账户')}
        </span>
      )}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={t('appShell.toggleSidebar')}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:shadow-focus"
      >
        {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
      </button>
    </div>
  )
}

const widget = {
  metadata: {
    id: 'settings_home.injection.sidebar-footer',
    title: '侧栏底部：用户中心与折叠',
    description: 'Pinned sidebar footer with the account entry and the collapse control',
    enabled: true,
    priority: 100,
  },
  Widget: SidebarFooter,
}

export default widget
