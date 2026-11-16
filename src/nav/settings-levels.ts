import configuration from './settings-levels.json'
import type { CrmNavCategory } from './crm-navigation'
export type SettingsLevel = { id: string; label: string; labelKey: string; categories: CrmNavCategory[] }
/** Classification never checks role names and never changes the input permission set. */
export function buildSettingsLevels(categories: readonly CrmNavCategory[]): SettingsLevel[] {
  const result: SettingsLevel[] = []
  const claimed = new Set<string>()
  for (const spec of configuration) {
    const owned = categories.filter(category => spec.categories.includes(category.id))
    owned.forEach(category => claimed.add(category.id))
    if (owned.length) result.push({ ...spec, categories: owned })
  }
  // Third-party categories stay discoverable instead of silently disappearing.
  const additional = categories.filter(category => !claimed.has(category.id))
  if (additional.length) result.push({ id: 'additional', label: '扩展设置', labelKey: 'crmNav.settings.additional', categories: additional })
  return result
}
