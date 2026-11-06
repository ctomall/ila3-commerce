/**
 * Single source for the two navigation transformations.
 *
 * Both are copied into the shell by a managed patch and imported by the typed
 * wrappers under src/lib/nav, so the rules exist once instead of twice. Keep this
 * file dependency-free and plain JavaScript: it runs inside the package.
 */

/**
 * Collapse module settings partitions into the short list people scan.
 * `table` maps a partition id (or labelKey) to { id, label, labelKey, order }.
 */
export function mergeSettingsSections(groups, table) {
  if (!Array.isArray(groups)) return groups
  const merged = new Map()
  for (const group of groups) {
    if (!group) continue
    const target = table[group.labelKey] || table[group.id]
    const id = target ? target.id : group.id
    const labelKey = target ? target.labelKey : group.labelKey
    const label = target ? target.label : group.label
    const order = target ? target.order : group.order
    if (!merged.has(id)) merged.set(id, { id, label, labelKey, order, items: [] })
    const bucket = merged.get(id)
    if (Array.isArray(group.items)) bucket.items.push(...group.items)
  }
  return Array.from(merged.values()).sort(
    (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER),
  )
}

/**
 * Collapse page groups into the sidebar sections declared in the catalogue.
 * Groups the catalogue does not mention are appended unchanged, so a module that
 * ships later stays visible.
 */
export function applyGroupCatalog(groups, catalog) {
  const byId = new Map(groups.map((group) => [group.id, group]))
  const consumed = new Set()
  const merged = []
  for (const spec of catalog) {
    const items = []
    for (const member of spec.members ?? []) {
      const group = byId.get(member)
      if (!group) continue
      consumed.add(member)
      items.push(...(group.items ?? []))
    }
    if (items.length === 0) continue
    merged.push({ id: spec.id, name: spec.label, defaultName: spec.label, weight: spec.order, items })
  }
  for (const group of groups) if (!consumed.has(group.id)) merged.push(group)
  return merged
}
