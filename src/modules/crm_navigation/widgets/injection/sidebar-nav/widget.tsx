'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Briefcase,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Sparkles,
  UserCircle,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useSidebarCollapse } from '@open-mercato/ui/backend/AppShell'
import { AI_ASSISTANT_LAUNCHER_OPEN_EVENT, useAiAssistantAvailable } from '@open-mercato/ui/ai'
import { useBackendChrome } from '@open-mercato/ui/backend/BackendChromeProvider'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { readCrmCatalog, SCENE_MAP, selectRail, type CrmSceneLink } from '@/nav/crm-navigation'

type Variant = 'desktop' | 'mobile'

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Sparkles,
  Users,
  Briefcase,
  MessageSquare,
  Settings,
  UserCircle,
}

/** Prefixes that are not themselves nav entries (the new scene pages). */
const EXTRA_PREFIXES: Record<string, string[]> = {
  workbench: ['/backend', '/backend/workbench'],
  customers: ['/backend/customers'],
  business: ['/backend/business'],
  messages: ['/backend/messages'],
  manage: ['/backend/manage'],
  account: ['/backend/profile'],
}

function resolveSurface(pathname: string): string | null {
  let best: string | null = null
  let bestLength = 0
  for (const [href, spec] of Object.entries(SCENE_MAP.entries)) {
    if (spec.disposition !== 'nav') continue
    const matches = pathname === href || pathname.startsWith(`${href}/`)
    if (!matches) continue
    if (href.length > bestLength) {
      bestLength = href.length
      best = spec.surface
    }
  }
  for (const [surface, prefixes] of Object.entries(EXTRA_PREFIXES)) {
    for (const prefix of prefixes) {
      if ((pathname === prefix || pathname.startsWith(`${prefix}/`)) && prefix.length > bestLength) {
        bestLength = prefix.length
        best = surface === 'account' ? 'personal' : surface
      }
    }
  }
  return best
}

function iconFor(name: string | undefined): LucideIcon {
  return (name && ICONS[name]) || LayoutDashboard
}

export function CrmSidebarNav({ variant = 'desktop' }: { variant?: Variant }) {
  const t = useT()
  const pathname = usePathname() ?? ''
  const { collapsed } = useSidebarCollapse()
  const aiAvailable = useAiAssistantAvailable()
  const chrome = useBackendChrome()
  const catalog = readCrmCatalog(chrome.payload)
  const rail = selectRail(catalog, chrome.isLoading)
  const compact = variant === 'desktop' && collapsed
  const activeSurface = React.useMemo(() => resolveSurface(pathname), [pathname])

  const scenes = React.useMemo(
    () => rail.scenes.filter((scene) => (scene.id === 'assistant' ? aiAvailable : true)),
    [aiAvailable, rail.scenes],
  )
  const utility = rail.utility

  const linkClass = (active: boolean) =>
    [
      'group relative flex w-full items-center gap-3 rounded-lg text-sm font-medium transition-colors',
      'focus:outline-none focus-visible:shadow-focus',
      compact ? 'h-10 justify-center px-0' : 'min-h-10 px-3 py-2',
      active
        ? 'bg-muted text-foreground'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    ].join(' ')

  const renderItem = (scene: CrmSceneLink) => {
    const Icon = iconFor(scene.icon)
    const active = activeSurface === scene.id
    const label = t(`crmNav.scene.${scene.id}`, scene.label)
    if (scene.action === 'open-ai-assistant') {
      return (
        <li key={scene.id}>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent(AI_ASSISTANT_LAUNCHER_OPEN_EVENT))}
            className={linkClass(false)}
            title={compact ? label : undefined}
            aria-label={t('crmNav.openAssistant', '打开 AI 助手')}
            data-crm-scene={scene.id}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {compact ? null : <span className="truncate">{label}</span>}
          </button>
        </li>
      )
    }
    return (
      <li key={scene.id}>
        <Link
          href={scene.href ?? '/backend'}
          className={linkClass(active)}
          aria-current={active ? 'page' : undefined}
          title={compact ? label : undefined}
          data-crm-scene={scene.id}
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          {compact ? null : <span className="truncate">{label}</span>}
          {active ? (
            <span
              aria-hidden
              className={`absolute ${compact ? 'left-0' : 'left-0'} top-1.5 bottom-1.5 w-1 rounded-r bg-foreground`}
            />
          ) : null}
        </Link>
      </li>
    )
  }

  const renderUtility = (item: { id: 'manage' | 'account'; label: string; href: string; icon: string }) => {
    const Icon = iconFor(item.icon)
    const active = item.id === 'manage' ? activeSurface === 'manage' : activeSurface === 'personal'
    const label = t(`crmNav.utility.${item.id}`, item.label)
    return (
      <li key={item.id}>
        <Link
          href={item.href}
          className={linkClass(active)}
          aria-current={active ? 'page' : undefined}
          title={compact ? label : undefined}
          data-crm-utility={item.id}
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          {compact ? null : <span className="truncate">{label}</span>}
        </Link>
      </li>
    )
  }

  if (rail.state === 'error') {
    return (
      <div data-crm-nav-state="error" data-crm-scene-nav={variant} className="px-1 py-2">
        <p className="text-xs text-muted-foreground">{t('crmNav.navLoadFailed', '导航加载失败')}</p>
        <button
          type="button"
          onClick={() => void chrome.refresh()}
          className="mt-1 text-xs underline focus:outline-none focus-visible:shadow-focus"
        >
          {t('crmNav.retry', '重试')}
        </button>
      </div>
    )
  }

  return (
    <nav
      aria-label={t('crmNav.mainAria', '主导航')}
      aria-busy={rail.state === 'loading' || undefined}
      data-crm-scene-nav={variant}
      data-crm-nav-state={rail.state}
      data-crm-nav-empty={rail.state === 'ready' && scenes.length === 0 ? 'true' : undefined}
      className="flex flex-col gap-1"
    >
      {rail.state === 'loading' ? (
        <ul className="flex flex-col gap-1" data-crm-nav-loading="">
          {[0, 1, 2, 3, 4].map((row) => (
            <li key={row} aria-hidden className="h-10 animate-pulse rounded-lg bg-muted/60" />
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-1">{scenes.map(renderItem)}</ul>
      )}
      {variant === 'mobile' && utility.length > 0 ? (
        <div className="mt-3 border-t pt-3">
          <ul className="flex flex-col gap-1">{utility.map(renderUtility)}</ul>
        </div>
      ) : null}
    </nav>
  )
}

const SidebarNavWidget = () => <CrmSidebarNav variant="desktop" />

const widget = {
  metadata: {
    id: 'crm_navigation.injection.sidebar-nav',
    title: '五场景主导航',
    description: 'Five primary CRM scenes; no second- or third-level tree in the rail',
    enabled: true,
    priority: 20,
  },
  Widget: SidebarNavWidget,
}

export default widget
