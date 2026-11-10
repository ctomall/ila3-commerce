import { describe, expect, it } from '@jest/globals'
import { applyGroupCatalog, NAV_GROUP_CATALOG } from '../group-catalog'

const group = (id: string, items: unknown[]) => ({ id, items })

describe('applyGroupCatalog', () => {
  it('merges member groups into the declared sections in catalog order', () => {
    // The shipped catalog separates home, customers, sales and catalog; each
    // member page group keeps its own top-level section.
    const result = applyGroupCatalog([
      group('customers.nav.group', ['a', 'b']),
      group('customers~sales.nav.group', ['c']),
      group('catalog.nav.group', ['d']),
      group('workbench.nav.group', ['home']),
    ])
    expect(result.map((entry) => entry.id)).toEqual(['home', 'customers', 'sales', 'catalog'])
    expect(result[0].items).toEqual(['home'])
    expect(result[1].items).toEqual(['a', 'b'])
    expect(result[2].items).toEqual(['c'])
    expect(result[3].items).toEqual(['d'])
  })

  it('keeps unknown groups visible after the catalog', () => {
    const result = applyGroupCatalog([
      group('customers.nav.group', ['a']),
      group('brand_new.nav.group', ['z']),
    ])
    expect(result.map((entry) => entry.id)).toEqual(['customers', 'brand_new.nav.group'])
    expect(result[1].items).toEqual(['z'])
  })

  it('drops catalog entries whose members are absent', () => {
    const result = applyGroupCatalog([group('catalog.nav.group', ['d'])])
    expect(result.map((entry) => entry.id)).toEqual(['catalog'])
  })

  it('renders the container label through the catalogue labelKey when translated', () => {
    const result = applyGroupCatalog(
      [group('customers.nav.group', ['a'])],
      (key, fallback) => (key === 'crmNav.group.customers' ? '客户' : fallback),
    )
    expect(result[0].id).toBe('customers')
    expect(result[0].name).toBe('客户')
    expect(result[0].defaultName).toBe('客户')
  })

  it('falls back to the declared label without a translator', () => {
    const result = applyGroupCatalog([group('customers.nav.group', ['a'])])
    expect(result[0].name).toBe('客户')
  })

  it('matches the shipped catalog contract', () => {
    const ids = NAV_GROUP_CATALOG.map((spec) => spec.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const spec of NAV_GROUP_CATALOG) {
      expect(spec.members.length).toBeGreaterThan(0)
      expect(Number.isInteger(spec.order)).toBe(true)
      if (spec.landing) expect(spec.landing.startsWith('/backend')).toBe(true)
    }
  })
})
