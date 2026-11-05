'use client'

import * as React from 'react'
import Link from 'next/link'
import { Search, Settings2, Sparkles } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { EmptyState } from '@/components/states/EmptyState'
import { Input } from '@open-mercato/ui/primitives/input'

export type SettingsCard = {
  path: string
  title: string
  titleKey?: string
  group: string
  groupKey: string
  order: number
}

const RECENT_KEY = 'om_settings_recent'
const RECENT_LIMIT = 6
const AI_GROUP_KEY = 'settings.sections.ai'

function readRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

export default function SettingsHomeClient({ cards }: { cards: SettingsCard[] }) {
  const t = useT()
  const [mounted, setMounted] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [recentPaths, setRecentPaths] = React.useState<string[]>([])

  React.useEffect(() => {
    setMounted(true)
    setRecentPaths(readRecent())
  }, [])

  const cardByPath = React.useMemo(() => new Map(cards.map((card) => [card.path, card])), [cards])


  const remember = React.useCallback((path: string) => {
    setRecentPaths(() => {
      const next = [path, ...readRecent().filter((entry) => entry !== path)].slice(0, RECENT_LIMIT)
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }, [])

  const groupLabel = React.useCallback(
    (card: SettingsCard) => t(card.groupKey, card.group),
    [t],
  )

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return cards
    return cards.filter((card) => {
      const title = card.titleKey ? t(card.titleKey, card.title) : card.title
      return [title, card.title, card.path, groupLabel(card)]
        .some((value) => value.toLowerCase().includes(needle))
    })
  }, [cards, groupLabel, search, t])

  const groups = React.useMemo(() => {
    const map = new Map<string, { key: string; label: string; cards: SettingsCard[]; order: number }>()
    for (const card of filtered) {
      const existing = map.get(card.groupKey)
      if (existing) {
        existing.cards.push(card)
        existing.order = Math.min(existing.order, card.order)
      } else {
        map.set(card.groupKey, {
          key: card.groupKey,
          label: groupLabel(card),
          cards: [card],
          order: card.order,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === AI_GROUP_KEY) return -1
      if (b.key === AI_GROUP_KEY) return 1
      return a.order - b.order || a.label.localeCompare(b.label)
    })
  }, [filtered, groupLabel])

  const recentCards = React.useMemo(
    () => recentPaths.map((path) => cardByPath.get(path)).filter((card): card is SettingsCard => Boolean(card)),
    [cardByPath, recentPaths],
  )

  const isSearching = search.trim().length > 0
  // The left settings menu is the canonical browse surface. The home page only
  // repeats the unified AI group (plus recent visits); everything else appears
  // when the user searches, so the two navigation surfaces do not mirror each
  // other card-for-card.
  const visibleGroups = isSearching ? groups : groups.filter((group) => group.key === AI_GROUP_KEY)

  // SSR resolves the locale from the request, while the client hydrates from
  // the locale cookie; render translated cards only after mount so hooks stay
  // unconditional and the first paint does not mismatch.
  if (!mounted) {
    return <div className="h-40 rounded-lg border border-dashed" aria-hidden />
  }

  const renderCard = (card: SettingsCard, compact = false) => {
    const isAi = card.groupKey === AI_GROUP_KEY
    return (
      <Link
        key={card.path}
        href={card.path}
        onClick={() => remember(card.path)}
        className="group flex flex-col gap-1.5 rounded-lg border bg-background p-4 shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        data-settings-card={card.path}
      >
        <div className="flex items-start gap-2.5">
          <span className={`mt-0.5 rounded-md p-1.5 ${isAi ? 'bg-brand-violet/10 text-brand-violet' : 'bg-muted text-muted-foreground'}`}>
            {isAi ? <Sparkles className="size-4" aria-hidden /> : <Settings2 className="size-4" aria-hidden />}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className={compact ? 'truncate text-sm font-medium' : 'text-sm font-medium'}>
              {card.titleKey ? t(card.titleKey, card.title) : card.title}
            </h3>
            {compact ? (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{groupLabel(card)}</p>
            ) : null}
          </div>
        </div>
      </Link>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('settings.page.title', 'Settings')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('settings.home.description', 'Search settings, or use the left menu. Recent visits and AI settings appear here.')}
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('settings.home.searchPlaceholder', 'Search settings')}
            className="h-9 w-[280px] pl-9 text-sm"
            aria-label={t('settings.home.searchPlaceholder', 'Search settings')}
            data-settings-search=""
          />
        </div>
      </div>

      {recentCards.length > 0 ? (
        <section className="flex flex-col gap-2" data-settings-recent="">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{t('settings.home.recent', 'Recently visited')}</h2>
            <Badge variant="muted" size="sm">{recentCards.length}</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recentCards.map((card) => renderCard(card, true))}
          </div>
        </section>
      ) : null}

      {!isSearching ? (
        <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground" data-settings-hint="">
          {t('settings.home.hint', 'Other settings are in the left menu. You can also search above.')}
        </p>
      ) : null}

      {isSearching && visibleGroups.length === 0 ? (
        <EmptyState
          title={t('settings.home.noResults', 'No settings match your search.')}
          description={t('settings.home.noResultsHint', 'Try a shorter keyword, or browse the left menu.')}
        />
      ) : (
        visibleGroups.map((group) => (
          <section key={group.key} className="flex flex-col gap-2" data-settings-group={group.key}>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">{group.label}</h2>
              <Badge variant="muted" size="sm">{group.cards.length}</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.cards.map((card) => renderCard(card))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
