import { NAV_GROUP_CATALOG, type NavGroupSpec } from '../lib/nav/group-catalog'

/**
 * CRM navigation catalogue.
 *
 * Module declarations are the fact source for an entry. The upstream
 * `/api/auth/admin/nav` payload is already built from `page.meta.ts` and is the
 * only place authorization is applied: every item here came from that payload.
 * This module never adds a page of its own, never checks a role name and never
 * widens a grant.
 *
 * What the app owns is only the top-level arrangement: `nav-groups.json` names
 * module page groups (`pageGroupKey`) and their order. A group a module adds is
 * appended and reported as unconfigured instead of being dropped. A page that
 * declares no menu order is an in-page action, not a destination.
 *
 * There is deliberately no per-href owner table: adding a declared page changes
 * `page.meta.ts` + discovery only, not this file.
 */

export type CrmNavItem = {
  href: string
  label: string
  iconName?: string
  iconMarkup?: string
  order?: number
}

export type CrmNavGroup = {
  id: string
  label: string
  labelKey?: string
  order: number
  landing: string
  iconName?: string
  iconMarkup?: string
  items: CrmNavItem[]
}

export type CrmNavCategory = {
  id: string
  label: string
  labelKey?: string
  order: number
  items: CrmNavItem[]
}

export type CrmUtilityId = 'manage' | 'account'

export type CrmRailAction = {
  id: 'assistant'
  label: string
  action: 'open-ai-assistant'
  icon: string
  feature: string
}

export type CrmCatalog = {
  version: 2
  groups: CrmNavGroup[]
  /** Shell-level actions that are not pages (currently only the AI launcher). */
  railActions: CrmRailAction[]
  utility: Array<{ id: CrmUtilityId; label: string; href: string; icon: string }>
  manage: { categories: CrmNavCategory[] }
  personal: { items: CrmNavItem[] }
  /** Authorized entries with no usable owner — reported, never silently kept. */
  unknown: string[]
  /**
   * Settings-context entries no `settingsSections` entry claims — diagnostic,
   * never rendered. Optional in the type only so catalogue literals that predate
   * this diagnostic keep compiling; `buildCrmNavigation` always sets it.
   */
  unconfiguredSettings?: string[]
  /** Profile-context entries no `profileSections` entry claims — diagnostic, never rendered. */
  unconfiguredProfile?: string[]
  /** Visible page groups that the app-level catalogue has not organised yet. */
  unconfiguredGroups: string[]
  /** Create/import entries that belong in a page toolbar, not the navigation. */
  actions: string[]
  /** Every authorized href the upstream payload carried, for reachability checks. */
  authorized: string[]
  /** Repeated hrefs observed in the upstream payload; rendered only once. */
  duplicates: string[]
  /** The shell chrome fallback: the authorized directory could not be read. */
  error?: boolean
}

type PayloadItem = {
  id?: string
  href?: string
  title?: string
  label?: string
  defaultTitle?: string
  iconName?: string
  iconMarkup?: string
  pageContext?: string
  order?: number
  enabled?: boolean
  hidden?: boolean
  children?: PayloadItem[]
}

type PayloadGroup = { id?: string; name?: string; defaultName?: string; items?: PayloadItem[] }
type PayloadSection = { id?: string; label?: string; labelKey?: string; order?: number; items?: PayloadItem[] }

export type CoreNavPayload = {
  groups?: PayloadGroup[]
  settingsSections?: PayloadSection[]
  profileSections?: PayloadSection[]
  grantedFeatures?: string[]
  [key: string]: unknown
}

const ASSISTANT_ACTION: CrmRailAction = {
  id: 'assistant',
  label: 'AI助手',
  action: 'open-ai-assistant',
  icon: 'Sparkles',
  feature: 'ai_assistant.view',
}

function labelOf(item: PayloadItem): string {
  return (item.title ?? item.label ?? item.defaultTitle ?? item.href ?? '').trim()
}

function isBackendHref(href: unknown): href is string {
  return typeof href === 'string' && href.startsWith('/backend')
}

