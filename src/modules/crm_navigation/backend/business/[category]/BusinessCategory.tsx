'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useBackendChrome } from '@open-mercato/ui/backend/BackendChromeProvider'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { EmptyState } from '@/components/states/EmptyState'
import { readCrmCatalog } from '@/nav/crm-navigation'

export default function BusinessCategory({ category }: { category: string }) {
  const t = useT()
  const { payload, isLoading } = useBackendChrome()
  const catalog = readCrmCatalog(payload)
  const group = catalog?.groups.find((entry) => entry.id === category)

  if (isLoading && !catalog) {
    return <div className="h-40 animate-pulse rounded-lg border bg-muted/30" aria-hidden />
  }

  const label = group ? t(group.labelKey ?? `crmNav.group.${group.id}`, group.label) : category

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/backend/business"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus-visible:shadow-focus"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {t('crmNav.business.back', '返回业务首页')}
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{label}</h1>
        </div>
        {group ? (
          <Badge variant="muted" size="sm">
            {group.items.length} {t('crmNav.entries', '个入口')}
          </Badge>
        ) : null}
      </header>

      {!group || group.items.length === 0 ? (
        <EmptyState
          title={t('crmNav.business.categoryEmpty', '这个分区下没有你有权访问的功能')}
          description={t('crmNav.business.categoryEmptyHint', '权限由管理员分配。这里不会列出无法打开的页面。')}
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {group.items.map((item) => (
            <li key={item.href} className="rounded-lg border bg-card p-3" data-business-entry={item.href}>
              <Link
                href={item.href}
                className="flex min-h-9 items-center justify-between gap-2 rounded-md text-sm font-medium text-foreground focus:outline-none focus-visible:shadow-focus"
              >
                <span className="truncate">{item.label}</span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
