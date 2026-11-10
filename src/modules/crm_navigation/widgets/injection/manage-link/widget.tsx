'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings } from 'lucide-react'
import { useBackendChrome } from '@open-mercato/ui/backend/BackendChromeProvider'
import { useSidebarCollapse } from '@open-mercato/ui/backend/AppShell'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { readCrmCatalog } from '@/nav/crm-navigation'

/** Management centre, pinned in the rail footer above the account entry. */
function ManageLink() {
  const t = useT()
  const pathname = usePathname() ?? ''
  const { collapsed } = useSidebarCollapse()
  const { payload } = useBackendChrome()
  const catalog = readCrmCatalog(payload)
  const active = pathname === '/backend/manage' || pathname.startsWith('/backend/manage/')
  const label = t('crmNav.utility.manage', '管理中心')

  // No static fallback: the entry exists only when the authorized catalogue
  // says the caller may open it. Loading and failure render nothing here; the
  // main rail owns their error affordance.
  if (!catalog || !catalog.utility.some((item) => item.id === 'manage')) return null

  return (
    <Link
      href="/backend/manage"
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      data-crm-utility="manage"
      className={[
        'relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        collapsed ? 'justify-center px-0' : '',
        'focus:outline-none focus-visible:shadow-focus',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      ].join(' ')}
    >
      <Settings className="size-4 shrink-0" aria-hidden />
      {collapsed ? null : <span className="truncate">{label}</span>}
      {active ? (
        <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-foreground" />
      ) : null}
    </Link>
  )
}

const widget = {
  metadata: {
    id: 'crm_navigation.injection.manage-link',
    title: '侧栏底部：管理中心',
    description: 'Management-centre entry pinned above the account footer',
    enabled: true,
    priority: 20,
  },
  Widget: ManageLink,
}

export default widget
