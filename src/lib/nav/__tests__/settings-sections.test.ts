import { describe, expect, it } from '@jest/globals'
import { mergeSettingsSections, SETTINGS_SECTION_MERGE } from '../settings-sections'
import { declaredCategoryIds, declaredCategoryKeys } from '../../../nav/ownership'

describe('mergeSettingsSections', () => {
  it('maps a declared partition id to its management category container', () => {
    const merged = mergeSettingsSections([{ id: 'crmNav.manage.category.users', items: ['users'] }])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      id: 'users',
      labelKey: 'crmNav.manage.category.users',
      label: '用户组织',
      order: 10,
      items: ['users'],
    })
  })

  it('merges partitions that would map to the same container id', () => {
    const table = { ...SETTINGS_SECTION_MERGE }
    // The shipped table is 1:1, but the function's contract allows several
    // page partitions to collapse into one category container.
    expect(Object.values(table).some((spec) => spec.id === 'users')).toBe(true)
    const merged = mergeSettingsSections([
      { id: 'crmNav.manage.category.users', items: ['users'] },
      { id: 'some.new.partition', items: ['extra'] },
    ])
    expect(merged.map((entry) => entry.id)).toEqual(['users', 'some.new.partition'])
    expect(merged[1].items).toEqual(['extra'])
  })

  it('passes unknown sections through untouched', () => {
    const merged = mergeSettingsSections([{ id: 'profile.sections.account', items: ['me'] }])
    expect(merged[0].id).toBe('profile.sections.account')
    expect(merged[0].items).toEqual(['me'])
  })

  it('orders by the declared category order, not the incoming order', () => {
    const merged = mergeSettingsSections([
      { id: 'crmNav.manage.category.system', items: ['system'] },
      { id: 'crmNav.manage.category.users', items: ['users'] },
      { id: 'crmNav.manage.category.ai', items: ['ai'] },
    ])
    expect(merged.map((entry) => entry.id)).toEqual(['users', 'ai', 'system'])
  })

  it('declares exactly one label and order for every management category', () => {
    const specs = Object.values(SETTINGS_SECTION_MERGE)
    expect(specs).toHaveLength(10)
    expect(new Set(specs.map((spec) => spec.id)).size).toBe(10)
    expect(specs.map((spec) => spec.id).sort()).toEqual(declaredCategoryIds().sort())
    expect(Object.keys(SETTINGS_SECTION_MERGE).sort()).toEqual(declaredCategoryKeys().sort())
    for (const [key, spec] of Object.entries(SETTINGS_SECTION_MERGE)) {
      expect(key.startsWith('crmNav.manage.category.')).toBe(true)
      expect(spec.labelKey).toBe(key)
      expect(spec.label.length).toBeGreaterThan(0)
      expect(Number.isInteger(spec.order)).toBe(true)
    }
  })
})
