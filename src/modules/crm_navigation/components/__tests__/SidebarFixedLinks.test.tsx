/** @jest-environment jsdom */
import * as React from 'react'
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { render, screen } from '@testing-library/react'

let mockPath = '/backend/customers/companies'
let mockCollapsed = false
let mockPayload: unknown

jest.mock('next/navigation', () => ({ usePathname: () => mockPath }))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}))
jest.mock('@open-mercato/ui/backend/AppShell', () => ({
  useSidebarCollapse: () => ({ collapsed: mockCollapsed, setCollapsed: () => {} }),
}))
jest.mock('@open-mercato/ui/backend/BackendChromeProvider', () => ({
  useBackendChrome: () => ({ payload: mockPayload }),
}))
jest.mock('@open-mercato/shared/lib/i18n/context', () => ({ useT: () => (_key: string, fallback: string) => fallback }))

import { SidebarFixedLinks } from '../SidebarFixedLinks'

const catalog = {
  version: 2,
  groups: [],
  railActions: [],
  utility: [{ id: 'manage', label: '管理中心', href: '/backend/manage', icon: 'Settings' }],
  manage: { categories: [] },
  personal: { items: [] },
}

beforeEach(() => {
  mockPath = '/backend/customers/companies'
  mockCollapsed = false
  mockPayload = { crm: catalog }
})

describe('fixed sidebar entry', () => {
  it('renders the hub link with its label when expanded', () => {
    render(<SidebarFixedLinks />)
    const link = screen.getByRole('link', { name: '管理中心' })
    expect(link.getAttribute('href')).toBe('/backend/manage')
    expect(link.getAttribute('data-sidebar-fixed-link')).toBe('manage')
    expect(link.getAttribute('aria-current')).toBeNull()
  })

  it('marks the hub active on its own route', () => {
    mockPath = '/backend/manage'
    render(<SidebarFixedLinks />)
    expect(screen.getByRole('link', { name: '管理中心' }).getAttribute('aria-current')).toBe('page')
  })

  it('keeps the icon and an aria-label in compact mode', () => {
    mockCollapsed = true
    render(<SidebarFixedLinks />)
    const link = screen.getByRole('link', { name: '管理中心' })
    expect(link.getAttribute('title')).toBe('管理中心')
    expect(screen.queryByText('管理中心')).toBeNull()
  })

  it('renders nothing when the authorized catalogue has no hub', () => {
    mockPayload = { crm: { ...catalog, utility: [] } }
    const { container } = render(<SidebarFixedLinks />)
    expect(container).toBeEmptyDOMElement()
  })
})
