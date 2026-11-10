'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useBackendChrome } from '@open-mercato/ui/backend/BackendChromeProvider'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { readCrmCatalog, selectActiveGroup, type CrmNavItem } from '@/nav/crm-navigation'

function tabClass(active: boolean) {
  return [
    'inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium transition-colors',
    'focus:outline-none focus-visible:shadow-focus',
    active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  ].join(' ')
}

function activeHref(items: CrmNavItem[], pathname: string): string | null {
  let best: string | null = null
  for (const item of items) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.length) best = item.href
    }
  }
  return best
}

/**
 * Content-area second level.
 *
 * The rail carries only the app-level groups. This strip renders the declared
 * entries of the current group, so a page's own module metadata decides what is
 * here. It never rebuilds a nested tree and it disappears on one-entry groups.
 */
function ContentNav() {
  const t = useT()
  const pathname = usePathname() ?? ''
  const chrome = useBackendChrome()
  const catalog = readCrmCatalog(chrome.payload)
  const group = React.useMemo(() => selectActiveGroup(catalog, pathname), [catalog, pathname])

  if (!catalog || !group || group.items.length < 2) return null

  const current = activeHref(group.items, pathname)
  return (
    <nav
      aria-label={t('crmNav.contentAria', '当前分区入口')}
      data-crm-content-nav=""
      data-crm-content-group={group.id}
      className="mb-4 border-b pb-3"
    >
      <div className="flex flex-wrap items-center gap-1">
        {group.items.map((item) => {
          const active = current === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={tabClass(active)}
              data-crm-content-item={item.href}
              data-crm-content-active={active ? 'true' : undefined}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

const widget = {
  metadata: {
    id: 'crm_navigation.injection.content-nav',
    title: '内容区二级导航',
    description: 'Declared entries of the current top-level group; no per-route owner table',
    enabled: true,
    priority: 20,
  },
  Widget: ContentNav,
}

export default widget
