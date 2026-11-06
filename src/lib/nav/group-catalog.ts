import catalog from '../../nav/nav-groups.json'
import { applyGroupCatalog as applyGroupCatalogImpl } from '../../nav/logic.js'

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
  // The rules live in src/nav/logic.mjs, which the managed patch also installs into the
  // shell, so tests and runtime cannot drift apart.
  return applyGroupCatalogImpl(groups, NAV_GROUP_CATALOG) as ShellGroup[]
}
