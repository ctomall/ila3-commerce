'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, Briefcase } from 'lucide-react'
import { useBackendChrome } from '@open-mercato/ui/backend/BackendChromeProvider'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { EmptyState } from '@/components/states/EmptyState'
import { readCrmCatalog } from '@/nav/crm-navigation'

/**
 * Legacy business directory, kept as a direct URL.
 *
 * It is no longer the source of the information architecture: it renders the
 * same declared groups the rail uses, so a module that declares a page appears
 * here without this file learning its href.
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

  const groups = catalog.groups
  const total = groups.reduce((sum, group) => sum + group.items.length, 0)

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Briefcase className="size-5 text-muted-foreground" aria-hidden />
            <h1 className="text-2xl font-bold">{t('crmNav.business.title', '业务')}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('crmNav.business.description', '按当前账号可访问的模块分区浏览；导航入口由模块声明生成。')}
          </p>
        </div>
        <Badge variant="muted" size="sm">
          {total} {t('crmNav.business.functions', '项功能')}
        </Badge>
      </header>

      {groups.length === 0 ? (
        <EmptyState
          title={t('crmNav.business.empty', '你的账号暂时没有业务入口')}
          description={t('crmNav.business.emptyHint', '功能权限由管理员分配；这里不会显示无法访问的入口。')}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((group) => (
            <section
              key={group.id}
              className="rounded-lg border bg-card p-3"
              data-business-group={group.id}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  {t(group.labelKey ?? `crmNav.group.${group.id}`, group.label)}
                </h2>
                <Badge variant="muted" size="sm">{group.items.length}</Badge>
              </div>
              <ul className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex min-h-8 items-center justify-between gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:shadow-focus"
                      data-business-entry={item.href}
                    >
                      <span className="truncate">{item.label}</span>
                      <ArrowRight className="size-3.5 shrink-0" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground" data-business-hint="">
        {t('crmNav.business.hint', '这里只展示声明且已授权的入口；系统设置请到管理中心。')}
      </p>
    </div>
  )
}
