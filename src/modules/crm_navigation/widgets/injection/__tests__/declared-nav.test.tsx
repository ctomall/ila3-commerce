/** @jest-environment jsdom */
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, render } from '@testing-library/react'
import type { CrmCatalog, CrmNavGroup } from '@/nav/crm-navigation'

let mockChrome: { payload: unknown; isLoading: boolean; refresh: () => Promise<void> }
let mockPathname = '/backend/workbench'
let mockCollapsed = false
let mockAiAvailable = true

jest.mock('@open-mercato/ui/backend/BackendChromeProvider', () => ({
  useBackendChrome: () => mockChrome,
}))
jest.mock('@open-mercato/ui/backend/AppShell', () => ({
  useSidebarCollapse: () => ({ collapsed: mockCollapsed, setCollapsed: () => {} }),
}))
jest.mock('@open-mercato/ui/ai', () => ({
  useAiAssistantAvailable: () => mockAiAvailable,
  AI_ASSISTANT_LAUNCHER_OPEN_EVENT: 'om:open-ai-assistant-launcher',
}))
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
jest.mock('@open-mercato/shared/lib/i18n/context', () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}))

import { CrmSidebarNav } from '../sidebar-nav/widget'
import { ContentNav } from '../content-nav/widget'
import { AI_ASSISTANT_LAUNCHER_OPEN_EVENT } from '@open-mercato/ui/ai'

const group = (
  id: string,
  label: string,
  landing: string,
  items: Array<{ href: string; label: string }>,
  order = 10,
): CrmNavGroup => ({
  id,
  label,
  order,
  landing,
  items: items.map((item, index) => ({ ...item, order: index })),
})

function catalog(overrides: Partial<CrmCatalog> = {}): CrmCatalog {
  return {
    version: 2,
    groups: [
      group('home', '工作台', '/backend/workbench', [{ href: '/backend/workbench', label: '工作台' }], 10),
      group(
        'customers',
        '客户',
        '/backend/customers/companies',
        [
          { href: '/backend/customers/companies', label: '公司' },
          { href: '/backend/customers/people', label: '联系人' },
          { href: '/backend/customers/deals', label: '商机' },
        ],
        20,
      ),
      group(
        'content',
        '沟通与资料',
        '/backend/messages',
        [
          { href: '/backend/messages', label: '消息' },
          { href: '/backend/documents', label: '文档' },
        ],
        30,
      ),
    ],
    railActions: [
      {
        id: 'assistant',
        label: 'AI助手',
        action: 'open-ai-assistant',
        icon: 'Sparkles',
        feature: 'ai_assistant.view',
      },
    ],
    utility: [
      { id: 'manage', label: '管理中心', href: '/backend/manage', icon: 'Settings' },
      { id: 'account', label: '个人账户', href: '/backend/profile', icon: 'UserCircle' },
    ],
    manage: { categories: [] },
    personal: { items: [] },
    unknown: [],
    unconfiguredGroups: [],
    actions: [],
    authorized: [],
    duplicates: [],
    ...overrides,
  }
}

function chrome(payload: unknown, isLoading = false) {
  mockChrome = { payload, isLoading, refresh: async () => {} }
}

function renderSidebar(variant: 'desktop' | 'mobile' = 'desktop') {
  return render(<CrmSidebarNav variant={variant} />)
}

function navGroups(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('[data-crm-nav-group]'))
}

beforeEach(() => {
  cleanup()
  mockPathname = '/backend/workbench'
  mockCollapsed = false
  mockAiAvailable = true
  chrome({ crm: catalog() })
})
afterEach(() => cleanup())