/**
 * The navigation context of a payload entry.
 *
 * Context comes only from the declaration (`pageContext` in page metadata). There
 * is deliberately no URL-shape fallback: a page's path must never decide whether
 * it is a settings destination, because that would let an undeclared page leak
 * into (or out of) the settings surface without any declaration.
 */
function declaredContext(item: PayloadItem): 'main' | 'settings' | 'profile' {
  if (item.pageContext === 'settings' || item.pageContext === 'admin') return 'settings'
  if (item.pageContext === 'profile') return 'profile'
  return 'main'
}

function isEnabled(item: PayloadItem): boolean {
  return item.enabled !== false
}

function compareItems(a: CrmNavItem, b: CrmNavItem): number {
  const ao = a.order ?? Number.MAX_SAFE_INTEGER
  const bo = b.order ?? Number.MAX_SAFE_INTEGER
  return ao - bo || a.label.localeCompare(b.label)
}

function compareCategories(a: CrmNavCategory, b: CrmNavCategory): number {
  return a.order - b.order || a.label.localeCompare(b.label)
}

function flattenPayloadItems(
  items: PayloadItem[] | undefined,
  options: { dailyOnly: boolean; actions: string[] },
): CrmNavItem[] {
  const result: CrmNavItem[] = []

  const visit = (entries: PayloadItem[] | undefined) => {
    for (const item of entries ?? []) {
      if (!isEnabled(item) || item.hidden === true) continue
      const href = isBackendHref(item.href) ? item.href : ''
      if (href) {
        if (options.dailyOnly && declaredContext(item) !== 'main') {
          // Settings/profile entries are built from their own server sections;
          // do not leak them into the daily rail.
        } else if (options.dailyOnly && (item.order == null || item.order === 10000)) {
          // The vendor serializer gives an undeclared page a fallback weight of
          // 10000. That is not a module-declared destination; it is an object
          // action reached from the list that owns it (or a missing declaration,
          // reported by the caller's action audit). An explicit order, however
          // small, is a declaration and stays in the navigation.
          options.actions.push(href)
        } else {
          result.push({
            href,
            label: labelOf(item) || href,
            iconName: item.iconName,
            iconMarkup: item.iconMarkup,
            order: item.order,
          })
        }
      }
      visit(item.children)
    }
  }

  visit(items)
  return result
}

function collectContextItems(
  items: PayloadItem[] | undefined,
  context: 'settings' | 'profile',
): CrmNavItem[] {
  const result: CrmNavItem[] = []
  const visit = (entries: PayloadItem[] | undefined) => {
    for (const item of entries ?? []) {
      if (isEnabled(item) && item.hidden !== true && isBackendHref(item.href) && declaredContext(item) === context) {
        result.push({
          href: item.href,
          label: labelOf(item) || item.href,
          iconName: item.iconName,
          iconMarkup: item.iconMarkup,
          order: item.order,
        })
      }
      visit(item.children)
    }
  }
  visit(items)
  return result
}

function collectAuthorized(payload: CoreNavPayload): Set<string> {
  const authorized = new Set<string>()
  const visit = (items: PayloadItem[] | undefined) => {
    for (const item of items ?? []) {
      if (isBackendHref(item.href)) authorized.add(item.href)
      visit(item.children)
    }
  }
  for (const group of payload.groups ?? []) visit(group.items)
  for (const section of payload.settingsSections ?? []) visit(section.items)
  for (const section of payload.profileSections ?? []) visit(section.items)
  return authorized
}

/**
 * Visible authorized hrefs: enabled entries the caller may see. Hidden entries do
 * not appear in the shell payload at all, but the catalogue must not report one as
 * unowned if a lower layer sent it for reachability bookkeeping.
 */
function collectVisibleAuthorized(payload: CoreNavPayload): Set<string> {
  const visible = new Set<string>()
  const visit = (items: PayloadItem[] | undefined) => {
    for (const item of items ?? []) {
      if (isEnabled(item) && item.hidden !== true && isBackendHref(item.href)) visible.add(item.href)
      visit(item.children)
    }
  }
  for (const group of payload.groups ?? []) visit(group.items)
  for (const section of payload.settingsSections ?? []) visit(section.items)
  for (const section of payload.profileSections ?? []) visit(section.items)
  return visible
}

