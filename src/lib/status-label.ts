/**
 * Display labels for enum-like values that the backend stores as raw codes.
 *
 * Why this exists: the customers list/dashboard render `healthy`, `monitor`,
 * `in_progress`, `open`, `win`, `lost` verbatim because custom-field `select`
 * values have no label mapping — the Chinese translations exist under
 * `customers.companies.detail.health.*`, but the table cell never consults them.
 *
 * Contract:
 *   - input stays the raw code (never mutate stored data)
 *   - known values map to a localized label
 *   - unknown values return FALLBACK and are reported through `onUnknown`
 *     so drift shows up in monitoring instead of leaking raw enums to the UI
 *
 * Deliberately dependency-free so it is usable from server components, client
 * components and scripts alike.
 */

export const UNKNOWN_LABEL = '—'

export type LabelGroup = 'health' | 'dealStatus' | 'lifecycleStage'

type LabelMap = Readonly<Record<string, string>>

const HEALTH: LabelMap = {
  healthy: '良好',
  monitor: '需关注',
  at_risk: '有风险',
  atrisk: '有风险',
}

const DEAL_STATUS: LabelMap = {
  open: '进行中',
  in_progress: '进行中',
  won: '赢单',
  win: '赢单',
  lost: '丢单',
  closed: '已关闭',
}

const LIFECYCLE_STAGE: LabelMap = {
  prospect: '潜在客户',
  customer: '客户',
  churned: '已流失',
}

const GROUPS: Readonly<Record<LabelGroup, LabelMap>> = {
  health: HEALTH,
  dealStatus: DEAL_STATUS,
  lifecycleStage: LIFECYCLE_STAGE,
}

export type StatusLabelOptions = {
  /** Called for values that have no mapping — wire this to monitoring. */
  onUnknown?: (group: LabelGroup, value: string) => void
}

/** Normalize a raw value into the lookup key used by the maps. */
export function normalizeStatusValue(value: unknown): string {
  if (value == null) return ''
  return String(value).trim().toLowerCase().replace(/[\s-]+/g, '_')
}

/**
 * Resolve a localized label for `value` in `group`.
 * Returns `null` when the group is unknown or the value is empty, so callers can
 * fall back to their own rendering (e.g. leave a blank cell) without pretending
 * they found a label.
 */
export function statusLabel(
  group: LabelGroup,
  value: unknown,
  options: StatusLabelOptions = {},
): string | null {
  const key = normalizeStatusValue(value)
  if (!key) return null
  const map = GROUPS[group]
  if (!map) return null
  const label = map[key]
  if (label) return label
  // Try the un-normalized form too: "at-risk" normalizes to at_risk, but a
  // value like "AtRisk" normalizes to atrisk which HEALTH also covers.
  const direct = map[key.replace(/_/g, '')]
  if (direct) return direct
  options.onUnknown?.(group, key)
  return UNKNOWN_LABEL
}

/** All labels for a group — useful for filter dropdowns and tests. */
export function statusLabels(group: LabelGroup): Readonly<Record<string, string>> {
  return GROUPS[group]
}
