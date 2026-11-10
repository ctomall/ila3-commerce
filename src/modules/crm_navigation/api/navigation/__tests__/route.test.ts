import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { NextRequest } from 'next/server'

type CoreNavResult = {
  ok: boolean
  status: number
  attempts: number
  reason?: string
  payload?: unknown
}

const mockAuth = jest.fn(async () => ({ sub: 'user-1', tenantId: 'tenant-1', orgId: 'org-1' }))
const mockFetchCoreNavigation = jest.fn<() => Promise<CoreNavResult>>()
const mockTranslate = jest.fn((_key: string, fallback: string) => fallback)

jest.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: mockAuth,
}))
jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: mockTranslate }),
}))
jest.mock('../../../lib/core-nav', () => ({
  coreNavigationUrl: () => 'http://127.0.0.1:1/api/auth/admin/nav',
  fetchCoreNavigation: mockFetchCoreNavigation,
}))
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}))

import { GET } from '../route'
import { shellHref } from '@/nav/shell-chrome'

const payload = {
  groups: [
    {
      id: 'home',
      name: '工作台',
      items: [
        { id: '/backend/workbench', href: '/backend/workbench', title: '工作台', order: 5, pageContext: 'main' },
      ],
    },
    {
      id: 'customers',
      name: '客户',
      items: [
        { id: '/backend/customers/companies', href: '/backend/customers/companies', title: '公司', order: 110, iconName: 'building2' },
        { id: '/backend/customers/people', href: '/backend/customers/people', title: '联系人', order: 100 },
        { id: '/backend/customers/companies/create', href: '/backend/customers/companies/create', title: '新建公司' },
      ],
    },
  ],
  settingsSections: [
    {
      id: 'settings.sections.system',
      label: '系统',
      items: [{ id: 'cache', href: '/backend/config/cache', title: '缓存', order: 1, pageContext: 'settings' }],
    },
  ],
  profileSections: [
    {
      id: 'profile.sections.account',
      label: '账户',
      items: [{ id: 'password', href: '/backend/profile/change-password', title: '修改密码', order: 1, pageContext: 'profile' }],
    },
  ],
  grantedFeatures: [],
}

function request(url = 'http://127.0.0.1:3000/api/crm_navigation/navigation'): NextRequest {
  return {
    headers: { get: () => 'session=test' },
    nextUrl: { searchParams: new URL(url).searchParams },
  } as unknown as NextRequest
}

beforeEach(() => {
  mockAuth.mockClear()
  mockTranslate.mockClear()
  mockFetchCoreNavigation.mockReset()
  mockFetchCoreNavigation.mockResolvedValue({ ok: true, status: 200, attempts: 1, payload })
})

describe('CRM navigation chrome route', () => {
  it('returns the catalogue groups in the installed AppShell shape', async () => {
    const res = await GET(request())
    const body = await res.json()

    expect(body.groups.map((group: { id: string }) => group.id)).toEqual([
      'home',
      'customers',
      'crm_navigation.utility',
    ])
    expect(body.groups[0].items[0]).toMatchObject({
      id: '/backend/workbench',
      href: '/backend',
      title: '工作台',
    })
    expect(body.groups[1].items.map((item: { href: string }) => item.href)).toEqual([
      '/backend/customers/people',
      '/backend/customers/companies',
    ])
    expect(body.groups[1].items[0]).toMatchObject({
      id: '/backend/customers/people',
      href: '/backend/customers/people',
      title: '联系人',
      order: 100,
    })
    // The management hub is the only shell-only entry, so the hidden
    // `/backend/manage` page cannot be orphaned.
    expect(body.groups[2].items).toEqual([
      expect.objectContaining({ href: '/backend/manage', title: '管理中心' }),
    ])
  })

  it('keeps the sidebar constant: no settings/profile section panel or prefixes', async () => {
    const res = await GET(request())
    const body = await res.json()

    expect(body.settingsSections).toEqual([])
    expect(body.profileSections).toEqual([])
    expect(body.settingsPathPrefixes).toEqual([])
    expect(body.profilePathPrefixes).toEqual([])
    // The catalogue stays attached for the management centre and the gate.
    expect(body.crm.version).toBe(2)
    expect(body.crm.manage.categories.flatMap((section: { items: { href: string }[] }) => section.items.map((item) => item.href))).toEqual([
      '/backend/config/cache',
    ])
  })

  it('renders every shell href once and never beyond daily items plus the hub', async () => {
    const res = await GET(request())
    const body = await res.json()
    const shellHrefs = body.groups.flatMap((group: { items: { href: string }[] }) =>
      group.items.map((item) => item.href),
    )
    const dailyHrefs = body.crm.groups.flatMap((group: { items: { href: string }[] }) =>
      group.items.map((item) => item.href),
    )

    expect(new Set(shellHrefs).size).toBe(shellHrefs.length)
    expect(shellHrefs).toEqual([...dailyHrefs.map((href: string) => shellHref(href)), '/backend/manage'])
  })

  it('serves the typed empty chrome fallback when the core navigation is unavailable', async () => {
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockFetchCoreNavigation.mockResolvedValue({ ok: false, status: 502, reason: 'upstream', attempts: 2 })
    const res = await GET(request('http://127.0.0.1:3000/api/crm_navigation/navigation?chrome=1'))
    const body = await res.json()
    errorLog.mockRestore()

    expect(res.status).toBe(200)
    expect(body.groups).toEqual([])
    expect(body.settingsSections).toEqual([])
    expect(body.crm.error).toBe(true)
  })
})
