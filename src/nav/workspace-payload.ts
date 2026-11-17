import { EMPTY_LAYOUT, parseLayoutConfig, type WorkspaceLayoutConfig, type WorkspacePreset } from '@/modules/workspace_settings/lib/layout'
import type { Workspace } from './workspaces'
import type { WorkspacePreset as PresetType } from '@/modules/workspace_settings/lib/layout'
import { applyLayout } from '@/modules/workspace_settings/lib/layout'

type PayloadShape = {
  workspaceLayout?: unknown
  assignedPresets?: unknown
} | null

/** Layout comes from the server; an unreadable document means code defaults. */
export function readWorkspaceLayout(payload: unknown): WorkspaceLayoutConfig {
  const candidate = (payload as PayloadShape)?.workspaceLayout
  return candidate ? parseLayoutConfig(candidate) : EMPTY_LAYOUT
}

export function readAssignedPresets(payload: unknown): WorkspacePreset[] {
  const candidate = (payload as PayloadShape)?.assignedPresets
  if (!Array.isArray(candidate)) return []
  const out: WorkspacePreset[] = []
  for (const entry of candidate) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    if (typeof record.id !== 'string' || typeof record.name !== 'string') continue
    out.push({
      id: record.id,
      name: record.name,
      workspaces: Array.isArray(record.workspaces) ? record.workspaces.filter((id): id is string => typeof id === 'string') : [],
      landing: typeof record.landing === 'string' ? record.landing : null,
    })
  }
  return out
}

/**
 * Resolve where a preset should navigate: its own landing when that page is
 * inside one of the preset's authorized workspaces, otherwise the first
 * workspace landing. The preset never points outside the caller's spaces.
 */
export function presetLanding(preset: PresetType, spaces: readonly Workspace[]): string | null {
  const ordered = preset.workspaces
    .map((id) => spaces.find((space) => space.id === id))
    .filter((space): space is Workspace => Boolean(space))
  if (ordered.length === 0) return null
  if (preset.landing) {
    const inside = ordered.some((space) =>
      space.landing === preset.landing
      || space.groups.some((group) =>
        group.landing === preset.landing || group.items.some((item) => item.href === preset.landing)))
    if (inside) return preset.landing
  }
  return ordered[0].landing
}

/** Apply an organization layout to the spaces derived from the catalogue. */
export function layoutSpaces(spaces: readonly Workspace[], layout: WorkspaceLayoutConfig): Workspace[] {
  return applyLayout(spaces, layout).visible
}

/** Full directory/search projection: hidden means sidebar-only, never revoked. */
export function directorySpaces(spaces: readonly Workspace[], layout: WorkspaceLayoutConfig): Workspace[] {
  return applyLayout(spaces, layout).ordered
}
