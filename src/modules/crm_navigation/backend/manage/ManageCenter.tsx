'use client'

import * as React from 'react'
import Link from 'next/link'
import { Search, Settings2 } from 'lucide-react'
import { useBackendChrome } from '@open-mercato/ui/backend/BackendChromeProvider'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Input } from '@open-mercato/ui/primitives/input'
import { EmptyState } from '@/components/states/EmptyState'
import { SCENE_MAP, type CrmCatalog } from '@/nav/crm-navigation'

function readCatalog(payload: unknown): CrmCatalog | null {
  if (!payload || typeof payload !== 'object') return null
  const candidate = (payload as { crm?: unknown }).crm
  if (!candidate || typeof candidate !== 'object') return null
  return Array.isArray((candidate as CrmCatalog).scenes) ? (candidate as CrmCatalog) : null
}

function chipClass(active: boolean) {
  return [
    'inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors',
    'focus:outline-none focus-visible:shadow-focus',
    active
      ? 'border-foreground/20 bg-muted text-foreground'
      : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
  ].join(' ')
}

export default function ManageCenter() {
  const t = useT()
  const { payload, isLoading, refresh } = useBackendChrome()
  const catalog = readCatalog(payload)
  const [search, setSearch] = React.useState('')
  const [category, setCategory] = React.useState<string>('all')

  const categories = React.useMemo(() => catalog?.manage.categories ?? [], [catalog])
  const needle = search.trim().toLowerCase()

  const visible = React.useMemo(() => {
    return categories
      .filter((section) => category === 'all' || section.id === category)
      .map((section) => {
        const items = section.items.filter((item) => {
          if (!needle) return true
          const label = t(`crmNav.manage.category.${section.id}`, section.label)
          return [item.label, item.href, label].some((value) => value.toLowerCase().includes(needle))
        })
        return { ...section, items }
      })
      .filter((section) => section.items.length > 0)
  }, [categories, category, needle, t])

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

  const total = categories.reduce((sum, section) => sum + section.items.length, 0)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="size-5 text-muted-foreground" aria-hidden />
            <h1 className="text-2xl font-bold">{t('crmNav.manage.title', '管理中心')}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('crmNav.manage.description', '管理员设置与员工日常分开。这里只列出你的账号有权打开的功能，按分类浏览或直接搜索。')}
          </p>
        </div>
        <Badge variant="muted" size="sm">
          {total} {t('crmNav.entries', '个入口')}
        </Badge>
      </header>

      <div className="flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('crmNav.manage.searchPlaceholder', '搜索管理功能')}
            aria-label={t('crmNav.manage.searchPlaceholder', '搜索管理功能')}
            className="h-9 pl-9 text-sm"
            data-manage-search=""
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('crmNav.manage.categoriesAria', '管理分类')}>
          <button type="button" className={chipClass(category === 'all')} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
            {t('crmNav.manage.all', '全部')}
          </button>
          {categories.map((section) => (
            <button
              key={section.id}
              type="button"
              className={chipClass(category === section.id)}
              aria-pressed={category === section.id}
              onClick={() => setCategory(section.id)}
            >
              {t(`crmNav.manage.category.${section.id}`, section.label)}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={needle ? t('crmNav.manage.noResults', '没有匹配的管理功能') : t('crmNav.manage.empty', '你的账号暂时没有管理入口')}
          description={needle ? t('crmNav.manage.noResultsHint', '换一个更短的关键词，或清空搜索后按分类浏览。') : t('crmNav.manage.emptyHint', '管理权限由管理员分配；这里不会显示无法访问的入口。')}
        />
      ) : (
        visible.map((section) => {
          const label = t(`crmNav.manage.category.${section.id}`, section.label)
          return (
            <section key={section.id} className="flex flex-col gap-2" data-manage-category={section.id}>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">{label}</h2>
                <Badge variant="muted" size="sm">{section.items.length}</Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex min-h-12 flex-col justify-center rounded-lg border bg-card px-4 py-2.5 transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:shadow-focus"
                    data-manage-entry={item.href}
                  >
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className="mt-0.5 truncate text-xs text-muted-foreground">{item.href}</span>
                  </Link>
                ))}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
