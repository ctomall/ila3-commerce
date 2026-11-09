import sceneMap from './scene-map.json'

/**
 * CRM scene catalogue: the single place that turns the authorized backend nav
 * payload into the five-scene information architecture.
 *
 * The shell used to render the flat page-group list (four groups, ~130 entries
 * for an administrator, with nested children). Here the same authorized
 * entries are re-bucketed:
 *
 *   left rail (five scenes)  ->  content-area second level
 *   management centre         ->  categorized + searchable
 *   account area             ->  profile sections
 *
 * Ownership is declared per href in `scene-map.json`; an href with no decision
 * is reported as `unknown` and is never rendered. That is deliberately not a
 * prefix/fallback fallback: a new module must be mapped (and the CI check will
 * fail) instead of silently landing in a catch-all group.
 */

export type SceneId = 'workbench' | 'assistant' | 'customers' | 'business' | 'messages'
export type SurfaceId = SceneId | 'manage' | 'personal'

export type SceneMapEntry = {
  surface: SurfaceId
  category?: string
  tab?: string
  disposition: 'nav' | 'in-page-action'
}

export type SceneMap = {
  version: number
  scenes: Array<{ id: SceneId; label: string; order: number; href?: string; action?: string; icon: string }>
  utility: Array<{ id: 'manage' | 'account'; label: string; href: string; icon: string }>
  customers: {
    tabs: Array<{ id: string; label: string; href: string }>
    related: Array<{ id: string; label: string; hrefs: string[] }>
  }
  businessCategories: Array<{ id: string; label: string; order: number }>
  manageCategories: Array<{ id: string; label: string; order: number }>
  entries: Record<string, SceneMapEntry>
}

export const SCENE_MAP = sceneMap as SceneMap

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
  children?: PayloadItem[]
}

type PayloadGroup = { id?: string; name?: string; items?: PayloadItem[] }
type PayloadSection = { id?: string; label?: string; items?: PayloadItem[] }

export type CoreNavPayload = {
  groups?: PayloadGroup[]
  settingsSections?: PayloadSection[]
  profileSections?: PayloadSection[]
  grantedFeatures?: string[]
  [key: string]: unknown
}

export type CrmNavItem = {
  href: string
  label: string
  iconName?: string
  children?: CrmNavItem[]
}

export type CrmNavCategory = {
  id: string
  label: string
  order: number
  items: CrmNavItem[]
}

export type CrmSceneLink = {
  id: SceneId
  label: string
  order: number
  href?: string
  action?: string
  icon: string
}

export type CrmCatalog = {
  scenes: CrmSceneLink[]
  utility: Array<{ id: 'manage' | 'account'; label: string; href: string; icon: string }>
  customers: {
    tabs: Array<{ id: string; label: string; href: string }>
    followup: CrmNavItem[]
    insights: CrmNavItem[]
  }
  business: { categories: CrmNavCategory[] }
  messages: { items: CrmNavItem[] }
  manage: { categories: CrmNavCategory[] }
  personal: { items: CrmNavItem[] }
  /** Authorized entries with no explicit owner — surfaced, never rendered. */
  unknown: string[]
  /** Create/import/export entries that belong in the page toolbar, not the nav. */
  actions: string[]
  /** Every authorized href the payload carried, for content-level link checks. */
  authorized: string[]
}

type Candidate = {
  href: string
  label: string
  iconName?: string
  spec: SceneMapEntry
  order: number
  parentHref?: string
  nested: boolean
  children: Candidate[]
}

function labelOf(item: PayloadItem): string {
  return (item.title ?? item.label ?? item.defaultTitle ?? item.href ?? '').trim()
}

function categoryIndex(categories: Array<{ id: string; label: string; order: number }>, id: string | undefined) {
  if (!id) return null
  return categories.find((category) => category.id === id) ?? null
}

function toItems(candidates: Candidate[]): CrmNavItem[] {
  return candidates
    .filter((candidate) => !candidate.nested)
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
    .map((candidate) => ({
      href: candidate.href,
      label: candidate.label,
      iconName: candidate.iconName,
      children: candidate.children.length
        ? candidate.children
            .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
            .map((child) => ({ href: child.href, label: child.label, iconName: child.iconName }))
        : undefined,
    }))
}

/**
 * Build the CRM catalogue from the *authorized* server payload.
 *
 * Nothing here widens visibility: every href comes from the payload the shell
 * already filtered by tenant, organization, role and feature grants.
 */
