import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from '@jest/globals'
import { buildCrmNavigation, readCrmCatalog, SCENE_MAP, selectRail, type CoreNavPayload } from '../crm-navigation'

const APPENDIX = path.resolve(__dirname, '../../../docs/crm-platform/appendix')

function baseline(role: 'admin' | 'employee' | 'superadmin'): CoreNavPayload {
  return JSON.parse(fs.readFileSync(path.join(APPENDIX, `nav-${role}.json`), 'utf8')) as CoreNavPayload
}

function item(title: string, href: string, extra: Record<string, unknown> = {}) {
  return { id: href, title, href, pageContext: 'main', ...extra }
}

function payload(overrides: Partial<CoreNavPayload> = {}): CoreNavPayload {
  return {
    groups: [
      {
        id: 'sales',
        name: '销售业务',
        items: [
          item('公司', '/backend/customers/companies'),
          item('联系人', '/backend/customers/people'),
          item('商机', '/backend/customers/deals', {
            children: [item('销售漏斗', '/backend/customers/deals/pipeline')],
          }),
          item('商机设置', '/backend/config/customers/deals'),
          item('添加资源类型', '/backend/resources/resource-types/create'),
        ],
      },
    ],
    settingsSections: [
      {
        id: 'settings.sections.system',
        label: '系统',
        items: [{ id: 'cache', label: '缓存', href: '/backend/config/cache' }],
      },
    ],
    grantedFeatures: ['ai_assistant.view', 'customers.companies.view'],
    ...overrides,
  }
}

describe('buildCrmNavigation', () => {
  it('buckets authorized entries into scenes and management categories', () => {
    const catalog = buildCrmNavigation(payload())
    expect(catalog.scenes.map((scene) => scene.id)).toEqual(['assistant', 'customers'])
    expect(catalog.customers.tabs.map((tab) => tab.id)).toEqual(['companies', 'people', 'deals'])
    expect(catalog.business.categories).toEqual([])
    expect(catalog.manage.categories.flatMap((category) => category.items.map((entry) => entry.href))).toEqual([
      '/backend/config/cache',
      '/backend/config/customers/deals',
    ])
    expect(catalog.unknown).toEqual([])
  })

  it('keeps child entries under their parent within one business category', () => {
    const catalog = buildCrmNavigation(
      payload({
        groups: [
          {
            id: 'sales',
            name: '销售业务',
            items: [
              item('销售渠道', '/backend/sales/channels', {
                children: [item('渠道报价', '/backend/sales/channels/offers')],
              }),
            ],
          },
        ],
        settingsSections: [],
      }),
    )
    const sales = catalog.business.categories.find((category) => category.id === 'sales')
    expect(sales?.items.map((entry) => entry.href)).toEqual(['/backend/sales/channels'])
    expect(sales?.items[0].children?.map((child) => child.href)).toEqual(['/backend/sales/channels/offers'])
    expect(catalog.customers.insights).toEqual([])
  })

  it('treats create forms as in-page actions, not navigation', () => {
    const catalog = buildCrmNavigation(payload())
    expect(catalog.actions).toEqual(['/backend/resources/resource-types/create'])
    const rendered = JSON.stringify({
      customers: catalog.customers,
      business: catalog.business,
      manage: catalog.manage,
      messages: catalog.messages,
      personal: catalog.personal,
    })
    expect(rendered).not.toContain('/backend/resources/resource-types/create')
  })

  it('never renders an href that has no owner, and reports it', () => {
    const catalog = buildCrmNavigation(
      payload({
        groups: [
          {
            id: 'new_module',
            name: '新模块',
            items: [item('神秘入口', '/backend/brand-new/thing')],
          },
        ],
      }),
    )
    expect(catalog.unknown).toEqual(['/backend/brand-new/thing'])
    expect(JSON.stringify(catalog.business)).not.toContain('/backend/brand-new/thing')
  })

  it('renders no scenes or utility entries for an empty grant set', () => {
    const catalog = buildCrmNavigation(payload({ groups: [], settingsSections: [], profileSections: [], grantedFeatures: [] }))
    expect(catalog.scenes).toEqual([])
    expect(catalog.utility).toEqual([])
    expect(catalog.unknown).toEqual([])
  })

  it('hides scenes the caller has no entries for', () => {
    const catalog = buildCrmNavigation(payload({ groups: [], settingsSections: [] }))
    // Only the feature-gated AI scene remains: workbench has no authorized
    // entry in this payload, and the account entry has no profile content.
    expect(catalog.scenes.map((scene) => scene.id)).toEqual(['assistant'])
    expect(catalog.utility).toEqual([])
  })

  it('does not repeat an href across surfaces', () => {
    const catalog = buildCrmNavigation(baseline('admin'))
    const rendered = [
      ...catalog.business.categories.flatMap((category) => category.items.flatMap((entry) => [entry.href, ...(entry.children ?? []).map((child) => child.href)])),
      ...catalog.manage.categories.flatMap((category) => category.items.map((entry) => entry.href)),
      ...catalog.messages.items.map((entry) => entry.href),
      ...catalog.personal.items.map((entry) => entry.href),
      ...catalog.customers.followup.map((entry) => entry.href),
      ...catalog.customers.insights.map((entry) => entry.href),
    ]
    expect(new Set(rendered).size).toBe(rendered.length)
  })
})

