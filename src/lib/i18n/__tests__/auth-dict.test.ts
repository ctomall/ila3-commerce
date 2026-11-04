import { describe, expect, it } from '@jest/globals'
import { backendArea, isAuthRoute, namespacesForBackendRoute, trimDictionaryForAuthRoute, trimDictionaryToNamespaces } from '../auth-dict'

describe('auth-dict', () => {
  it('recognizes the unauthenticated routes', () => {
    expect(isAuthRoute('/login')).toBe(true)
    expect(isAuthRoute('/login/reset')).toBe(true)
    expect(isAuthRoute('/start')).toBe(true)
    expect(isAuthRoute('/backend')).toBe(false)
    expect(isAuthRoute('/backend/login')).toBe(false)
    expect(isAuthRoute(null)).toBe(false)
    expect(isAuthRoute('')).toBe(false)
  })

  it('keeps only the shell namespaces', () => {
    const dict = {
      'auth.login.brandName': 'ILA3 Commerce',
      'common.save': '保存',
      'ui.dataTable.noValue': '—',
      'appShell.toggleSidebar': '切换侧边栏',
      'customers.companies.list.columns.name': '名称',
      'wms.stock.title': '库存',
      noDot: 'x',
    }
    const trimmed = trimDictionaryForAuthRoute(dict)
    expect(Object.keys(trimmed).sort()).toEqual(
      ['appShell.toggleSidebar', 'auth.login.brandName', 'common.save', 'ui.dataTable.noValue'].sort(),
    )
  })

  it('drops module namespaces that merely share a prefix', () => {
    const trimmed = trimDictionaryForAuthRoute({ 'authn.thing': 'x', 'authentication.y': 'y' })
    expect(trimmed).toEqual({})
  })
})

describe('backend route namespaces', () => {
  it('extracts the area after /backend', () => {
    expect(backendArea('/backend/customers/companies')).toBe('customers')
    expect(backendArea('/backend')).toBe('dashboard')
    expect(backendArea('/login')).toBeNull()
  })

  it('keeps the full dictionary for settings and config screens', () => {
    expect(namespacesForBackendRoute('/backend/config/system-status')).toBeNull()
    expect(namespacesForBackendRoute('/backend/settings')).toBeNull()
  })

  it('scopes a module route to shell + module namespaces', () => {
    const ns = namespacesForBackendRoute('/backend/customers/companies')
    expect(ns).not.toBeNull()
    expect(ns).toEqual(expect.arrayContaining(['ui', 'common', 'customers', 'sales']))
    expect(ns).not.toContain('wms')
  })

  it('keeps the full dictionary for unknown areas', () => {
    expect(namespacesForBackendRoute('/backend/unknown-area')).toBeNull()
  })

  it('trims to the requested namespaces', () => {
    const out = trimDictionaryToNamespaces({ 'ui.a': '1', 'wms.b': '2', nodot: '3' }, ['ui'])
    expect(out).toEqual({ 'ui.a': '1' })
  })
})
