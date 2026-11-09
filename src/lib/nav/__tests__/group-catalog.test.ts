import { describe, expect, it } from '@jest/globals'
import { applyGroupCatalog, NAV_GROUP_CATALOG } from '../group-catalog'

const group = (id: string, items: unknown[]) => ({ id, items })

describe('applyGroupCatalog', () => {
  it('merges member groups into the declared sections in catalog order', () => {
    // The catalog is 工作台 / 销售业务 / 资料中心 / 管理后台: customers, catalog, fulfilment
    // and finance are one business area now, so they merge into `sales`.
    const result = applyGroupCatalog([
      group('customers.nav.group', ['a', 'b']),
      group('customers~sales.nav.group', ['c']),
      group('catalog.nav.group', ['d']),
      group('workbench.nav.group', ['home']),
    ])
    expect(result.map((entry) => entry.id)).toEqual(['workbench', 'sales'])
    expect(result[0].items).toEqual(['home'])
    expect(result[1].items).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps unknown groups visible after the catalog', () => {
    const result = applyGroupCatalog([
      group('customers.nav.group', ['a']),
      group('brand_new.nav.group', ['z']),
    ])
    expect(result.map((entry) => entry.id)).toEqual(['sales', 'brand_new.nav.group'])
    expect(result[1].items).toEqual(['z'])
  })

  it('drops catalog entries whose members are absent', () => {
    const result = applyGroupCatalog([group('catalog.nav.group', ['d'])])
    expect(result.map((entry) => entry.id)).toEqual(['sales'])
  })

  it('matches the shipped catalog contract', () => {
    const ids = NAV_GROUP_CATALOG.map((spec) => spec.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const spec of NAV_GROUP_CATALOG) {
      expect(spec.members.length).toBeGreaterThan(0)
      expect(Number.isInteger(spec.order)).toBe(true)
    }
  })
})
