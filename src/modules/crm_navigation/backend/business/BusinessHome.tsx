'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, Briefcase } from 'lucide-react'
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

export default function BusinessHome() {
  const t = useT()
  const { payload, isLoading, refresh } = useBackendChrome()
  const catalog = readCatalog(payload)

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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Briefcase className="size-5 text-muted-foreground" aria-hidden />
            <h1 className="text-2xl font-bold">{t('crmNav.business.title', '业务')}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('crmNav.business.description', '按业务分类进入报价、订单、商品、库存、履约、团队与自动化。左侧只保留场景，二级导航在这里。')}
          </p>
        </div>
        <Badge variant="muted" size="sm">
          {categories.reduce((sum, category) => sum + category.items.length, 0)} {t('crmNav.entries', '个入口')}
        </Badge>
      </header>

      {categories.length === 0 ? (
        <EmptyState
          title={t('crmNav.business.empty', '你的账号暂时没有业务入口')}
          description={t('crmNav.business.emptyHint', '功能权限由管理员分配；这里不会显示无法访问的入口。')}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {categories.map((category) => {
            const meta = SCENE_MAP.businessCategories.find((entry) => entry.id === category.id)
            const label = t(`crmNav.business.category.${category.id}`, meta?.label ?? category.label)
            return (
              <section key={category.id} className="rounded-lg border bg-card p-4" data-business-category={category.id}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">{label}</h2>
                  <Link
                    href={`/backend/business/${category.id}`}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus-visible:shadow-focus"
                  >
                    {t('crmNav.viewCategory', '查看分类')}
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </div>
                <ul className="mt-3 flex flex-col gap-1">
                  {category.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="flex min-h-9 items-center justify-between gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:shadow-focus"
                      >
                        <span className="truncate">{item.label}</span>
                        <ArrowRight className="size-3.5 shrink-0" aria-hidden />
                      </Link>
                      {item.children && item.children.length > 0 ? (
                        <ul className="ml-3 flex flex-col gap-0.5 border-l pl-3">
                          {item.children.map((child) => (
                            <li key={child.href}>
                              <Link
                                href={child.href}
                                className="flex min-h-8 items-center rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:shadow-focus"
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
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
