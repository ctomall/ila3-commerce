'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  Archive,
  BadgeCheck,
  Boxes,
  Briefcase,
  Building2,
  Calendar,
  ClipboardList,
  Clock,
  Database,
  FileText,
  FolderTree,
  Globe,
  Inbox,
  KeyRound,
  Layers,
  LayoutDashboard,
  Mail,
  Map,
  Package,
  PhoneCall,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Tag,
  Truck,
  UserCircle,
  Users,
  Warehouse,
  Workflow,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useSidebarCollapse } from '@open-mercato/ui/backend/AppShell'
import { AI_ASSISTANT_LAUNCHER_OPEN_EVENT, useAiAssistantAvailable } from '@open-mercato/ui/ai'
import { useBackendChrome } from '@open-mercato/ui/backend/BackendChromeProvider'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  readCrmCatalog,
  selectActiveGroup,
  selectRail,
  type CrmNavGroup,
  type CrmRailAction,
} from '@/nav/crm-navigation'

type Variant = 'desktop' | 'mobile'

const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  archive: Archive,
  'badge-check': BadgeCheck,
  boxes: Boxes,
  briefcase: Briefcase,
  building2: Building2,
  calendar: Calendar,
  'clipboard-list': ClipboardList,
  clock: Clock,
  database: Database,
  'file-text': FileText,
  'folder-tree': FolderTree,
  globe: Globe,
  inbox: Inbox,
  'key-round': KeyRound,
  layers: Layers,
  'layout-dashboard': LayoutDashboard,
  mail: Mail,
  map: Map,
  package: Package,
  'phone-call': PhoneCall,
  receipt: Receipt,
  settings: Settings,
  'shield-check': ShieldCheck,
  'shopping-cart': ShoppingCart,
  sparkles: Sparkles,
  store: Store,
  tag: Tag,
  truck: Truck,
  'user-circle': UserCircle,
  users: Users,
  warehouse: Warehouse,
  workflow: Workflow,
  wrench: Wrench,
}

function iconFor(name: string | undefined): LucideIcon {
  if (!name) return LayoutDashboard
  return ICONS[name] ?? ICONS[name.toLowerCase()] ?? LayoutDashboard
}

export function CrmSidebarNav({ variant = 'desktop' }: { variant?: Variant }) {
  const t = useT()
  const pathname = usePathname() ?? ''
  const { collapsed } = useSidebarCollapse()
  const aiAvailable = useAiAssistantAvailable()
  const chrome = useBackendChrome()
  const catalog = readCrmCatalog(chrome.payload)
  const rail = selectRail(catalog, chrome.isLoading)
  const activeGroup = React.useMemo(() => selectActiveGroup(catalog, pathname), [catalog, pathname])
  const compact = variant === 'desktop' && collapsed

  const railActions = React.useMemo(
    () => rail.railActions.filter((action) => (action.id === 'assistant' ? aiAvailable : true)),
    [aiAvailable, rail.railActions],
  )

  const linkClass = (active: boolean) =>
    [
      'group relative flex w-full items-center gap-3 rounded-lg text-sm font-medium transition-colors',
      'focus:outline-none focus-visible:shadow-focus',
      compact ? 'h-10 justify-center px-0' : 'min-h-10 px-3 py-2',
      active
        ? 'bg-muted text-foreground'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    ].join(' ')

  const renderGroup = (group: CrmNavGroup) => {
    const Icon = iconFor(group.iconName)
    const active = activeGroup?.id === group.id
    const label = t(group.labelKey ?? `crmNav.group.${group.id}`, group.label)
    return (
      <li key={group.id}>
        <Link
          href={group.landing}
          className={linkClass(active)}
          aria-current={active ? 'page' : undefined}
          title={compact ? label : undefined}
          data-crm-nav-group={group.id}
          data-crm-nav-active={active ? 'true' : undefined}
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          {compact ? null : <span className="truncate">{label}</span>}
          {active ? (
            <span
              aria-hidden
              className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-foreground"
            />
          ) : null}
        </Link>
      </li>
    )
  }

  const renderAction = (action: CrmRailAction) => {
    const Icon = iconFor(action.icon)
    const label = t(`crmNav.action.${action.id}`, action.label)
    return (
      <li key={action.id}>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent(AI_ASSISTANT_LAUNCHER_OPEN_EVENT))}
          className={linkClass(false)}
          title={compact ? label : undefined}
          aria-label={t('crmNav.openAssistant', '打开 AI 助手')}
          data-crm-rail-action={action.id}
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          {compact ? null : <span className="truncate">{label}</span>}
        </button>
      </li>
    )
  }

  const renderUtility = (item: { id: 'manage' | 'account'; label: string; href: string; icon: string }) => {
    const Icon = iconFor(item.icon)
    const active =
      item.id === 'manage'
        ? pathname === '/backend/manage' || pathname.startsWith('/backend/manage/')
        : pathname === '/backend/profile' || pathname.startsWith('/backend/profile/')
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

  const isEmpty =
    rail.state === 'ready' &&
    rail.groups.length === 0 &&
    railActions.length === 0 &&
    (variant === 'desktop' || rail.utility.length === 0)

  return (
    <nav
      aria-label={t('crmNav.mainAria', '主导航')}
      aria-busy={rail.state === 'loading' || undefined}
      data-crm-scene-nav={variant}
      data-crm-nav-state={rail.state}
      data-crm-nav-empty={isEmpty ? 'true' : undefined}
      className="flex flex-col gap-1"
    >
      {rail.state === 'loading' ? (
        <ul className="flex flex-col gap-1" data-crm-nav-loading="">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
            <li key={row} aria-hidden className="h-10 animate-pulse rounded-lg bg-muted/60" />
          ))}
        </ul>
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {rail.groups.map(renderGroup)}
            {railActions.map(renderAction)}
          </ul>
          {isEmpty ? (
            <p className="px-2 py-3 text-xs text-muted-foreground" data-crm-nav-empty-message="">
              {t('crmNav.empty', '你的账号暂时没有可用的导航入口。')}
            </p>
          ) : null}
          {variant === 'mobile' && rail.utility.length > 0 ? (
            <div className="mt-3 border-t pt-3">
              <ul className="flex flex-col gap-1">{rail.utility.map(renderUtility)}</ul>
            </div>
          ) : null}
        </>
      )}
    </nav>
  )
}

const SidebarNavWidget = () => <CrmSidebarNav variant="desktop" />

const widget = {
  metadata: {
    id: 'crm_navigation.injection.sidebar-nav',
    title: '声明式主导航',
    description: 'Top-level groups derived from module declarations; no route-owner table in the rail',
    enabled: true,
    priority: 20,
  },
  Widget: SidebarNavWidget,
}

export default widget
