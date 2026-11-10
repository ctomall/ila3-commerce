import catalog from './nav-groups.json'
import settingsTable from './settings-sections.json'

/**
 * Resolve a page's declared `pageGroupKey` to its one primary owner.
 *
 * This is the single ownership rule behind the declared CRM navigation:
 *   - a container (business sidebar group) owns the page-group keys listed as its
 *     `members` in `nav-groups.json`;
 *   - a management category owns the partition id declared in
 *     `settings-sections.json`;
 *   - the account section owns `profile.sections.account`.
 *
 * An unknown key resolves to `null` on purpose: the caller must report the entry
 * as unconfigured instead of dropping it or folding it into a catch-all. The
 * catalog itself never lists an href, so this function is the only mapping from
 * a declared page classification to a rendered container.
 */
export type NavOwnerKind = 'container' | 'category' | 'account'

export type NavOwner = {
  kind: NavOwnerKind
  /** Rendered container/category/account id. */
  id: string
  /** The page-group key that resolved here. */
  key: string
  order: number
}

type NavGroupSpec = {
  id: string
  label: string
  labelKey?: string
  order: number
  landing?: string
  members: string[]
}

type CategorySpec = { id: string; label: string; labelKey: string; order: number }

export const ACCOUNT_SECTION_KEY = 'profile.sections.account'

const containers = catalog as NavGroupSpec[]
const categories = settingsTable as Record<string, CategorySpec>

const containerByMember = new Map<string, { id: string; order: number }>()
for (const container of containers) {
  for (const member of container.members) {
    containerByMember.set(member, { id: container.id, order: container.order })
  }
}

export function resolveNavOwner(key: string | null | undefined): NavOwner | null {
  if (!key) return null
  const container = containerByMember.get(key)
  if (container) return { kind: 'container', id: container.id, key, order: container.order }
  const category = categories[key]
  if (category) return { kind: 'category', id: category.id, key, order: category.order }
  if (key === ACCOUNT_SECTION_KEY) return { kind: 'account', id: key, key, order: 0 }
  return null
}

export function declaredContainerIds(): string[] {
  return containers.map((container) => container.id)
}

export function declaredContainerMembers(): string[] {
  return containers.flatMap((container) => container.members)
}

export function declaredCategoryIds(): string[] {
  return Object.values(categories)
    .sort((a, b) => a.order - b.order)
    .map((category) => category.id)
}

export function declaredCategoryKeys(): string[] {
  return Object.keys(categories)
}
