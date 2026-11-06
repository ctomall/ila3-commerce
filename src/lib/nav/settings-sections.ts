import table from '../../nav/settings-sections.json'

/**
 * Settings-section merge table: the module-declared settings partitions collapse
 * into a short list people can scan. Data plus a pure function, so the mapping can
 * be tested without booting the shell.
 */
export type SettingsSectionSpec = {
  id: string
  labelKey: string
  label: string
  order: number
}

export type ShellSettingsSection = {
  id: string
  label?: string
  labelKey?: string
  order?: number
  items?: unknown[]
}

export const SETTINGS_SECTION_MERGE = table as Record<string, SettingsSectionSpec>

export function mergeSettingsSections(
  sections: ReadonlyArray<ShellSettingsSection>,
): ShellSettingsSection[] {
  const merged = new Map<string, ShellSettingsSection>()
  for (const section of sections) {
    const spec = SETTINGS_SECTION_MERGE[section.id]
    if (!spec) {
      merged.set(section.id, section)
      continue
    }
    const existing = merged.get(spec.id)
    if (existing) {
      existing.items = [...(existing.items ?? []), ...(section.items ?? [])]
      continue
    }
    merged.set(spec.id, {
      id: spec.id,
      label: spec.label,
      labelKey: spec.labelKey,
      order: spec.order,
      items: [...(section.items ?? [])],
    })
  }
  return Array.from(merged.values()).sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
}
