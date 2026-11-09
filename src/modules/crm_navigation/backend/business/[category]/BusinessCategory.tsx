'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useBackendChrome } from '@open-mercato/ui/backend/BackendChromeProvider'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { EmptyState } from '@/components/states/EmptyState'
import { SCENE_MAP, type CrmCatalog } from '@/nav/crm-navigation'

function readCatalog(payload: unknown): CrmCatalog | null {
  if (!payload || typeof payload !== 'object') return null
  const candidate = (payload as { crm?: unknown }).crm
  if (!candidate || typeof candidate !== 'object') return null
  return Array.isArray((candidate as CrmCatalog).scenes) ? (candidate as CrmCatalog) : null
}

export default function BusinessCategory({ category }: { category: string }) {
  const t = useT()
  const { payload, isLoading } = useBackendChrome()
  const catalog = readCatalog(payload)
  const meta = SCENE_MAP.businessCategories.find((entry) => entry.id === category)
  const section = catalog?.business.categories.find((entry) => entry.id === category)

  if (isLoading && !catalog) {
    return <div className="h-40 animate-pulse rounded-lg border bg-muted/30" aria-hidden />
  }

  const label = t(`crmNav.business.category.${category}`, meta?.label ?? category)

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
        {section ? (
          <Badge variant="muted" size="sm">
            {section.items.length} {t('crmNav.entries', '个入口')}
          </Badge>
        ) : null}
      </header>

      {!section || section.items.length === 0 ? (
        <EmptyState
          title={t('crmNav.business.categoryEmpty', '这个分类下没有你有权访问的功能')}
          description={t('crmNav.business.categoryEmptyHint', '权限由管理员分配。这里不会列出无法打开的页面。')}
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {section.items.map((item) => (
            <li key={item.href} className="rounded-lg border bg-card p-3" data-business-entry={item.href}>
              <Link
                href={item.href}
                className="flex min-h-9 items-center justify-between gap-2 rounded-md text-sm font-medium text-foreground focus:outline-none focus-visible:shadow-focus"
              >
                <span className="truncate">{item.label}</span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
              {item.children && item.children.length > 0 ? (
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 border-t pt-2">
                  {item.children.map((child) => (
                    <li key={child.href}>
                      <Link
                        href={child.href}
                        className="text-xs text-muted-foreground hover:text-foreground focus:outline-none focus-visible:shadow-focus"
                      >
                        {child.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
