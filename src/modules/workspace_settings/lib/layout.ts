import type { Workspace } from '@/nav/workspaces'

export type WorkspacePreset = {
  id: string
  name: string
  /** Ordered workspace ids; anything not authorized is dropped on read. */
  workspaces: string[]
  landing: string | null
}

export type WorkspaceLayoutConfig = {
  version: 1
  order: string[]
  hidden: string[]
  labels: Record<string, string>
  presets: WorkspacePreset[]
  /** userId -> preset ids the administrator handed out. */
  assignments: Record<string, string[]>
}

export const EMPTY_LAYOUT: WorkspaceLayoutConfig = {
  version: 1,
  order: [],
  hidden: [],
  labels: {},
  presets: [],
  assignments: {},
}

const ID = /^[a-z0-9][a-z0-9._:-]{0,63}$/
const LABEL_MAX = 60
const FAVORITE_MAX = 100
const PRESET_MAX = 50
const ASSIGNMENT_MAX = 200

export type LayoutParse =
  | { ok: true; config: WorkspaceLayoutConfig }
  | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringList(value: unknown, field: string, max: number): string[] | string {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return `${field} must be an array`
  if (value.length > max) return `${field} accepts at most ${max} entries`
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string' || !ID.test(entry)) return `${field} contains an invalid id`
    if (!out.includes(entry)) out.push(entry)
  }
  return out
}

/**
 * Strict parse for the management API. A stored document is read with
 * `parseLayoutConfig`, which falls back to the code defaults instead of failing
 * a navigation request because one label is too long.
 */
export function normalizeLayoutConfig(input: unknown): LayoutParse {
  if (input === undefined || input === null) return { ok: true, config: EMPTY_LAYOUT }
  if (!isRecord(input)) return { ok: false, error: 'layout must be an object' }

  const order = stringList(input.order, 'order', PRESET_MAX)
  if (typeof order === 'string') return { ok: false, error: order }
  const hidden = stringList(input.hidden, 'hidden', PRESET_MAX)
  if (typeof hidden === 'string') return { ok: false, error: hidden }

  const labels: Record<string, string> = {}
  if (input.labels !== undefined && input.labels !== null) {
    if (!isRecord(input.labels)) return { ok: false, error: 'labels must be an object' }
    for (const [key, value] of Object.entries(input.labels)) {
      if (!ID.test(key)) return { ok: false, error: 'labels contains an invalid workspace id' }
      if (typeof value !== 'string') return { ok: false, error: `label for ${key} must be a string` }
      const trimmed = value.trim()
      if (trimmed.length === 0) continue
      if (trimmed.length > LABEL_MAX) return { ok: false, error: `label for ${key} is too long` }
      labels[key] = trimmed
    }
  }

  const presets: WorkspacePreset[] = []
  if (input.presets !== undefined && input.presets !== null) {
    if (!Array.isArray(input.presets)) return { ok: false, error: 'presets must be an array' }
    if (input.presets.length > PRESET_MAX) return { ok: false, error: `presets accepts at most ${PRESET_MAX} entries` }
    const seen = new Set<string>()
    for (const entry of input.presets) {
      if (!isRecord(entry)) return { ok: false, error: 'preset must be an object' }
      const id = typeof entry.id === 'string' ? entry.id : ''
      if (!ID.test(id)) return { ok: false, error: 'preset id is invalid' }
      if (seen.has(id)) return { ok: false, error: `preset ${id} is duplicated` }
      seen.add(id)
      const name = typeof entry.name === 'string' ? entry.name.trim() : ''
      if (name.length === 0 || name.length > LABEL_MAX) return { ok: false, error: `preset ${id} needs a name` }
      const workspaces = stringList(entry.workspaces, `preset ${id} workspaces`, PRESET_MAX)
      if (typeof workspaces === 'string') return { ok: false, error: workspaces }
      if (workspaces.length === 0) return { ok: false, error: `preset ${id} needs at least one workspace` }
      let landing: string | null = null
      if (entry.landing !== undefined && entry.landing !== null && entry.landing !== '') {
        if (typeof entry.landing !== 'string' || !entry.landing.startsWith('/backend')) {
          return { ok: false, error: `preset ${id} landing must be a backend path` }
        }
        if (entry.landing.length > 2048) return { ok: false, error: `preset ${id} landing is too long` }
        landing = entry.landing
      }
      presets.push({ id, name, workspaces, landing })
    }
  }

  const assignments: Record<string, string[]> = {}
  if (input.assignments !== undefined && input.assignments !== null) {
    if (!isRecord(input.assignments)) return { ok: false, error: 'assignments must be an object' }
    const entries = Object.entries(input.assignments)
    if (entries.length > ASSIGNMENT_MAX) return { ok: false, error: 'assignments accepts at most 200 users' }
    const known = new Set(presets.map((preset) => preset.id))
    for (const [userId, value] of entries) {
      if (userId.length === 0 || userId.length > 64 || !/^[A-Za-z0-9._:-]+$/.test(userId)) {
        return { ok: false, error: 'assignments contains an invalid user id' }
      }
      const ids = stringList(value, `assignments for ${userId}`, PRESET_MAX)
      if (typeof ids === 'string') return { ok: false, error: ids }
      const kept = ids.filter((id) => known.has(id))
      if (kept.length !== ids.length) return { ok: false, error: `assignments for ${userId} reference an unknown preset` }
      if (kept.length > 0) assignments[userId] = kept
    }
  }

  return { ok: true, config: { version: 1, order, hidden, labels, presets, assignments } }
}

