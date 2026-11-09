'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, Briefcase } from 'lucide-react'
import { useBackendChrome } from '@open-mercato/ui/backend/BackendChromeProvider'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { EmptyState } from '@/components/states/EmptyState'
import { readCrmCatalog, SCENE_MAP, type CrmCatalog, type CrmNavItem } from '@/nav/crm-navigation'

function countItems(items: CrmNavItem[]): number {
  return items.reduce((sum, item) => sum + 1 + countItems(item.children ?? []), 0)
}

function itemLookup(categories: CrmCatalog['business']['categories']) {
  const map = new Map<string, CrmNavItem>()
  const add = (items: CrmNavItem[]) => {
    for (const item of items) {
      map.set(item.href, item)
      add(item.children ?? [])
    }
  }
  for (const category of categories) add(category.items)
  return map
}

/**
 * Business landing: a small set of common destinations plus category tiles.
 *
 * The full directory (including one level of child pages) lives on the
 * category pages. Putting every entry here would just move the old long tree
 * from the rail into the content area — which was the defect this page fixes.
 */
export default function BusinessHome() {
  const t = useT()
  const { payload, isLoading, refresh } = useBackendChrome()
  const catalog = readCrmCatalog(payload)

  if (isLoading && !catalog) {
    return <div className="h-40 animate-pulse rounded-lg border bg-muted/30" aria-hidden />
  }
  if (!catalog) {
    return (
      <EmptyState
        title={t('crmNav.loadFailed', '导航加载失败')}
        description={t('crmNav.loadFailedHint', '请刷新页面；如果仍然失败，联系管理员检查服务状态。')}
        actionLabel={t('crmNav.retry', '重试')}
        onAction={() => void refresh()}
      />
    )
  }

  const categories = catalog.business.categories
  const items = itemLookup(categories)
  const pinned = SCENE_MAP.businessPinned
    .map((href) => items.get(href))
    .filter((item): item is CrmNavItem => Boolean(item))
    .slice(0, 6)
  const total = categories.reduce((sum, category) => sum + countItems(category.items), 0)

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Briefcase className="size-5 text-muted-foreground" aria-hidden />
            <h1 className="text-2xl font-bold">{t('crmNav.business.title', '业务')}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('crmNav.business.description', '先从常用入口开始；完整目录进入分类页，系统设置归管理中心。')}
          </p>
        </div>
        <Badge variant="muted" size="sm">
          {total} {t('crmNav.business.functions', '项功能')}
        </Badge>
      </header>

      {categories.length === 0 ? (
        <EmptyState
          title={t('crmNav.business.empty', '你的账号暂时没有业务入口')}
          description={t('crmNav.business.emptyHint', '功能权限由管理员分配；这里不会显示无法访问的入口。')}
        />
      ) : (
        <>
          {pinned.length > 0 ? (
            <section data-business-pinned="" className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">{t('crmNav.business.pinned', '常用入口')}</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {pinned.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex min-h-11 items-center justify-between gap-2 rounded-lg border bg-card px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:shadow-focus"
                    data-business-pinned-href={item.href}
                  >
                    <span className="truncate">{item.label}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">{t('crmNav.business.categories', '业务分类')}</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {categories.map((category) => {
                const meta = SCENE_MAP.businessCategories.find((entry) => entry.id === category.id)
                const label = t(`crmNav.business.category.${category.id}`, meta?.label ?? category.label)
                return (
                  <Link
                    key={category.id}
                    href={`/backend/business/${category.id}`}
                    className="flex min-h-20 flex-col justify-between gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:shadow-focus"
                    data-business-category={category.id}
                  >
                    <span className="text-sm font-semibold">{label}</span>
                    <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      {countItems(category.items)} {t('crmNav.business.entriesShort', '项')}
                      <ArrowRight className="size-3.5" aria-hidden />
                    </span>
                  </Link>
                )
              })}
            </div>
          </section>

          <p className="text-xs text-muted-foreground" data-business-hint="">
            {t('crmNav.business.hint', '业务首页只放常用入口和分类；完整目录、子页面与页内动作在分类页。系统设置请到管理中心。')}
          </p>
        </>
      )}
    </div>
  )
}
