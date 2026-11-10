/** @jest-environment jsdom */
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, render, screen } from '@testing-library/react'
import type { CrmCatalog } from '@/nav/crm-navigation'

let mockChrome: { payload: unknown; isLoading: boolean; refresh: () => Promise<void> }

jest.mock('@open-mercato/ui/backend/BackendChromeProvider', () => ({
  useBackendChrome: () => mockChrome,
}))
jest.mock('@open-mercato/ui/backend/AppShell', () => ({
  useSidebarCollapse: () => ({ collapsed: false, setCollapsed: () => {} }),
}))
jest.mock('@open-mercato/ui/ai', () => ({
  useAiAssistantAvailable: () => true,
  AI_ASSISTANT_LAUNCHER_OPEN_EVENT: 'om:open-ai-assistant-launcher',
}))
jest.mock('next/navigation', () => ({ usePathname: () => '/backend/workbench' }))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
jest.mock('@open-mercato/shared/lib/i18n/context', () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}))

import { CrmSidebarNav } from '../sidebar-nav/widget'
import manageWidget from '../manage-link/widget'

const emptyCatalog: CrmCatalog = {
  version: 2,
  groups: [],
  railActions: [],
  utility: [],
  manage: { categories: [] },
  personal: { items: [] },
  unknown: [],
  unconfiguredGroups: [],
  actions: [],
  authorized: [],
  duplicates: [],
}

function chrome(payload: unknown, isLoading = false) {
  mockChrome = { payload, isLoading, refresh: async () => {} }
}

beforeEach(() => cleanup())
afterEach(() => cleanup())

describe('CrmSidebarNav authorization states', () => {
  it('renders an explicitly empty rail as ready and empty, never the full scene list', () => {
    chrome({ crm: emptyCatalog })
    const { container } = render(<CrmSidebarNav variant="desktop" />)
    expect(container.querySelector('[data-crm-nav-state="ready"]')).not.toBeNull()
    expect(container.querySelector('[data-crm-nav-empty="true"]')).not.toBeNull()
    expect(container.querySelector('[data-crm-nav-empty-message]')?.textContent).toBe(
      '你的账号暂时没有可用的导航入口。',
    )
    expect(container.querySelectorAll('[data-crm-nav-group], [data-crm-rail-action]').length).toBe(0)
  })

  it('renders a loading skeleton, not five fake scenes', () => {
    chrome(null, true)
    const { container } = render(<CrmSidebarNav variant="desktop" />)
    expect(container.querySelector('[data-crm-nav-state="loading"]')).not.toBeNull()
    expect(container.querySelector('[data-crm-nav-loading]')).not.toBeNull()
    expect(container.querySelectorAll('[data-crm-nav-group], [data-crm-rail-action]').length).toBe(0)
  })

  it('renders an error affordance, not a fallback catalogue, and retries the payload', () => {
    const refresh = jest.fn(async () => {})
    mockChrome = { payload: null, isLoading: false, refresh }
    const { container } = render(<CrmSidebarNav variant="desktop" />)
    expect(container.querySelector('[data-crm-nav-state="error"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-crm-nav-group], [data-crm-rail-action]').length).toBe(0)
    expect(screen.getByText('导航加载失败')).toBeTruthy()
    screen.getByRole('button', { name: '重试' }).click()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('does not render the management entry without authorized management content', () => {
    chrome({ crm: emptyCatalog })
    const { container } = render(<manageWidget.Widget />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the management entry when the catalogue grants it', () => {
    chrome({
      crm: {
        ...emptyCatalog,
        utility: [{ id: 'manage', label: '管理中心', href: '/backend/manage', icon: 'Settings' }],
      },
    })
    const { container } = render(<manageWidget.Widget />)
    expect(container.querySelector('[data-crm-utility="manage"]')).not.toBeNull()
  })

  it('renders no mobile utility links for an empty grant set', () => {
    chrome({ crm: emptyCatalog })
    const { container } = render(<CrmSidebarNav variant="mobile" />)
    expect(container.textContent).not.toContain('管理中心')
    expect(container.textContent).not.toContain('个人账户')
  })
})