describe('selectRail', () => {
  it('never substitutes the full scene list while loading or after a failure', () => {
    expect(selectRail(null, true)).toEqual({ state: 'loading', scenes: [], utility: [] })
    expect(selectRail(null, false)).toEqual({ state: 'error', scenes: [], utility: [] })
  })

  it('treats an explicitly empty authorized catalogue as ready and empty', () => {
    const catalog = buildCrmNavigation(payload({ groups: [], settingsSections: [], profileSections: [], grantedFeatures: [] }))
    expect(selectRail(catalog, false)).toEqual({ state: 'ready', scenes: [], utility: [] })
  })

  it('reads only a real CRM payload', () => {
    expect(readCrmCatalog(null)).toBeNull()
    expect(readCrmCatalog({ groups: [] })).toBeNull()
    expect(readCrmCatalog({ crm: { scenes: [] } })).toBeNull()
    expect(readCrmCatalog({ crm: { scenes: [], utility: [] } })).toEqual({ scenes: [], utility: [] })
  })
})

describe('scene map', () => {
  it('declares every frozen baseline entry, for every role', () => {
    const mapped = new Set(Object.keys(SCENE_MAP.entries))
    for (const role of ['admin', 'employee', 'superadmin'] as const) {
      const live = new Set<string>()
      const collect = (items: Array<{ href?: string; children?: unknown[] }> | undefined) => {
        for (const entry of items ?? []) {
          if (entry.href) live.add(entry.href)
          collect(entry.children as Array<{ href?: string; children?: unknown[] }> | undefined)
        }
      }
      const data = baseline(role)
      for (const group of data.groups ?? []) collect(group.items as never)
      for (const section of data.settingsSections ?? []) collect(section.items as never)
      for (const section of data.profileSections ?? []) collect(section.items as never)
      for (const href of live) expect(mapped.has(href)).toBe(true)
    }
  })

  it('uses a declared category for every management entry', () => {
    const declared = new Set(SCENE_MAP.manageCategories.map((category) => category.id))
    for (const [href, spec] of Object.entries(SCENE_MAP.entries)) {
      if (spec.surface !== 'manage') continue
      expect(declared.has(spec.category ?? '')).toBe(true)
      expect(spec.disposition).toBe('nav')
      expect(href.startsWith('/backend/')).toBe(true)
    }
  })

  it('uses a declared category for every business entry', () => {
    const declared = new Set(SCENE_MAP.businessCategories.map((category) => category.id))
    for (const spec of Object.values(SCENE_MAP.entries)) {
      if (spec.surface !== 'business') continue
      expect(declared.has(spec.category ?? '')).toBe(true)
    }
  })

  it('keeps settings pages out of the daily business surface', () => {
    for (const [href, spec] of Object.entries(SCENE_MAP.entries)) {
      if (spec.surface !== 'business') continue
      expect(href).not.toMatch(/\/settings$/)
      expect(href.startsWith('/backend/config/')).toBe(false)
    }
    expect(SCENE_MAP.entries['/backend/staff/time-tracking/settings']?.surface).toBe('manage')
    expect(SCENE_MAP.entries['/backend/warranty_claims/settings']?.surface).toBe('manage')
  })

  it('pins only hrefs that are owned by the business surface', () => {
    expect(SCENE_MAP.businessPinned.length).toBeGreaterThan(0)
    for (const href of SCENE_MAP.businessPinned) {
      expect(SCENE_MAP.entries[href]?.surface).toBe('business')
    }
  })
})
