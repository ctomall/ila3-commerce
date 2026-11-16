export type NavigationPreferenceValue = {
  favorites: string[]
  recentWorkspace: string | null
  selectedPreset: string | null
}

export const EMPTY_PREFERENCE: NavigationPreferenceValue = {
  favorites: [],
  recentWorkspace: null,
  selectedPreset: null,
}

const ID = /^[a-z0-9][a-z0-9._:-]{0,63}$/
const FAVORITE_MAX = 100

export type PreferenceParse =
  | { ok: true; value: NavigationPreferenceValue }
  | { ok: false; error: string }

export function normalizePreference(input: unknown): PreferenceParse {
  if (input === undefined || input === null) return { ok: true, value: EMPTY_PREFERENCE }
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'preference must be an object' }
  const record = input as Record<string, unknown>

  let favorites: string[] = []
  if (record.favorites !== undefined && record.favorites !== null) {
    if (!Array.isArray(record.favorites)) return { ok: false, error: 'favorites must be an array' }
    if (record.favorites.length > FAVORITE_MAX) return { ok: false, error: `favorites accepts at most ${FAVORITE_MAX} entries` }
    for (const entry of record.favorites) {
      if (typeof entry !== 'string') return { ok: false, error: 'favorites must contain strings' }
      if (!entry.startsWith('/backend') || entry.length > 2048) return { ok: false, error: 'favorite must be a backend path' }
      if (!favorites.includes(entry)) favorites.push(entry)
    }
  }

  const workspace = record.recentWorkspace
  if (workspace !== undefined && workspace !== null && workspace !== '') {
    if (typeof workspace !== 'string' || !ID.test(workspace)) return { ok: false, error: 'recentWorkspace is invalid' }
  }
  const preset = record.selectedPreset
  if (preset !== undefined && preset !== null && preset !== '') {
    if (typeof preset !== 'string' || !ID.test(preset)) return { ok: false, error: 'selectedPreset is invalid' }
  }

  return {
    ok: true,
    value: {
      favorites,
      recentWorkspace: typeof workspace === 'string' && workspace ? workspace : null,
      selectedPreset: typeof preset === 'string' && preset ? preset : null,
    },
  }
}

/**
 * Keep a stored value only where it still points at something the caller may
 * see. Revoked workspaces, links or presets disappear on the next read.
 */
export function sanitizePreference(
  value: NavigationPreferenceValue,
  allowed: { hrefs: ReadonlySet<string>; spaceIds: ReadonlySet<string>; presetIds: ReadonlySet<string> },
): NavigationPreferenceValue {
  return {
    favorites: value.favorites.filter((href) => allowed.hrefs.has(href)).slice(0, FAVORITE_MAX),
    recentWorkspace: value.recentWorkspace && allowed.spaceIds.has(value.recentWorkspace) ? value.recentWorkspace : null,
    selectedPreset: value.selectedPreset && allowed.presetIds.has(value.selectedPreset) ? value.selectedPreset : null,
  }
}
