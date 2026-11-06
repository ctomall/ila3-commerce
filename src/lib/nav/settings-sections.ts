import table from '../../nav/settings-sections.json'
import { mergeSettingsSections as mergeSettingsSectionsImpl } from '../../nav/logic.js'

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
  // Same shared implementation the shell runs (see src/nav/logic.mjs).
  return mergeSettingsSectionsImpl(sections, SETTINGS_SECTION_MERGE) as ShellSettingsSection[]
}
