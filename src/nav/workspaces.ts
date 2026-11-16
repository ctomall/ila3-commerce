import { shellHref } from './shell-chrome'
import { hasFeature } from '@open-mercato/shared/security/features'
import configuration from './workspaces.json'
import type { CrmNavGroup, CrmNavItem } from './crm-navigation'

/** Presentation only: members reference authorized group identities, never new hrefs. */
export type WorkspaceSpec = {
  id: string
  label: string
  labelKey?: string
  order: number
  members: string[]
}
export type Workspace = {
  id: string
  label: string
  labelKey?: string
  order: number
  landing: string
  configured: boolean
  groups: CrmNavGroup[]
}
export const WORKSPACE_CONFIGURATION: WorkspaceSpec[] = configuration

export function buildWorkspaces(
  groups: readonly CrmNavGroup[],
  specs: readonly WorkspaceSpec[] = WORKSPACE_CONFIGURATION,
): Workspace[] {
  const members = new Set<string>()
  const ids = new Set<string>()
  for (const spec of specs) {
    if (!spec.id || ids.has(spec.id) || spec.id.startsWith('module:') || !spec.label ||
      !Number.isFinite(spec.order) || !Array.isArray(spec.members)) {
      throw new Error('Invalid workspace configuration')
    }
    ids.add(spec.id)
    for (const member of spec.members) {
      if (!member || members.has(member)) throw new Error('Ambiguous workspace membership')
      members.add(member)
    }
  }
  const result: Workspace[] = []
  for (const spec of specs) {
    const owned = groups.filter(group => spec.members.includes(group.id) && group.items.length > 0)
    if (!owned.length) continue
    result.push({ id: spec.id, label: spec.label, labelKey: spec.labelKey,
      order: spec.order, landing: owned[0].landing, configured: true, groups: owned })
  }
  for (const group of groups) {
    if (members.has(group.id) || !group.items.length) continue
    result.push({ id: `module:${group.id}`, label: group.label, labelKey: group.labelKey,
      order: 10000 + group.order, landing: group.landing, configured: false, groups: [group] })
  }
  return result.sort((a,b) => a.order - b.order || a.id.localeCompare(b.id))
}

/** `/backend` is exact-only, not an owner of every unknown detail route. */
export function selectWorkspace(spaces: readonly Workspace[], pathname: string): Workspace | null {
  let best: Workspace | null = null
  let length = -1
  for (const space of spaces) for (const group of space.groups) {
    for (const declaredHref of [group.landing, ...group.items.map(item => item.href)]) {
      const href = shellHref(declaredHref)
      const match = pathname === declaredHref || pathname === href || (href !== '/backend' && pathname.startsWith(`${href}/`))
      if (match && href.length > length) { best = space; length = href.length }
    }
  }
  return best
}

export type WorkspaceSearchEntry = CrmNavItem & { workspaceId: string; workspaceLabel: string }
export function searchWorkspaceEntries(spaces: readonly Workspace[], query: string): WorkspaceSearchEntry[] {
  const needle = query.trim().toLocaleLowerCase()
  const seen = new Set<string>()
  const result: WorkspaceSearchEntry[] = []
  for (const space of spaces) for (const group of space.groups) for (const item of group.items) {
    if (seen.has(item.href)) continue
    if (needle && ![item.label, item.href, group.label, space.label].some(value => value.toLocaleLowerCase().includes(needle))) continue
    seen.add(item.href)
    result.push({ ...item, workspaceId: space.id, workspaceLabel: space.label })
  }
  return result
}


export type WorkspaceRecommendation = { workspaceId: string; features: string[] }
/** Recommendations never filter or authorize: only reorder already visible spaces. */
export function recommendWorkspaces(
  spaces: readonly Workspace[],
  grantedFeatures: readonly string[],
  rules: readonly WorkspaceRecommendation[],
): Workspace[] {
  const scores = new Map<string, number>()
  for (const rule of rules) {
    scores.set(rule.workspaceId, (scores.get(rule.workspaceId) ?? 0) +
      rule.features.filter(feature => hasFeature(grantedFeatures, feature)).length)
  }
  return [...spaces].sort((a,b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || a.order - b.order)
}