/**
 * Build the CRM catalogue from the authorized server payload.
 *
 * Nothing here widens visibility: every href comes from the payload the shell
 * already filtered by tenant, organization, role and feature grants. The
 * `declared` argument only orchestrates page groups; it cannot add an href.
 */
export function buildCrmNavigation(
  payload: CoreNavPayload,
  declared: NavGroupSpec[] = NAV_GROUP_CATALOG,
): CrmCatalog {
  const groups: CrmNavGroup[] = []
  const manageCategories: CrmNavCategory[] = []
  const personalItems: CrmNavItem[] = []
  const unconfiguredGroups = new Set<string>()
  const actionHrefs: string[] = []
  const duplicates = new Set<string>()
  const rendered = new Set<string>()
  const authorized = collectAuthorized(payload)
  const visibleAuthorized = collectVisibleAuthorized(payload)

  const claim = (href: string): boolean => {
    if (rendered.has(href)) {
      duplicates.add(href)
      return false
    }
    rendered.add(href)
    return true
  }

  const specById = new Map(declared.map((spec) => [spec.id, spec]))
  const settingsFromGroups: CrmNavItem[] = []
  const profileFromGroups: CrmNavItem[] = []

  ;(payload.groups ?? []).forEach((group, groupIndex) => {
    const id = typeof group.id === 'string' ? group.id.trim() : ''
    settingsFromGroups.push(...collectContextItems(group.items, 'settings'))
    profileFromGroups.push(...collectContextItems(group.items, 'profile'))
    // A group without a declared id cannot render anything. Its entries are not
    // claimed, so they surface through the `unknown` diagnostic below instead of
    // being silently marked as rendered.
    if (!id) return
    const items: CrmNavItem[] = []
    for (const item of flattenPayloadItems(group.items, { dailyOnly: true, actions: actionHrefs })) {
      if (claim(item.href)) items.push(item)
      else duplicates.add(item.href)
    }
    items.sort(compareItems)

    if (items.length === 0) return

    const spec = specById.get(id)
    if (!spec) unconfiguredGroups.add(id)

    const landing = spec?.landing && items.some((item) => item.href === spec.landing)
      ? spec.landing
      : items[0].href
    const landingItem = items.find((item) => item.href === landing) ?? items[0]

    groups.push({
      id,
      label: spec?.label ?? group.name ?? group.defaultName ?? id,
      labelKey: spec?.labelKey,
      order: spec?.order ?? 1000 + groupIndex,
      landing,
      iconName: landingItem.iconName ?? items.find((item) => item.iconName)?.iconName,
      iconMarkup: landingItem.iconMarkup,
      items,
    })
  })

  ;(payload.settingsSections ?? []).forEach((section, index) => {
    const items = flattenPayloadItems(section.items, { dailyOnly: false, actions: actionHrefs })
      .filter((item) => claim(item.href))
      .sort(compareItems)
    if (items.length === 0) return
    manageCategories.push({
      id: section.id ?? `settings.section.${index}`,
      label: section.label ?? section.labelKey ?? section.id ?? `settings.section.${index}`,
      labelKey: section.labelKey,
      order: section.order ?? index,
      items,
    })
  })
  // A settings-context entry that no `settingsSections` entry claims is a
  // declaration gap. It must not be rendered into a catch-all and must not be
  // dropped: it is exposed as `unconfiguredSettings` (and remains unclaimed, so
  // it also surfaces in `unknown`). No 'settings.sections.other' bucket exists.
  const unconfiguredSettings = settingsFromGroups
    .filter((item) => !rendered.has(item.href))
    .map((item) => item.href)
    .sort()
  manageCategories.sort(compareCategories)

  ;(payload.profileSections ?? []).forEach((section) => {
    const items = flattenPayloadItems(section.items, { dailyOnly: false, actions: actionHrefs })
      .filter((item) => claim(item.href))
      .sort(compareItems)
    personalItems.push(...items)
  })

  // Same contract for the profile context: unclaimed profile entries are a
  // diagnostic, not something to auto-render into the account surface.
  const unconfiguredProfile = profileFromGroups
    .filter((item) => !rendered.has(item.href))
    .map((item) => item.href)
    .sort()
  personalItems.sort(compareItems)

  // An authorized, visible entry that no rendered surface claims and that is not
  // a page-toolbar action has no owner or in-page home: report it, never drop it.
  const claimed = new Set<string>([...rendered, ...actionHrefs])
  const unknown = [...visibleAuthorized].filter((href) => !claimed.has(href)).sort()

  const features = new Set(Array.isArray(payload.grantedFeatures) ? payload.grantedFeatures : [])
  const railActions = features.has(ASSISTANT_ACTION.feature) ? [ASSISTANT_ACTION] : []

  const utility: CrmCatalog['utility'] = []
  if (manageCategories.some((category) => category.items.length > 0)) {
    utility.push({ id: 'manage', label: '管理中心', href: '/backend/manage', icon: 'Settings' })
  }
  if (personalItems.length > 0) {
    utility.push({ id: 'account', label: '个人账户', href: '/backend/profile', icon: 'UserCircle' })
  }

  return {
    version: 2,
    groups: groups.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label)),
    railActions,
    utility,
    manage: { categories: manageCategories },
    personal: { items: personalItems.sort(compareItems) },
    unknown,
    unconfiguredSettings,
    unconfiguredProfile,
    unconfiguredGroups: [...unconfiguredGroups].sort(),
    actions: [...new Set(actionHrefs)].sort(),
    authorized: [...authorized].sort(),
    duplicates: [...duplicates].sort(),
  }
}

