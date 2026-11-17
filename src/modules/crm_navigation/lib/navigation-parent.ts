import type { CrmCatalog, CrmNavItem } from '@/nav/crm-navigation'
import { shellHref } from '@/nav/shell-chrome'

/** Only destinations already supplied by the authorized catalogue may be parents. */
export function navigationParent(catalog: CrmCatalog | null, pathname: string): CrmNavItem | null {
  if (!catalog || catalog.error || !pathname.startsWith('/backend/')) return null
  const entries = [
    ...catalog.groups.flatMap(group => group.items),
    ...catalog.manage.categories.flatMap(category => category.items),
    ...catalog.personal.items,
  ]
  let best: CrmNavItem | null = null
  for (const item of entries) {
    const href = shellHref(item.href)
    if (href === '/backend' || pathname === href || !pathname.startsWith(href + '/')) continue
    if (!best || href.length > best.href.length) best = { ...item, href }
  }
  return best
}
