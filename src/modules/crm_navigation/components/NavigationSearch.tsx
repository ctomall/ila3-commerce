"use client"
import * as React from 'react'
import Link from 'next/link'
import { Search, Star } from 'lucide-react'
import { useBackendChrome } from '@open-mercato/ui/backend/BackendChromeProvider'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Popover, PopoverTrigger, PopoverContent } from '@open-mercato/ui/primitives/popover'
import { IconButton } from '@open-mercato/ui/primitives/icon-button'
import { Input } from '@open-mercato/ui/primitives/input'
import { useNavigationPreferences } from './NavigationPreferences'
import { readCrmCatalog } from '@/nav/crm-navigation'
import { directorySpaces, readWorkspaceLayout } from '@/nav/workspace-payload'
import { buildWorkspaces, searchWorkspaceEntries } from '@/nav/workspaces'

/** Navigation search is separate from the installed business-record/semantic search. */
export function NavigationSearch() {
  const { payload } = useBackendChrome()
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const catalog = readCrmCatalog(payload)
  const { preference, toggleFavorite } = useNavigationPreferences()
  const items = React.useMemo(() => {
    if (!catalog || catalog.error) return []
    const daily = searchWorkspaceEntries(directorySpaces(buildWorkspaces(catalog.groups), readWorkspaceLayout(payload)), query)
    const needle = query.trim().toLocaleLowerCase()
    const settings = catalog.manage.categories.flatMap(category => category.items.map(item => ({
      ...item, workspaceId: category.id, workspaceLabel: category.label,
    })))
    const personal = catalog.personal.items.map(item => ({ ...item, workspaceId: 'profile', workspaceLabel: t('crmNav.utility.account', '个人账户') }))
    const seen = new Set(daily.map(item => item.href))
    for (const item of [...settings, ...personal]) {
      if (seen.has(item.href) || (needle && ![item.label,item.workspaceLabel,item.href].some(value => value.toLocaleLowerCase().includes(needle)))) continue
      daily.push(item)
      seen.add(item.href)
    }
    return daily.sort((a,b) => Number(preference.favorites.includes(b.href))-Number(preference.favorites.includes(a.href)))
  }, [catalog, payload, query, t, preference.favorites])
  const workspaceEnabled = (payload as unknown as { workspaceNavigationEnabled?: boolean } | null)?.workspaceNavigationEnabled !== false
  if (!workspaceEnabled || !catalog || catalog.error) return null
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <IconButton variant="ghost" size="sm" aria-label={t('crmNav.search.title', '查找功能入口')}><Search className="size-4" aria-hidden /></IconButton>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-72 max-w-full p-3">
      <Input autoFocus value={query} onChange={event => setQuery(event.target.value)} aria-label={t('crmNav.search.title', '查找功能入口')} placeholder={t('crmNav.search.placeholder', '搜索所有工作空间与设置')} />
      <div className="mt-2 max-h-80 overflow-y-auto" aria-live="polite">
        {!items.length ? <p className="p-2 text-sm text-muted-foreground">{t('crmNav.search.empty', '没有匹配的已授权入口')}</p> :
          <ul className="space-y-1">{items.map(item => <li key={item.href} className="flex items-center gap-1">
            <Link href={item.href} onClick={() => setOpen(false)} className="flex min-w-0 flex-1 flex-col rounded-md p-2 text-sm hover:bg-muted focus-visible:shadow-focus" data-nav-search-entry={item.href}>
              <span>{item.label}</span><span className="text-xs text-muted-foreground">{item.workspaceLabel}</span>
            </Link>
            <IconButton variant="ghost" size="sm" onClick={() => toggleFavorite(item.href)} aria-label={t(preference.favorites.includes(item.href) ? 'crmNav.search.unfavorite' : 'crmNav.search.favorite', preference.favorites.includes(item.href) ? '取消收藏' : '收藏入口')} aria-pressed={preference.favorites.includes(item.href)}>
              <Star className={preference.favorites.includes(item.href) ? 'size-4 fill-current' : 'size-4'} aria-hidden />
            </IconButton>
          </li>)}</ul>}
      </div>
    </PopoverContent>
  </Popover>
}
