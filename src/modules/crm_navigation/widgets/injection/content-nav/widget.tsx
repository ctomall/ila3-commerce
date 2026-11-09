'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowUpRight } from 'lucide-react'
import { useBackendChrome } from '@open-mercato/ui/backend/BackendChromeProvider'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { readCrmCatalog, SCENE_MAP, type CrmCatalog } from '@/nav/crm-navigation'

/**
 * Content-area second level.
 *
 * The left rail only carries the five scenes. Tabs for the customer entities,
 * business categories and message views live here, directly above the page, so
 * they read as "what inside this scene" instead of nesting the rail. Detail
 * pages additionally get a small related-record strip; one of its links uses
 * the list's real `companyId` / `personId` filter, not a decorative query.
 */

function tabClass(active: boolean) {
  return [
    'inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium transition-colors',
    'focus:outline-none focus-visible:shadow-focus',
    active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  ].join(' ')
}

function pillClass(active = false) {
  return [
    'inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors',
    'focus:outline-none focus-visible:shadow-focus',
    active
      ? 'border-foreground/20 bg-muted text-foreground'
      : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
  ].join(' ')
}

function ContentNav() {
  const t = useT()
  const pathname = usePathname() ?? ''
  const chrome = useBackendChrome()
  const catalog = readCrmCatalog(chrome.payload)

  const detail = pathname.match(/^\/backend\/customers\/(companies|people|deals)\/([^/]+)$/)
  const isCustomers = pathname === '/backend/customers' || pathname.startsWith('/backend/customers/')
  const isBusiness = pathname === '/backend/business' || pathname.startsWith('/backend/business/')
  const authorized = React.useMemo(() => new Set(catalog?.authorized ?? []), [catalog])

  const allowed = React.useCallback(
    (href: string) => (catalog ? authorized.has(href) : true),
    [authorized, catalog],
  )

  if (detail) {
    const [, type, rawId] = detail
    const id = encodeURIComponent(decodeURIComponent(rawId))
    const related: Array<{ href: string; label: string }> = []
    if (type === 'companies') {
      related.push(
        { href: `/backend/customers/deals?companyId=${id}`, label: t('crmNav.related.deals', '关联商机') },
        { href: '/backend/customers/people', label: t('crmNav.related.allContacts', '全部联系人') },
        { href: '/backend/customer-tasks', label: t('crmNav.related.allTasks', '全部任务') },
      )
    } else if (type === 'people') {
      related.push(
        { href: `/backend/customers/deals?personId=${id}`, label: t('crmNav.related.deals', '关联商机') },
        { href: '/backend/customers/companies', label: t('crmNav.related.allCompanies', '全部公司') },
        { href: '/backend/customer-tasks', label: t('crmNav.related.allTasks', '全部任务') },
      )
    } else {
      related.push(
        { href: '/backend/customers/companies', label: t('crmNav.related.allCompanies', '全部公司') },
        { href: '/backend/customers/people', label: t('crmNav.related.allContacts', '全部联系人') },
        { href: '/backend/sales/quotes', label: t('crmNav.related.allQuotes', '全部报价') },
      )
    }
    return (
      <nav aria-label={t('crmNav.relatedAria', '关联对象')} className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">{t('crmNav.relatedLabel', '关联')}</span>
        {related.filter((link) => allowed(link.href.split('?')[0])).map((link) => (
          <Link key={link.href} href={link.href} className={pillClass()}>
            {link.label}
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        ))}
      </nav>
    )
  }

  if (isCustomers) {
    const tabs = catalog?.customers.tabs?.length ? catalog.customers.tabs : SCENE_MAP.customers.tabs
    const followup = catalog?.customers.followup ?? []
    const insights = catalog?.customers.insights ?? []
    return (
      <div className="mb-4 flex flex-col gap-2 border-b pb-3">
        <nav aria-label={t('crmNav.customers.aria', '客户视图')} className="flex flex-wrap gap-1">
          {tabs
            .filter((tab) => allowed(tab.href))
            .map((tab) => {
              const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
              return (
                <Link key={tab.id} href={tab.href} aria-current={active ? 'page' : undefined} className={tabClass(active)}>
                  {t(`crmNav.customers.tab.${tab.id}`, tab.label)}
                </Link>
              )
            })}
        </nav>
        {followup.length > 0 || insights.length > 0 ? (
          <nav aria-label={t('crmNav.customers.secondaryAria', '客户跟进与分析')} className="flex flex-wrap items-center gap-2">
            {[...followup, ...insights].map((item) => (
              <Link key={item.href} href={item.href} className={pillClass(pathname.startsWith(item.href))}>
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    )
  }

  if (isBusiness) {
    const categories = catalog?.business.categories?.length
      ? catalog.business.categories
      : SCENE_MAP.businessCategories.map((category) => ({ ...category, items: [] }))
    return (
      <nav aria-label={t('crmNav.business.aria', '业务分类')} className="mb-4 flex flex-wrap gap-1 border-b pb-3">
        <Link href="/backend/business" aria-current={pathname === '/backend/business' ? 'page' : undefined} className={tabClass(pathname === '/backend/business')}>
          {t('crmNav.business.all', '全部')}
        </Link>
        {categories.map((category) => {
          const href = `/backend/business/${category.id}`
          const active = pathname === href
          return (
            <Link key={category.id} href={href} aria-current={active ? 'page' : undefined} className={tabClass(active)}>
              {t(`crmNav.business.category.${category.id}`, category.label)}
            </Link>
          )
        })}
      </nav>
    )
  }

  const isMessages = pathname === '/backend/messages' || pathname === '/backend/inbox-ops' || pathname === '/backend/phone_calls' || pathname === '/backend/communication_channels/channels'
  if (isMessages) {
    const items = catalog?.messages.items ?? []
    if (items.length === 0) return null
    return (
      <nav aria-label={t('crmNav.messages.aria', '消息视图')} className="mb-4 flex flex-wrap gap-1 border-b pb-3">
        {items.map((item) => {
          const active = pathname === item.href
          return (
            <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={tabClass(active)}>
              {item.label}
            </Link>
          )
        })}
      </nav>
    )
  }

  return null
}

const widget = {
  metadata: {
    id: 'crm_navigation.injection.content-nav',
    title: '内容区二级导航',
    description: 'Customer tabs, business categories, message views and related-record links',
    enabled: true,
    priority: 20,
  },
  Widget: ContentNav,
}

export default widget
