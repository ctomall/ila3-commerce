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

  it('keeps the namespaces the customer detail actually renders', () => {
    const ns = namespacesForBackendRoute('/backend/customers/companies-v2/abc')
    expect(ns).not.toBeNull()
    for (const required of ['documents', 'workflows', 'warranty_claims', 'audit_logs']) {
      expect(ns).toContain(required)
    }
  })

  it('keeps the communication channel column labels on the messages route', () => {
    const ns = namespacesForBackendRoute('/backend/messages')
    expect(ns).not.toBeNull()
    expect(ns).toContain('communication_channels')
  })

  it('keeps the full dictionary for unknown areas', () => {
    expect(namespacesForBackendRoute('/backend/unknown-area')).toBeNull()
  })

  it('trims to the requested namespaces', () => {
    const out = trimDictionaryToNamespaces({ 'ui.a': '1', 'wms.b': '2', nodot: '3' }, ['ui'])
    expect(out).toEqual({ 'ui.a': '1' })
  })
})

describe('consent copy survives every trim', () => {
  // Regression: the cookie banner lives in the app shell, so whichever trim runs
  // must keep `notices` or the banner falls back to English on trimmed routes.
  const dict = {
    'notices.cookies.description': '我们使用必要的 Cookie 记住你的偏好。',
    'customers.companies.entityPlural': '公司',
    'ui.ok': '好的',
  }

  it('keeps notices on auth routes', () => {
    const out = trimDictionaryForAuthRoute(dict)
    expect(out['notices.cookies.description']).toBeDefined()
    expect(out['customers.companies.entityPlural']).toBeUndefined()
  })

  it('keeps notices on trimmed backend areas', () => {
    const ns = namespacesForBackendRoute('/backend/customers/companies')
    expect(ns).not.toBeNull()
    const out = trimDictionaryToNamespaces(dict, ns as string[])
    expect(out['notices.cookies.description']).toBeDefined()
  })
})

describe('shell chrome survives the backend trim', () => {
  // The top bar and org switcher render outside the routed content; if their
  // namespaces are trimmed away their accessible names fall back to raw keys.
  it('keeps every namespace the shell chrome uses', () => {
    const ns = namespacesForBackendRoute('/backend/customers/companies')
    expect(ns).not.toBeNull()
    for (const required of ['organizationSwitcher', 'notifications', 'portal', 'search', 'ai_assistant', 'notices']) {
      expect(ns).toContain(required)
    }
  })
})

describe('large shell namespaces keep only their chrome keys', () => {
  // ai_assistant and search are big; shipping them whole cost ~172 KB per page.
  const dict = {
    'search.dialog.actions.openGlobalSearch': '打开全局搜索',
    'search.results.empty': '无结果',
    'ai_assistant.launcher.triggerAriaLabel': '打开 AI 助手',
    'ai_assistant.panel.title': 'AI 助手',
  }

  it('keeps the launcher and dialog labels, drops the rest', () => {
    const ns = namespacesForBackendRoute('/backend/customers/companies') as string[]
    const out = trimDictionaryToNamespaces(dict, ns)
    expect(out['search.dialog.actions.openGlobalSearch']).toBeDefined()
    expect(out['ai_assistant.launcher.triggerAriaLabel']).toBeDefined()
    expect(out['search.results.empty']).toBeUndefined()
    expect(out['ai_assistant.panel.title']).toBeUndefined()
  })
})
