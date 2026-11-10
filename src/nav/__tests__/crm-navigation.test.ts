import { describe, expect, it } from '@jest/globals'
import {
  buildCrmNavigation,
  readCrmCatalog,
  selectActiveGroup,
  selectRail,
  type CoreNavPayload,
} from '../crm-navigation'
import { applyGroupCatalog, NAV_GROUP_CATALOG, type NavGroupSpec } from '../../lib/nav/group-catalog'

const declared: NavGroupSpec[] = [
  {
    id: 'home',
    label: '工作台',
    labelKey: 'crmNav.group.home',
    order: 10,
    landing: '/backend/workbench',
    members: ['workbench.nav.group'],
  },
  {
    id: 'customers',
    label: '客户',
    order: 20,
    landing: '/backend/customers/companies',
    members: ['customers.nav.group'],
  },
  {
    id: 'content',
    label: '沟通与资料',
    order: 30,
    landing: '/backend/messages',
    members: ['messages.nav.group', 'documents.nav.group'],
  },
]

function item(title: string, href: string, extra: Record<string, unknown> = {}) {
  return { id: href, title, href, pageContext: 'main', ...extra }
}

function payload(overrides: Partial<CoreNavPayload> = {}): CoreNavPayload {
  return {
    groups: [
      {
        id: 'home',
        name: '工作台',
        items: [item('工作台', '/backend/workbench', { order: 5 })],
      },
      {
        id: 'customers',
        name: '客户',
        items: [
          item('公司', '/backend/customers/companies', { order: 110, iconName: 'building2' }),
          item('联系人', '/backend/customers/people', { order: 100, iconName: 'users' }),
          item('新建公司', '/backend/customers/companies/create', { order: undefined }),
          item('添加资源类型', '/backend/resources/resource-types/create', { order: 10000 }),
          item('公司详情', '/backend/customers/companies/1', { order: undefined }),
        ],
      },
      {
        id: 'content',
        name: '沟通与资料',
        items: [
          item('消息', '/backend/messages', { order: 460, iconName: 'mail' }),
          item('文档', '/backend/documents', { order: 100, iconName: 'file-text' }),
          item('通知偏好', '/backend/profile/notification-preferences', {
            order: 30,
            pageContext: 'profile',
          }),
        ],
      },
    ],
    settingsSections: [
      {
        id: 'settings.sections.system',
        label: '系统',
        items: [item('缓存', '/backend/config/cache', { pageContext: 'settings' })],
      },
    ],
    profileSections: [
      {
        id: 'profile.sections.account',
        label: '账户',
        items: [
          item('通知偏好', '/backend/profile/notification-preferences', {
            order: 30,
            pageContext: 'profile',
          }),
        ],
      },
    ],
    grantedFeatures: ['ai_assistant.view'],
    ...overrides,
  }
}