/**
 * Read path: never throws and never lets a bad document widen what is shown.
 * An unreadable document is the same as no document (code defaults).
 */
export function parseLayoutConfig(input: unknown): WorkspaceLayoutConfig {
  const parsed = normalizeLayoutConfig(input)
  return parsed.ok ? parsed.config : EMPTY_LAYOUT
}

export function applyLayout(
  spaces: readonly Workspace[],
  config: WorkspaceLayoutConfig,
): { visible: Workspace[]; ordered: Workspace[] } {
  const labelled = spaces.map((space) =>
    config.labels[space.id] ? { ...space, label: config.labels[space.id], labelKey: undefined } : space,
  )
  const rank = new Map(config.order.map((id, index) => [id, index]))
  const ordered = [...labelled].sort((a, b) => {
    const ra = rank.get(a.id)
    const rb = rank.get(b.id)
    if (ra !== undefined && rb !== undefined) return ra - rb
    if (ra !== undefined) return -1
    if (rb !== undefined) return 1
    return a.order - b.order || a.id.localeCompare(b.id)
  })
  const hidden = new Set(config.hidden)
  return { ordered, visible: ordered.filter((space) => !hidden.has(space.id)) }
}

/** Presets handed to this employee, filtered to the given ids. */
export function assignedPresets(
  config: WorkspaceLayoutConfig,
  userId: string,
  known: ReadonlySet<string>,
): WorkspacePreset[] {
  const ids = config.assignments[userId] ?? []
  return ids
    .filter((id) => known.has(id))
    .map((id) => config.presets.find((preset) => preset.id === id))
    .filter((preset): preset is WorkspacePreset => Boolean(preset))
}

/**
 * Project a preset onto the caller's authorized spaces. A preset is a
 * presentation choice: ids the caller cannot see are dropped, never granted.
 */
export function resolvePresetSpaces(
  preset: WorkspacePreset,
  spaces: readonly Workspace[],
): { spaces: Workspace[]; landing: string | null } {
  const byId = new Map(spaces.map((space) => [space.id, space]))
  const resolved: Workspace[] = []
  for (const id of preset.workspaces) {
    const space = byId.get(id)
    if (space) resolved.push(space)
  }
  const landing = preset.landing && resolved.some((space) =>
    space.landing === preset.landing || space.groups.some((group) =>
      group.items.some((item) => item.href === preset.landing)))
    ? preset.landing
    : resolved[0]?.landing ?? null
  return { spaces: resolved, landing }
}
