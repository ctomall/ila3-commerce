import { describe, expect, it } from '@jest/globals'
import { mergeSettingsSections, SETTINGS_SECTION_MERGE } from '../settings-sections'

describe('mergeSettingsSections', () => {
  it('merges two partitions that map to the same section', () => {
    const merged = mergeSettingsSections([
      { id: 'settings.sections.auth', items: ['users'] },
      { id: 'settings.sections.directory', items: ['orgs'] },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('settings.sections.access')
    expect(merged[0].label).toBe('身份与权限')
    expect(merged[0].items).toEqual(['users', 'orgs'])
  })

  it('passes unknown sections through untouched', () => {
    const merged = mergeSettingsSections([{ id: 'profile.sections.account', items: ['me'] }])
    expect(merged[0].id).toBe('profile.sections.account')
    expect(merged[0].items).toEqual(['me'])
  })

  it('orders by the declared order', () => {
    const merged = mergeSettingsSections([
      { id: 'settings.sections.security', items: ['a'] },
      { id: 'settings.sections.system', items: ['b'] },
    ])
    expect(merged.map((entry) => entry.id)).toEqual([
      'settings.sections.system',
      'settings.sections.security',
    ])
  })

  it('declares a label and order for every mapping', () => {
    for (const [key, spec] of Object.entries(SETTINGS_SECTION_MERGE)) {
      expect(spec.label.length).toBeGreaterThan(0)
      expect(spec.id).toBeTruthy()
      expect(Number.isInteger(spec.order)).toBe(true)
      expect(key.length).toBeGreaterThan(0)
    }
  })
})
