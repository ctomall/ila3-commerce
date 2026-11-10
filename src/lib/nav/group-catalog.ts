import catalog from '../../nav/nav-groups.json'
import { applyGroupCatalog as applyGroupCatalogImpl } from '../../nav/logic.js'

/**
 * Group catalogue: how page groups declared by modules collapse into the top-level
 * navigation a person actually sees.
 *
 * This is app-level organisation only. It names module page groups (`pageGroupKey`)
 * and never individual hrefs, so a module that adds a page keeps its own title,
 * icon, order, permission and visibility. Groups that are not named here are
 * appended unchanged by the shell extension and reported by the CRM catalogue;
 * they are never silently dropped.
 *
 * The same rules run inside the shell's payload builder (kept in sync by a managed
 * patch), but the contract lives here: it is data plus a pure function, so the
 * ordering and merging can be tested without a running server.
 */
export type NavGroupSpec = {
  id: string
  label: string
  labelKey?: string
  order: number
  /** Optional high-frequency destination. Falls back to the first authorized item. */
  landing?: string
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

export function applyGroupCatalog(
  groups: ReadonlyArray<ShellGroup>,
  translate?: (key: string | undefined, fallback: string) => string,
): ShellGroup[] {
  // The rules live in src/nav/logic.mjs, which the managed patch also installs into the
  // shell, so tests and runtime cannot drift apart. `translate` resolves a container's
  // labelKey (a container merges several module groups, so it has no own name).
  return applyGroupCatalogImpl(groups, NAV_GROUP_CATALOG, translate) as ShellGroup[]
}
