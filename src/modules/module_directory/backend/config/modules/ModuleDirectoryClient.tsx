'use client'

import * as React from 'react'
import Link from 'next/link'
import { Boxes, ExternalLink, Info, Search, Settings2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { EmptyState } from '@/components/states/EmptyState'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { Input } from '@open-mercato/ui/primitives/input'

export type ModuleDirectoryPageEntry = {
  path: string
  title: string
  titleKey?: string
  navHidden: boolean
  isConfig: boolean
}

export type ModuleDirectoryRow = {
  id: string
  title: string
  name: string
  version: string
  description: string
  author: string
  license: string
  pageCount: number
  configCount: number
  configPath: string | null
  openPath: string | null
  pages: ModuleDirectoryPageEntry[]
}

const AUTHOR_LABELS: Record<string, string> = {
  'ILA3 Commerce Team': 'ILA3 Commerce 团队',
  'FreightTech Team': 'FreightTech 团队',
  'Acme Corp': 'Acme 公司',
}

export default function ModuleDirectoryClient({ modules }: { modules: ModuleDirectoryRow[] }) {
  const t = useT()
  const [search, setSearch] = React.useState('')
  const [filter, setFilter] = React.useState<'all' | 'config' | 'empty'>('all')
  const [detail, setDetail] = React.useState<ModuleDirectoryRow | null>(null)

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase()
    return modules.filter((module) => {
      if (filter === 'config' && module.configCount === 0) return false
      if (filter === 'empty' && module.pageCount > 0) return false
      if (!needle) return true
      const haystack = [
        module.id,
        module.name,
        module.title,
        module.description,
        module.author,
        t(`modules.directory.module.${module.id}.title`, module.title),
        t(`modules.directory.module.${module.id}.desc`, module.description),
      ]
      return haystack.some((value) => value.toLowerCase().includes(needle))
    })
  }, [modules, search, filter, t])

  const stats = React.useMemo(() => ({
    total: modules.length,
    withConfig: modules.filter((module) => module.configCount > 0).length,
    pages: modules.reduce((sum, module) => sum + module.pageCount, 0),
  }), [modules])

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Boxes className="size-6" aria-hidden />
          {t('modules.directory.title', 'Module applications')}
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t(
            'modules.directory.subtitle',
            'Every module enabled in this deployment, with its version, description and available settings or entry pages. The list is generated from the running build.',
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{t('modules.directory.stat.total', 'Enabled modules')}</p>
          <p className="text-2xl font-semibold">{stats.total}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{t('modules.directory.stat.withConfig', 'With settings pages')}</p>
          <p className="text-2xl font-semibold">{stats.withConfig}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{t('modules.directory.stat.pages', 'Backend pages')}</p>
          <p className="text-2xl font-semibold">{stats.pages}</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">{t('modules.directory.listTitle', 'Modules')}</h2>
            <p className="text-xs text-muted-foreground">
              {t('modules.directory.listSummary', '{{shown}} of {{total}} modules')
                .replace('{{shown}}', String(filtered.length))
                .replace('{{total}}', String(modules.length))}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border p-0.5">
              {([
                ['all', t('modules.directory.filter.all', 'All')],
                ['config', t('modules.directory.filter.config', 'With settings')],
                ['empty', t('modules.directory.filter.empty', 'No pages')],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`rounded px-2.5 py-1 text-xs transition-colors ${
                    filter === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                  }`}
                  data-module-filter={value}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('modules.directory.search', 'Search modules…')}
                className="h-8 w-60 pl-8 text-xs"
                aria-label={t('modules.directory.search', 'Search modules…')}
              />
            </div>
          </div>
        </div>

        <DataTable<ModuleDirectoryRow>
          entityId="module_directory:module"
          extensionTableId="module_directory.modules"
          data={filtered}
          sortable={false}
          emptyState={<EmptyState title={t('modules.directory.empty','No modules match the search.')} description={t('modules.directory.emptyHint','调整搜索关键词或筛选条件后重试。')} />}
          columns={[
            {id:'module',header:t('modules.directory.column.module','Module'),cell:({row})=><div data-module-row={row.original.id}><span className="font-medium">{t(`modules.directory.module.${row.original.id}.title`,row.original.title)}</span><p className="font-mono text-xs text-muted-foreground">{row.original.id}</p></div>},
            {id:'version',header:t('modules.directory.column.version','Version'),cell:({row})=><Badge variant="outline" size="sm">{row.original.version||'—'}</Badge>},
            {id:'description',header:t('modules.directory.column.description','Description'),cell:({row})=><div className="max-w-md"><p className="line-clamp-2 text-xs text-muted-foreground">{t(`modules.directory.module.${row.original.id}.desc`,row.original.description)||t('modules.directory.noDescription','No description')}</p>{row.original.author?<p className="text-xs text-muted-foreground">{AUTHOR_LABELS[row.original.author]??row.original.author}</p>:null}</div>},
            {id:'pages',header:t('modules.directory.column.pages','Pages'),cell:({row})=><div className="flex items-center gap-2"><span>{row.original.pageCount}</span>{row.original.configCount>0?<Badge variant="info" size="sm">{t('modules.directory.configPages','{{count}} settings').replace('{{count}}',String(row.original.configCount))}</Badge>:null}</div>},
            {id:'actions',header:t('modules.directory.column.actions','Actions'),cell:({row})=>{const entry=row.original;return <div className="flex items-center gap-3"><Button type="button" variant="ghost" size="sm" onClick={()=>setDetail(entry)} data-module-detail={entry.id}><Info className="size-3.5" aria-hidden />{t('modules.directory.detail','Details')}</Button>{entry.configPath?<Link href={entry.configPath} data-module-config={entry.id}><Settings2 className="size-3.5" aria-hidden />{t('modules.directory.configure','Settings')}</Link>:null}{entry.openPath?<Link href={entry.openPath} data-module-open={entry.id}><ExternalLink className="size-3.5" aria-hidden />{t('modules.directory.open','Open')}</Link>:null}</div>}},
          ]}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {t(
          'modules.directory.footnote',
          'Modules are defined in src/modules.ts. This page is read-only; enable or disable a module there and rebuild.',
        )}
      </p>

      <Dialog open={detail !== null} onOpenChange={(open) => { if (!open) setDetail(null) }}>
        <DialogContent className="max-w-2xl" data-module-detail-dialog="">
          <DialogHeader>
            <DialogTitle>
              {detail ? t(`modules.directory.module.${detail.id}.title`, detail.title) : ''}
            </DialogTitle>
            <DialogDescription>
              {detail ? t(`modules.directory.module.${detail.id}.desc`, detail.description) : ''}
            </DialogDescription>
          </DialogHeader>
          {detail ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" size="sm">{detail.id}</Badge>
                {detail.version ? <Badge variant="neutral" size="sm">v{detail.version}</Badge> : null}
                {detail.author ? (
                  <span className="text-muted-foreground">{AUTHOR_LABELS[detail.author] ?? detail.author}</span>
                ) : null}
                <span className="text-muted-foreground">
                  {t('modules.directory.detail.pages', '{{count}} pages').replace('{{count}}', String(detail.pageCount))}
                </span>
              </div>
              <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
                {detail.pages.length === 0 ? (
                  <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                    {t('modules.directory.detail.noPages', 'This module has no backend pages.')}
                  </p>
                ) : (
                  detail.pages.map((page) => (
                    <Link
                      key={page.path}
                      href={page.path}
                      className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">
                          {page.titleKey ? t(page.titleKey, page.title) : page.title}
                        </p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{page.path}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {page.isConfig ? (
                          <Badge variant="info" size="sm" className="whitespace-nowrap">
                            {t('modules.directory.detail.settings', 'Settings')}
                          </Badge>
                        ) : null}
                        {page.navHidden ? (
                          <Badge variant="muted" size="sm" className="whitespace-nowrap">
                            {t('modules.directory.detail.hidden', 'Hidden')}
                          </Badge>
                        ) : null}
                        <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden />
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