export function buildCrmNavigation(payload: CoreNavPayload, map: SceneMap = SCENE_MAP): CrmCatalog {
  const unknown = new Set<string>()
  const actions: string[] = []
  const seen = new Set<string>()
  const candidates: Candidate[] = []

  const visit = (items: PayloadItem[] | undefined, parentHref?: string) => {
    for (const item of items ?? []) {
      const href = typeof item.href === 'string' ? item.href : ''
      if (href) {
        const spec = map.entries[href]
        if (!spec) {
          unknown.add(href)
        } else if (spec.disposition === 'in-page-action') {
          actions.push(href)
        } else if (!seen.has(href)) {
          seen.add(href)
          candidates.push({
            href,
            label: labelOf(item),
            iconName: item.iconName,
            spec,
            order: candidates.length,
            parentHref,
            nested: false,
            children: [],
          })
        }
      }
      visit(item.children, href || parentHref)
    }
  }

  for (const group of payload.groups ?? []) visit(group.items)
  for (const section of payload.settingsSections ?? []) visit(section.items)
  for (const section of payload.profileSections ?? []) visit(section.items)

  // Attach children to a parent that lives on the same surface + category, so a
  // category page keeps its one-level grouping without re-introducing a tree.
  const byHref = new Map(candidates.map((candidate) => [candidate.href, candidate]))
  for (const candidate of candidates) {
    if (!candidate.parentHref) continue
    const parent = byHref.get(candidate.parentHref)
    if (!parent) continue
    if (parent.spec.surface !== candidate.spec.surface) continue
    if ((parent.spec.category ?? '') !== (candidate.spec.category ?? '')) continue
    if ((parent.spec.tab ?? '') !== (candidate.spec.tab ?? '')) continue
    parent.children.push(candidate)
    candidate.nested = true
  }

  const surface = (id: SurfaceId) => candidates.filter((candidate) => candidate.spec.surface === id)
  const byCategory = (id: SurfaceId, categories: Array<{ id: string; label: string; order: number }>): CrmNavCategory[] => {
    const groups = new Map<string, Candidate[]>()
    for (const candidate of surface(id)) {
      const category = candidate.spec.category
      if (!category || !categoryIndex(categories, category)) {
        unknown.add(candidate.href)
        continue
      }
      const bucket = groups.get(category) ?? []
      bucket.push(candidate)
      groups.set(category, bucket)
    }
    return categories
      .filter((category) => (groups.get(category.id)?.length ?? 0) > 0)
      .map((category) => ({
        id: category.id,
        label: category.label,
        order: category.order,
        items: toItems(groups.get(category.id) ?? []),
      }))
  }

  const customers = surface('customers')
  const customerField = (tab: string) =>
    toItems(customers.filter((candidate) => candidate.spec.tab === tab && !candidate.nested))
  const tabs = map.customers.tabs.filter((tab) => customers.some((candidate) => candidate.href === tab.href))

  const business = byCategory('business', map.businessCategories)
  const manage = byCategory('manage', map.manageCategories)
  const messages = toItems(surface('messages'))
  const personal = toItems(surface('personal'))

  const features = new Set(Array.isArray(payload.grantedFeatures) ? payload.grantedFeatures : [])
  const scenes: CrmSceneLink[] = map.scenes
    .filter((scene) => {
      if (scene.id === 'assistant') return features.has('ai_assistant.view')
      if (scene.id === 'customers') return tabs.length > 0 || customerField('followup').length > 0 || customerField('insights').length > 0
      if (scene.id === 'business') return business.length > 0
      if (scene.id === 'messages') return messages.length > 0
      return true
    })
    .sort((a, b) => a.order - b.order)
    .map(({ id, label, order, href, action, icon }) => ({ id, label, order, href, action, icon }))

  const utility = map.utility.filter((item) => (item.id === 'manage' ? manage.length > 0 : true))

  return {
    scenes,
    utility,
    customers: {
      tabs,
      followup: customerField('followup'),
      insights: customerField('insights'),
    },
    business: { categories: business },
    messages: { items: messages },
    manage: { categories: manage },
    personal: { items: personal },
    unknown: [...unknown].sort(),
    actions: [...new Set(actions)].sort(),
    authorized: [...seen].sort(),
  }
}

/** Navigation is hidden from the rail; this says whether an entry is still reachable. */
export function isMappedHref(href: string, map: SceneMap = SCENE_MAP): boolean {
  return Boolean(map.entries[href])
}