describe('declared CRM catalogue', () => {
  it('builds top-level groups from module groups and the app arrangement', () => {
    const catalog = buildCrmNavigation(payload(), declared)
    expect(catalog.version).toBe(2)
    expect(catalog.groups.map((group) => group.id)).toEqual(['home', 'customers', 'content'])
    expect(catalog.groups[1].landing).toBe('/backend/customers/companies')
    expect(catalog.groups[1].items.map((entry) => entry.href)).toEqual([
      '/backend/customers/people',
      '/backend/customers/companies',
    ])
    expect(catalog.groups[1].iconName).toBe('building2')
    expect(catalog.groups[1].items.map((entry) => entry.href)).not.toContain('/backend/customers/companies/create')
    expect(catalog.groups[1].items.map((entry) => entry.href)).not.toContain('/backend/resources/resource-types/create')
  })

  it('keeps settings and profile out of the daily rail but reachable from their surfaces', () => {
    const catalog = buildCrmNavigation(payload(), declared)
    expect(catalog.groups.flatMap((group) => group.items.map((entry) => entry.href))).not.toContain(
      '/backend/config/cache',
    )
    expect(catalog.manage.categories.flatMap((category) => category.items.map((entry) => entry.href))).toEqual([
      '/backend/config/cache',
    ])
    expect(catalog.personal.items.map((entry) => entry.href)).toEqual([
      '/backend/profile/notification-preferences',
    ])
    expect(catalog.utility.map((entry) => entry.id)).toEqual(['manage', 'account'])
  })

  it('reports a newly declared module group but still renders it without a code change', () => {
    const catalog = buildCrmNavigation(
      payload({
        groups: [
          ...(payload().groups ?? []),
          {
            id: 'brand_new.nav.group',
            name: '新模块',
            items: [item('新入口', '/backend/brand-new', { order: 10 })],
          },
        ],
      }),
      declared,
    )
    expect(catalog.unconfiguredGroups).toEqual(['brand_new.nav.group'])
    expect(catalog.groups.find((group) => group.id === 'brand_new.nav.group')?.items[0].href).toBe(
      '/backend/brand-new',
    )
  })

  it('converges when a module entry is disabled, removed or no longer authorized', () => {
    const disabled = buildCrmNavigation(
      payload({
        groups: [
          {
            id: 'customers',
            name: '客户',
            items: [
              item('公司', '/backend/customers/companies', { order: 110 }),
              item('联系人', '/backend/customers/people', { order: 100, enabled: false }),
            ],
          },
        ],
      }),
      declared,
    )
    expect(disabled.groups[0].items.map((entry) => entry.href)).toEqual(['/backend/customers/companies'])

    const revoked = buildCrmNavigation(
      payload({
        groups: [{ id: 'customers', name: '客户', items: [] }],
        settingsSections: [],
        profileSections: [],
      }),
      declared,
    )
    expect(revoked.groups).toEqual([])
    expect(revoked.manage.categories).toEqual([])
    expect(revoked.personal.items).toEqual([])
    expect(revoked.utility).toEqual([])
  })

  it('renders an explicitly empty authorization as ready and empty', () => {
    const catalog = buildCrmNavigation(
      payload({ groups: [], settingsSections: [], profileSections: [], grantedFeatures: [] }),
      declared,
    )
    expect(catalog.groups).toEqual([])
    expect(catalog.manage.categories).toEqual([])
    expect(catalog.personal.items).toEqual([])
    expect(catalog.railActions).toEqual([])
    expect(selectRail(catalog, false)).toEqual({
      state: 'ready',
      groups: [],
      railActions: [],
      utility: [],
    })
  })

  it('reports unknown owners and duplicate daily hrefs instead of silently rendering them twice', () => {
    const catalog = buildCrmNavigation(
      payload({
        groups: [
          {
            id: 'customers',
            name: '客户',
            items: [
              item('公司', '/backend/customers/companies', { order: 110 }),
              item('公司重复', '/backend/customers/companies', { order: 120 }),
              { id: 'no-href', title: '坏入口' },
            ],
          },
          {
            id: '',
            name: '无归属',
            items: [item('神秘入口', '/backend/mystery', { order: 1 })],
          },
        ],
      }),
      declared,
    )
    expect(catalog.duplicates).toEqual(['/backend/customers/companies'])
    expect(catalog.groups.flatMap((group) => group.items.filter((entry) => entry.href === '/backend/customers/companies'))).toHaveLength(1)
    expect(catalog.unknown).toContain('/backend/mystery')
  })

  it('accounts for every authorized href exactly once across groups, manage, personal and actions', () => {
    const catalog = buildCrmNavigation(payload(), declared)
    const rendered = [
      ...catalog.groups.flatMap((group) => group.items.map((entry) => entry.href)),
      ...catalog.manage.categories.flatMap((category) => category.items.map((entry) => entry.href)),
      ...catalog.personal.items.map((entry) => entry.href),
      ...catalog.actions,
    ]
    expect(new Set(rendered).size).toBe(rendered.length)
    expect(catalog.actions).toContain('/backend/resources/resource-types/create')
    for (const href of catalog.authorized) expect(rendered).toContain(href)
  })

  it('resolves the active group from declared entries, including detail paths', () => {
    const catalog = buildCrmNavigation(payload(), declared)
    expect(selectActiveGroup(catalog, '/backend')?.id).toBe('home')
    expect(selectActiveGroup(catalog, '/backend/workbench')?.id).toBe('home')
    expect(selectActiveGroup(catalog, '/backend/customers/companies/1')?.id).toBe('customers')
    expect(selectActiveGroup(catalog, '/backend/customers/people')?.id).toBe('customers')
    expect(selectActiveGroup(catalog, '/backend/manage')).toBeNull()
  })

  it('never substitutes a static rail while loading or after failure', () => {
    expect(selectRail(null, true)).toEqual({
      state: 'loading',
      groups: [],
      railActions: [],
      utility: [],
    })
    expect(selectRail(null, false)).toEqual({
      state: 'error',
      groups: [],
      railActions: [],
      utility: [],
    })
  })

  it('reads only a real version-2 CRM payload', () => {
    expect(readCrmCatalog(null)).toBeNull()
    expect(readCrmCatalog({ groups: [] })).toBeNull()
    expect(readCrmCatalog({ crm: { groups: [] } })).toBeNull()
    expect(readCrmCatalog({ crm: { groups: [], utility: [] } })).toBeNull()
    const payloadShape = { groups: [], railActions: [], utility: [] }
    expect(readCrmCatalog({ crm: payloadShape })).toEqual(payloadShape)
  })
  it('applies the app grouping catalogue before building, without a per-href table', () => {
    const merged = applyGroupCatalog([
      { id: 'workbench.nav.group', name: '工作台', items: [{ id: 'w', href: '/backend/workbench', title: '工作台', order: 5 }] },
      { id: 'customers.nav.group', name: '客户', items: [{ id: 'c', href: '/backend/customers/companies', title: '公司', order: 110 }] },
      { id: 'customers~sales.nav.group', name: '销售', items: [{ id: 's', href: '/backend/sales/quotes', title: '报价', order: 100 }] },
      {
        id: 'settings.sections.system',
        name: '系统',
        items: [{ id: 'x', href: '/backend/config/cache', title: '缓存', pageContext: 'settings', order: 1 }],
      },
    ])
    const catalog = buildCrmNavigation(
      { groups: merged as unknown as CoreNavPayload['groups'], settingsSections: [], profileSections: [], grantedFeatures: [] },
      NAV_GROUP_CATALOG,
    )
    expect(catalog.groups.map((group) => group.id)).toEqual(['home', 'customers', 'sales'])
    expect(catalog.groups.find((group) => group.id === 'home')?.landing).toBe('/backend/workbench')
    expect(catalog.groups.flatMap((group) => group.items.map((entry) => entry.href))).not.toContain('/backend/config/cache')
  })

  it('re-homes settings embedded in a main group instead of dropping them', () => {
    const catalog = buildCrmNavigation(
      payload({
        groups: [
          {
            id: 'legacy.admin',
            name: '管理',
            items: [item('缓存', '/backend/config/cache', { pageContext: 'settings', order: 1 })],
          },
        ],
        settingsSections: [],
        profileSections: [],
      }),
      declared,
    )
    expect(catalog.groups).toEqual([])
    expect(catalog.manage.categories.flatMap((category) => category.items.map((entry) => entry.href))).toEqual([
      '/backend/config/cache',
    ])
    expect(catalog.authorized).toContain('/backend/config/cache')
  })

  it('treats the typed chrome fallback as an error, not as empty authorization', () => {
    const errorCatalog = {
      ...buildCrmNavigation(payload({ groups: [], settingsSections: [], profileSections: [], grantedFeatures: [] }), declared),
      error: true,
    }
    expect(readCrmCatalog({ crm: errorCatalog })).toEqual(errorCatalog)
    expect(selectRail(errorCatalog, false)).toEqual({
      state: 'error',
      groups: [],
      railActions: [],
      utility: [],
    })
  })

})
