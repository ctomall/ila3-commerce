import catalog from '../../nav/nav-groups.json'

/**
 * Group catalogue: how page groups from module metadata collapse into the sidebar
 * sections a person actually sees.
 *
 * The same rules run inside the shell's payload builder (kept in sync by a managed
 * patch), but the contract lives here: it is data plus a pure function, so the
 * ordering and merging can be tested without a running server.
 */
export type NavGroupSpec = {
  id: string
  label: string
  order: number
  members: string[]
}

export type ShellGroup = {
  id: string
  name?: string
  defaultName?: string
  weight?: number
  items?: unknown[]
}

export const NAV_GROUP_CATALOG = catalog as NavGroupSpec[]

export function applyGroupCatalog(groups: ReadonlyArray<ShellGroup>): ShellGroup[] {
  const byId = new Map(groups.map((group) => [group.id, group]))
  const consumed = new Set<string>()
  const merged: ShellGroup[] = []

  for (const spec of NAV_GROUP_CATALOG) {
    const items: unknown[] = []
    for (const member of spec.members) {
      const group = byId.get(member)
      if (!group) continue
      consumed.add(member)
      items.push(...(group.items ?? []))
    }
    if (items.length === 0) continue
    merged.push({
      id: spec.id,
      name: spec.label,
      defaultName: spec.label,
      weight: spec.order,
      items,
    })
  }

  // Anything the catalogue does not know about stays visible: a module that ships
  // later must never disappear because the catalogue is stale.
  for (const group of groups) {
    if (!consumed.has(group.id)) merged.push(group)
  }
  return merged
}
