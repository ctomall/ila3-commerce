'use client'

import * as React from 'react'
import Link from 'next/link'
import { Boxes, ExternalLink, Info, Search, Settings2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
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
                className="h-8 w-[240px] pl-8 text-xs"
                aria-label={t('modules.directory.search', 'Search modules…')}
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">{t('modules.directory.column.module', 'Module')}</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">{t('modules.directory.column.version', 'Version')}</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">{t('modules.directory.column.description', 'Description')}</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">{t('modules.directory.column.pages', 'Pages')}</th>
                <th className="whitespace-nowrap px-5 py-2.5 text-right font-medium">{t('modules.directory.column.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((module) => (
                <tr key={module.id} className="border-b last:border-0 hover:bg-muted/30" data-module-row={module.id}>
                  <td className="px-5 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">
                        {t(`modules.directory.module.${module.id}.title`, module.title)}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">{module.id}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant="outline" size="sm" className="whitespace-nowrap">
                      {module.version || '—'}
                    </Badge>
                  </td>
                  <td className="max-w-[420px] px-3 py-3">
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {t(`modules.directory.module.${module.id}.desc`, module.description)
                        || t('modules.directory.noDescription', 'No description')}
                    </p>
                    {module.author ? (
                      <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                        {AUTHOR_LABELS[module.author] ?? module.author}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span>{module.pageCount}</span>
                      {module.configCount > 0 ? (
                        <Badge variant="info" size="sm" className="whitespace-nowrap">
                          {t('modules.directory.configPages', '{{count}} settings').replace('{{count}}', String(module.configCount))}
                        </Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => setDetail(module)}
                        data-module-detail={module.id}
                      >
                        <Info className="size-3.5" aria-hidden />
                        {t('modules.directory.detail', 'Details')}
                      </Button>
                      {module.configPath ? (
                        <Link
                          href={module.configPath}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          data-module-config={module.id}
                        >
                          <Settings2 className="size-3.5" aria-hidden />
                          {t('modules.directory.configure', 'Settings')}
                        </Link>
                      ) : null}
                      {module.openPath ? (
                        <Link
                          href={module.openPath}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          data-module-open={module.id}
                        >
                          <ExternalLink className="size-3.5" aria-hidden />
                          {t('modules.directory.open', 'Open')}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {t('modules.directory.empty', 'No modules match the search.')}
          </div>
        ) : null}
      </div>

      <p className="text-[11px] text-muted-foreground">
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
              <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
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
                        <p className="truncate font-mono text-[10px] text-muted-foreground">{page.path}</p>
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