describe('declared sidebar rail', () => {
  it('renders only the catalogue top-level groups and the gated rail action', () => {
    mockPathname = '/backend/customers/people'
    const { container } = renderSidebar()

    expect(navGroups(container).map((element) => element.getAttribute('data-crm-nav-group'))).toEqual([
      'home',
      'customers',
      'content',
    ])
    expect(navGroups(container).map((element) => element.getAttribute('href'))).toEqual([
      '/backend/workbench',
      '/backend/customers/companies',
      '/backend/messages',
    ])
    expect(container.querySelector('[data-crm-rail-action="assistant"]')).not.toBeNull()
    // No nested tree: a single flat list, no group headers, no per-href entries.
    expect(container.querySelector('nav ul ul')).toBeNull()
    expect(container.querySelector('[data-sidebar-group]')).toBeNull()
    // Only each group's landing is linked; the group's declared items are not
    // duplicated into the rail.
    expect(container.querySelector('a[href="/backend/customers/people"]')).toBeNull()
    expect(container.querySelector('a[href="/backend/customers/deals"]')).toBeNull()
  })

  it('marks the active group from selectActiveGroup, including detail paths', () => {
    mockPathname = '/backend/customers/companies/42'
    const { container } = renderSidebar()

    const active = container.querySelectorAll('[data-crm-nav-active]')
    expect(active).toHaveLength(1)
    expect(active[0].getAttribute('data-crm-nav-group')).toBe('customers')
    expect(active[0].getAttribute('aria-current')).toBe('page')
    expect(container.querySelectorAll('[data-crm-nav-group][aria-current="page"]')).toHaveLength(1)
  })

  it('resolves /backend to the home group', () => {
    mockPathname = '/backend'
    const { container } = renderSidebar()
    expect(container.querySelector('[data-crm-nav-active]')?.getAttribute('data-crm-nav-group')).toBe('home')
  })

  it('keeps the keyboard focus ring on every rail link', () => {
    const { container } = renderSidebar()
    for (const link of [...navGroups(container), container.querySelector('[data-crm-rail-action="assistant"]')!]) {
      expect(link.getAttribute('class')).toContain('focus-visible:shadow-focus')
    }
  })

  it('renders the AI rail action only when the catalogue provides it', () => {
    chrome({ crm: catalog({ railActions: [] }) })
    const withoutAction = renderSidebar()
    expect(withoutAction.container.querySelector('[data-crm-rail-action]')).toBeNull()

    chrome({ crm: catalog() })
    const withAction = renderSidebar()
    expect(withAction.container.querySelector('[data-crm-rail-action="assistant"]')).not.toBeNull()
  })

  it('respects the assistant mount gate before rendering the action', () => {
    mockAiAvailable = false
    const { container } = renderSidebar()
    expect(container.querySelector('[data-crm-rail-action]')).toBeNull()
  })

  it('dispatches the launcher event from the AI rail action', () => {
    const listener = jest.fn()
    window.addEventListener(AI_ASSISTANT_LAUNCHER_OPEN_EVENT, listener)
    const { container } = renderSidebar()
    const button = container.querySelector<HTMLButtonElement>('[data-crm-rail-action="assistant"]')
    expect(button).not.toBeNull()
    button!.click()
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(AI_ASSISTANT_LAUNCHER_OPEN_EVENT, listener)
  })

  it('renders catalogue utility links in the mobile drawer only', () => {
    const mobile = renderSidebar('mobile')
    expect(mobile.container.querySelector('[data-crm-utility="manage"]')).not.toBeNull()
    expect(mobile.container.querySelector('[data-crm-utility="account"]')).not.toBeNull()
    expect(mobile.container.querySelector('[data-crm-utility="manage"]')?.getAttribute('href')).toBe(
      '/backend/manage',
    )
    cleanup()

    const desktop = renderSidebar('desktop')
    expect(desktop.container.querySelector('[data-crm-utility]')).toBeNull()
  })

  it('keeps collapsed desktop labels as accessible names instead of dropping them', () => {
    mockCollapsed = true
    const { container } = renderSidebar()
    const customers = container.querySelector('[data-crm-nav-group="customers"]')
    expect(customers).not.toBeNull()
    expect(customers!.textContent).toBe('')
    expect(customers!.getAttribute('title')).toBe('客户')
    expect(customers!.getAttribute('aria-label')).toBe('客户')
  })

  it('keeps the exact browser-evidence selectors the runner queries', () => {
    mockPathname = '/backend/customers/people'
    const sidebar = renderSidebar('mobile')
    for (const selector of [
      '[data-crm-scene-nav]',
      '[data-crm-nav-state]',
      '[data-crm-nav-group]',
      '[data-crm-nav-active]',
      '[data-crm-rail-action]',
      '[data-crm-utility]',
    ]) {
      expect(sidebar.container.querySelector(selector)).not.toBeNull()
    }
    cleanup()

    const content = render(<ContentNav />)
    expect(content.container.querySelector('[data-crm-content-group]')).not.toBeNull()
    expect(content.container.querySelector('[data-crm-content-item]')).not.toBeNull()
    expect(
      content.container.querySelector('[data-crm-content-group]')?.getAttribute('data-crm-content-group'),
    ).toBe('customers')
  })

  it('shows the empty authorization message without any rail entries', () => {
    chrome({ crm: catalog({ groups: [], railActions: [], utility: [] }) })
    const { container } = renderSidebar()
    expect(container.querySelector('[data-crm-nav-state="ready"]')).not.toBeNull()
    expect(container.querySelector('[data-crm-nav-empty-message]')?.textContent).toBe(
      '你的账号暂时没有可用的导航入口。',
    )
    expect(container.querySelectorAll('[data-crm-nav-group], [data-crm-rail-action]')).toHaveLength(0)
  })
})

