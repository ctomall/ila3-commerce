import { describe, it, expect } from '@jest/globals'
import { buildWorkspaces, selectWorkspace, searchWorkspaceEntries, recommendWorkspaces } from '../workspaces'
import { buildWorkspaceChrome } from '../workspace-chrome'
import { buildCrmNavigation } from '../crm-navigation'
import type { CrmNavGroup } from '../crm-navigation'
const group = (id: string, href = `/backend/${id}`): CrmNavGroup => ({
  id, label: id, order: 1, landing: href, items: [{ href, label: id }],
})
describe('authorized workspace projection', () => {
  const config = [{ id: 'trade', label: 'Trade', order: 1, members: ['sales', 'payments'] }]
  it('merges declared groups without inventing hrefs', () => {
    const spaces = buildWorkspaces([group('sales'), group('payments')], config)
    expect(spaces).toHaveLength(1)
    expect(spaces[0].groups.map(g => g.id)).toEqual(['sales', 'payments'])
    expect(spaces[0].landing).toBe('/backend/sales')
  })
  it('discovers an unconfigured module without editing consumers', () => {
    const spaces = buildWorkspaces([group('new_module')], config)
    expect(spaces).toHaveLength(1)
    expect(spaces[0]).toMatchObject({ id: 'module:new_module', configured: false })
  })
  it('omits empty spaces and cannot resurrect denied groups', () => {
    expect(buildWorkspaces([], config)).toEqual([])
    expect(buildWorkspaces([group('sales')], config)[0].groups.map(g => g.id)).toEqual(['sales'])
  })
  it('rejects ambiguous membership rather than duplicating destinations', () => {
    expect(() => buildWorkspaces([], [...config, { id: 'other', label: 'Other', order: 2, members: ['sales'] }])).toThrow()
  })
  it('matches longest authorized route on segment boundaries', () => {
    const spaces = buildWorkspaces([group('home', '/backend'), group('sales'), group('payments', '/backend/sales/payments')], [])
    expect(selectWorkspace(spaces, '/backend/sales/payments/123')?.id).toBe('module:payments')
    expect(selectWorkspace(spaces, '/backend/salesman')).toBeNull()
    expect(selectWorkspace(spaces, '/backend')?.id).toBe('module:home')
  })
  it('searches all authorized workspaces and deduplicates hrefs', () => {
    const spaces = buildWorkspaces([group('sales'), group('payments')], config)
    expect(searchWorkspaceEntries(spaces, 'payments').map(x => x.href)).toEqual(['/backend/payments'])
    expect(searchWorkspaceEntries(spaces, 'denied')).toEqual([])
    expect(searchWorkspaceEntries(spaces, '').length).toBe(2)
  })
  it('rejects duplicate workspace identities and reserved fallback identities', () => {
    expect(() => buildWorkspaces([], [config[0], config[0]])).toThrow()
    expect(() => buildWorkspaces([], [{ ...config[0], id: 'module:reserved' }])).toThrow()
  })
  it('keeps the legacy group objects and route identities intact', () => {
    const original = group('sales')
    const before = JSON.stringify(original)
    const spaces = buildWorkspaces([original], config)
    expect(spaces[0].groups[0]).toBe(original)
    expect(JSON.stringify(original)).toBe(before)
  })
  it('does not search the same href twice across legacy groups', () => {
    const spaces = buildWorkspaces([group('sales', '/backend/shared'), group('payments', '/backend/shared')], config)
    expect(searchWorkspaceEntries(spaces, '')).toHaveLength(1)
  })
  it('returns no workspace for an arbitrary unauthorized path', () => {
    const spaces = buildWorkspaces([group('sales')], config)
    expect(selectWorkspace(spaces, '/backend/system-admin')).toBeNull()
    expect(selectWorkspace(spaces, 'https://example.test/backend/sales')).toBeNull()
  })

  it('uses wildcard-aware features for recommendations without granting or hiding spaces', () => {
    const spaces = buildWorkspaces([group('sales'), group('new_module')], config)
    const rules = [{ workspaceId: 'module:new_module', features: ['wms.view'] }, { workspaceId: 'denied', features: ['sales.orders.manage'] }]
    const ranked = recommendWorkspaces(spaces, ['wms.*', 'sales.*'], rules)
    expect(ranked[0].id).toBe('module:new_module')
    expect(ranked.map(x => x.id).sort()).toEqual(spaces.map(x => x.id).sort())
    expect(spaces[0].id).toBe('trade')
  })

  it('integrates with the existing authorized catalogue, preserving settings and old URLs', () => {
    const payload = {
      groups: [
        { id: 'customers', name: 'Customers', items: [{ href: '/backend/customers/companies', title: 'Companies', order: 1 }] },
        { id: 'new_module', name: 'New module', items: [{ href: '/backend/new_module', title: 'New module', order: 2 }] },
      ],
      settingsSections: [{ id: 'system', label: 'System', items: [{ href: '/backend/settings/system', title: 'System', order: 1 }] }],
      grantedFeatures: ['customers.companies.view'],
    }
    const catalog = buildCrmNavigation(payload)
    const before = JSON.stringify(catalog)
    const spaces = buildWorkspaces(catalog.groups)
    const hrefs = searchWorkspaceEntries(spaces, '').map(x => x.href)
    expect(hrefs).toEqual(expect.arrayContaining(['/backend/customers/companies', '/backend/new_module']))
    expect(hrefs).not.toContain('/backend/settings/system')
    expect(hrefs).not.toContain('/backend/forbidden')
    expect(selectWorkspace(spaces, '/backend/customers/companies/123')?.id).toBe('customers')
    expect(catalog.manage.categories[0].items[0].href).toBe('/backend/settings/system')
    expect(JSON.stringify(catalog)).toBe(before)
  })

  it('projects shell groups but leaves the complete catalogue available', () => {
    const catalog = buildCrmNavigation({groups: [
      {id:'home',items:[{href:'/backend/workbench',title:'Home',order:1}]},
      {id:'customers',items:[{href:'/backend/customers/companies',title:'Companies',order:1}]},
      {id:'sales',items:[{href:'/backend/sales/orders',title:'Orders',order:1}]},
    ]})
    const projected = buildWorkspaceChrome(catalog, '/backend/customers/companies/123')
    expect(projected.groups.map(g => g.id)).toEqual(['home','customers'])
    expect(catalog.groups).toHaveLength(3)
    expect(buildWorkspaceChrome(catalog, undefined).groups).toHaveLength(3)
    expect(buildWorkspaceChrome(catalog, 'https://evil.test').groups).toHaveLength(3)
    // Settings/profile/manage have no owning group: fall back to the workspace
    // the caller came from when it is authorized, otherwise to fixed entries.
    expect(buildWorkspaceChrome(catalog, '/backend/manage').groups.map(g => g.id)).toEqual(['home'])
    expect(buildWorkspaceChrome(catalog, '/backend/settings/profile', undefined, 'customers').groups.map(g => g.id)).toEqual(['home','customers'])
    expect(buildWorkspaceChrome(catalog, '/backend/settings/profile', undefined, 'module:secret').groups.map(g => g.id)).toEqual(['home'])
  })

  it('resolves the declared workbench redirect at the real dashboard path', () => {
    const catalog = buildCrmNavigation({groups:[
      {id:'home',items:[{href:'/backend/workbench',title:'Home',order:1}]},
      {id:'sales',items:[{href:'/backend/sales/orders',title:'Orders',order:1}]},
    ]})
    expect(selectWorkspace(buildWorkspaces(catalog.groups), '/backend')?.id).toBe('home')
    expect(buildWorkspaceChrome(catalog, '/backend').groups.map(g=>g.id)).toEqual(['home'])
  })

})
