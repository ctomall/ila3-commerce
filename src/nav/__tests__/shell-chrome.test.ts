import { describe, expect, it } from '@jest/globals'
import {
  buildShellChrome,
  SHELL_HREF_ALIASES,
  shellHref,
  shellHrefs,
} from '../shell-chrome'
import type { CrmCatalog, CrmNavGroup } from '../crm-navigation'

function group(
  id: string,
  label: string,
  labelKey: string,
  landing: string,
  items: Array<{ href: string; label: string; iconName?: string; order?: number }>,
): CrmNavGroup {
  return {
    id,
    label,
    labelKey,
    order: 10,
    landing,
    iconName: items[0]?.iconName,
    items: items.map((item) => ({ ...item })),
  }
}

function catalog(overrides: Partial<CrmCatalog> = {}): CrmCatalog {
  return {
    version: 2,
    groups: [
      group('home', '工作台', 'crmNav.group.home', '/backend/workbench', [
        { href: '/backend/workbench', label: '工作台', iconName: 'Building2', order: 5 },
      ]),
      group('customers', '客户', 'crmNav.group.customers', '/backend/customers/companies', [
        { href: '/backend/customers/companies', label: '公司', iconName: 'building2', order: 110 },
        { href: '/backend/customers/people', label: '联系人', iconName: 'users', order: 100 },
      ]),
    ],
    railActions: [],
    utility: [
      { id: 'manage', label: '管理中心', href: '/backend/manage', icon: 'Settings' },
      { id: 'account', label: '个人账户', href: '/backend/profile', icon: 'UserCircle' },
    ],
    manage: { categories: [] },
    personal: { items: [] },
    unknown: [],
    unconfiguredSettings: [],
    unconfiguredProfile: [],
    unconfiguredGroups: [],
    actions: [],
    authorized: [],
    duplicates: [],
    ...overrides,
  }
}

const translate = (key: string, fallback: string) =>
  ({
    'crmNav.group.home': 'Workbench',
    'crmNav.group.customers': 'Customers',
    'crmNav.utility.manage': 'Management centre',
  })[key] ?? fallback

describe('AppShell chrome mapping', () => {
  it('feeds the shell one group per declared catalogue group, in catalogue order', () => {
    const shell = buildShellChrome(catalog(), translate)

    expect(shell.groups.map((entry) => entry.id)).toEqual(['home', 'customers'])
    expect(shell.groups[0].name).toBe('Workbench')
    expect(shell.groups[1].name).toBe('Customers')
    // The shell reads `name`; the untranslated declaration stays inspectable.
    expect(shell.groups[0].defaultName).toBe('工作台')
  })

  it('maps items to the shape AppShell renderSidebar reads', () => {
    const shell = buildShellChrome(catalog(), translate)
    const customers = shell.groups.find((entry) => entry.id === 'customers')!

    expect(customers.items).toEqual([
      {
        id: '/backend/customers/companies',
        href: '/backend/customers/companies',
        title: '公司',
        defaultTitle: '公司',
        iconName: 'building2',
        iconMarkup: undefined,
        order: 110,
      },
      {
        id: '/backend/customers/people',
        href: '/backend/customers/people',
        title: '联系人',
        defaultTitle: '联系人',
        iconName: 'users',
        iconMarkup: undefined,
        order: 100,
      },
    ])
    // No `label`/`labelKey` keys leak into the shell item contract.
    expect(Object.keys(customers.items[0]).sort()).toEqual([
      'defaultTitle',
      'href',
      'iconMarkup',
      'iconName',
      'id',
      'order',
      'title',
    ])
  })

  it('renders the declared workbench entry at the real dashboard destination', () => {
    // `/backend/workbench` only redirects to `/backend`
    // (src/modules/workbench/backend/workbench/page.tsx), and the stock shell
    // matches the active item by href === pathname. Link the real destination
    // while keeping the declared id/title/icon/order.
    const shell = buildShellChrome(catalog(), translate)
    const home = shell.groups.find((entry) => entry.id === 'home')!

    expect(home.items[0]).toMatchObject({
      id: '/backend/workbench',
      href: '/backend',
      title: '工作台',
      defaultTitle: '工作台',
      iconName: 'Building2',
      order: 5,
    })
    expect(SHELL_HREF_ALIASES).toEqual({ '/backend/workbench': '/backend' })
    expect(shellHref('/backend/calendar')).toBe('/backend/calendar')
  })

  it('keeps every declared item exactly once and adds only the management hub', () => {
    const shell = buildShellChrome(catalog(), translate)
    const hrefs = shellHrefs(shell)

    // The hub is a fixed footer entry now, not part of the scrolling groups.
    expect(hrefs).toEqual([
      '/backend',
      '/backend/customers/companies',
      '/backend/customers/people',
    ])
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('keeps the management hub out of the scrolling groups', () => {
    const shell = buildShellChrome(catalog(), translate)

    expect(shellHrefs(shell)).not.toContain('/backend/manage')
    // It stays in the catalogue so search and the fixed footer entry can use it.
    expect(catalog().utility.map((entry) => entry.id)).toContain('manage')
  })

  it('renders a declared hub entry exactly where the catalogue puts it', () => {
    const shell = buildShellChrome(
      catalog({
        groups: [
          group('home', '工作台', 'crmNav.group.home', '/backend/workbench', [
            { href: '/backend/workbench', label: '工作台', order: 5 },
            { href: '/backend/manage', label: '管理中心', order: 60 },
          ]),
        ],
      }),
      translate,
    )

    // A module that declares the hub as a page keeps it in its own group; the
    // footer shortcut is additive and never duplicates the href.
    expect(shellHrefs(shell).filter((href) => href === '/backend/manage')).toHaveLength(1)
  })

  it('keeps the sidebar constant by leaving the section panels empty', () => {
    const shell = buildShellChrome(catalog(), translate)

    expect(shell.settingsSections).toEqual([])
    expect(shell.profileSections).toEqual([])
    expect(shell.settingsPathPrefixes).toEqual([])
    expect(shell.profilePathPrefixes).toEqual([])
  })
})