describe('declared content strip', () => {
  it('renders the active group declared items as a flat wrapping strip', () => {
    mockPathname = '/backend/customers/people'
    const { container } = render(<ContentNav />)

    const nav = container.querySelector('[data-crm-content-group]')
    expect(nav?.getAttribute('data-crm-content-group')).toBe('customers')
    expect(nav?.getAttribute('data-crm-content-nav')).not.toBeNull()
    expect(nav?.querySelector('div')?.getAttribute('class')).toContain('flex-wrap')
    expect(nav?.querySelector('ul')).toBeNull()

    const items = Array.from(container.querySelectorAll('[data-crm-content-item]'))
    expect(items.map((item) => item.getAttribute('data-crm-content-item'))).toEqual([
      '/backend/customers/companies',
      '/backend/customers/people',
      '/backend/customers/deals',
    ])
    expect(container.querySelectorAll('[data-crm-content-item][aria-current="page"]')).toHaveLength(1)
    expect(
      container.querySelector('[data-crm-content-item][aria-current="page"]')?.getAttribute(
        'data-crm-content-item',
      ),
    ).toBe('/backend/customers/people')
  })

  it('keeps the strip on a detail page and resolves the longest matching item prefix', () => {
    chrome({
      crm: catalog({
        groups: [
          group('customers', '客户', '/backend/customers/companies', [
            { href: '/backend/customers', label: '客户概览' },
            { href: '/backend/customers/companies', label: '公司' },
            { href: '/backend/customers/people', label: '联系人' },
          ]),
        ],
        railActions: [],
        utility: [],
      }),
    })
    mockPathname = '/backend/customers/companies/42'
    const { container } = render(<ContentNav />)
    expect(
      container.querySelector('[data-crm-content-item][aria-current="page"]')?.getAttribute(
        'data-crm-content-item',
      ),
    ).toBe('/backend/customers/companies')
  })

  it('hides the strip for a group with fewer than two declared items', () => {
    mockPathname = '/backend/workbench'
    const { container } = render(<ContentNav />)
    expect(container.querySelector('[data-crm-content-group]')).toBeNull()
    expect(container).toBeEmptyDOMElement()
  })

  it('hides the strip outside the declared top-level groups', () => {
    mockPathname = '/backend/manage'
    const first = render(<ContentNav />)
    expect(first.container.querySelector('[data-crm-content-group]')).toBeNull()
    cleanup()

    mockPathname = '/backend/profile'
    const second = render(<ContentNav />)
    expect(second.container.querySelector('[data-crm-content-group]')).toBeNull()
  })

  it('hides the strip while the catalogue is loading or unavailable', () => {
    chrome(null, true)
    mockPathname = '/backend/customers/people'
    const loading = render(<ContentNav />)
    expect(loading.container.querySelector('[data-crm-content-group]')).toBeNull()
    cleanup()

    chrome(null, false)
    const unavailable = render(<ContentNav />)
    expect(unavailable.container.querySelector('[data-crm-content-group]')).toBeNull()
  })
})