/**
 * Read the app catalogue from a backend chrome payload.
 *
 * Returns `null` for "not the CRM payload" (old shell, failed request, or a
 * payload without `crm`). Callers must not substitute a default catalogue:
 * loading, failure and an explicitly empty authorization are three different
 * states and only the third is rendered as an empty rail.
 */
export function readCrmCatalog(payload: unknown): CrmCatalog | null {
  if (!payload || typeof payload !== 'object') return null
  const candidate = (payload as { crm?: unknown }).crm
  if (!candidate || typeof candidate !== 'object') return null
  const catalog = candidate as CrmCatalog
  return catalog.version === 2 &&
    Array.isArray(catalog.groups) &&
    Array.isArray(catalog.railActions) &&
    Array.isArray(catalog.utility)
    ? catalog
    : null
}

export type CrmRailState = {
  state: 'loading' | 'error' | 'ready'
  groups: CrmNavGroup[]
  railActions: CrmRailAction[]
  utility: CrmCatalog['utility']
}

/**
 * Resolve the rail from the three real states.
 *
 * - loading: no groups yet (skeleton), never the full static list;
 * - error: no groups (retry affordance owned by the caller);
 * - ready: exactly what the authorized catalogue says, including an empty list.
 */
export function selectRail(catalog: CrmCatalog | null, isLoading: boolean): CrmRailState {
  if (catalog?.error) return { state: 'error', groups: [], railActions: [], utility: [] }
  if (catalog) {
    return {
      state: 'ready',
      groups: catalog.groups,
      railActions: catalog.railActions ?? [],
      utility: catalog.utility ?? [],
    }
  }
  if (isLoading) return { state: 'loading', groups: [], railActions: [], utility: [] }
  return { state: 'error', groups: [], railActions: [], utility: [] }
}

function matchesPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Resolve the current top-level group from the declared catalogue. This is a
 * longest-prefix match over the entries the module declarations produced; it is
 * not a static route-owner table.
 */
export function selectActiveGroup(catalog: CrmCatalog | null, pathname: string): CrmNavGroup | null {
  if (!catalog) return null
  if (pathname === '/backend') {
    return catalog.groups.find((group) => group.id === 'home') ?? null
  }
  let best: CrmNavGroup | null = null
  let bestLength = -1
  for (const group of catalog.groups) {
    for (const href of [group.landing, ...group.items.map((item) => item.href)]) {
      if (!matchesPath(pathname, href)) continue
      if (href.length > bestLength) {
        best = group
        bestLength = href.length
      }
    }
  }
  return best
}

/** Navigation is hidden from the rail; this says whether an entry is still reachable. */
export function isAuthorizedHref(href: string, catalog: CrmCatalog | null): boolean {
  return Boolean(catalog?.authorized.includes(href))
}
