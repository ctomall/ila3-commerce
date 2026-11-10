/** @jest-environment jsdom */
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, render, screen } from '@testing-library/react'
import type { CrmCatalog } from '@/nav/crm-navigation'

let mockChrome: { payload: unknown; isLoading: boolean; refresh: () => Promise<void> }

jest.mock('@open-mercato/ui/backend/BackendChromeProvider', () => ({
  useBackendChrome: () => mockChrome,
}))
jest.mock('@open-mercato/shared/lib/i18n/context', () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}))

import widget from '../nav-error/widget'

function catalog(overrides: Partial<CrmCatalog> = {}): CrmCatalog {
  return {
    version: 2,
    groups: [],
    railActions: [],
    utility: [],
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

function chrome(payload: unknown, isLoading = false, refresh: () => Promise<void> = async () => {}) {
  mockChrome = { payload, isLoading, refresh }
}

beforeEach(() => cleanup())
afterEach(() => cleanup())

describe('sidebar navigation error card', () => {
  it('renders nothing while the chrome payload is still loading', () => {
    chrome(null, true)
    const { container } = render(<widget.Widget />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the catalogue is healthy', () => {
    // Normal state, including an explicitly empty authorization: zero groups is
    // not an error, so the stock empty sidebar stays untouched.
    chrome({ crm: catalog({ groups: [] }) })
    const { container } = render(<widget.Widget />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renders a localized alert with retry when the catalogue request failed', () => {
    const refresh = jest.fn(async () => {})
    chrome(null, false, refresh)
    const { container } = render(<widget.Widget />)

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(container.querySelector('[data-crm-nav-error]')).not.toBeNull()
    expect(screen.getByText('导航加载失败')).toBeTruthy()
    screen.getByRole('button', { name: '重试' }).click()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('renders the alert for the typed chrome error fallback', () => {
    chrome({ crm: { ...catalog(), error: true } })
    const { container } = render(<widget.Widget />)
    expect(container.querySelector('[data-crm-nav-error]')).not.toBeNull()
  })

  it('renders the alert when the settled payload carries no catalogue', () => {
    chrome({ grantedFeatures: [] })
    const { container } = render(<widget.Widget />)
    expect(container.querySelector('[data-crm-nav-error]')).not.toBeNull()
  })
})
