'use client'
import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings } from 'lucide-react'
import { useSidebarCollapse } from '@open-mercato/ui/backend/AppShell'
import { useBackendChrome } from '@open-mercato/ui/backend/BackendChromeProvider'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { readCrmCatalog } from '@/nav/crm-navigation'

/**
 * The management hub, pinned outside the scrolling workspace list.
 *
 * It renders into the shell's sticky sidebar footer next to the account entry,
 * so it stays visible no matter how many workspaces a person can see. The entry
 * only exists when the authorized catalogue still carries the hub: this is a
 * shortcut, never a grant.
 */
export function SidebarFixedLinks({ variant = 'footer' }: { variant?: 'footer' | 'mobile' }) {
  const t = useT()
  const pathname = usePathname()
  const { payload } = useBackendChrome()
  const { collapsed } = useSidebarCollapse()
  const catalog = readCrmCatalog(payload)
  const manage = catalog?.utility.find((entry) => entry.id === 'manage')
  if (!catalog || catalog.error || !manage) return null

  const compact = variant === 'footer' && collapsed
  const label = t('crmNav.utility.manage', manage.label || '管理中心')
  const active = pathname === manage.href || (pathname?.startsWith(`${manage.href}/`) ?? false)

  return (
    <nav aria-label={t('crmNav.fixed.aria', '固定入口')} className={variant === 'footer' ? 'px-2' : ''}>
      <Link
        href={manage.href}
        data-sidebar-fixed-link="manage"
        aria-current={active ? 'page' : undefined}
        aria-label={compact ? label : undefined}
        title={compact ? label : undefined}
        className={`relative mb-1 inline-flex items-center rounded-lg text-sm font-medium transition-colors ${
          compact ? 'h-9 w-full justify-center' : 'w-full gap-2 px-2 py-2'
        } ${active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'} focus:outline-none focus-visible:shadow-focus`}
      >
        {active ? (
          <span aria-hidden className={`absolute ${compact ? 'left-0' : 'left-0'} top-2 h-5 w-1 rounded-r bg-foreground`} />
        ) : null}
        <Settings className="size-4 shrink-0" aria-hidden />
        {compact ? null : <span className="truncate">{label}</span>}
      </Link>
    </nav>
  )
}
