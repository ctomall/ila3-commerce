import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { NextRequest } from 'next/server'

const mockAuth = jest.fn(async () => ({ sub: 'user-1', tenantId: 'tenant-1', orgId: 'org-1' }))
const mockScope = jest.fn(async () => ({ userId: 'user-1', tenantId: 'tenant-1', organizationId: 'org-1' }))
const mockLoadLayout = jest.fn(async () => ({ config: { version: 1, order: [], hidden: [], labels: {}, presets: [], assignments: {} }, revision: null }))
const mockSaveLayout = jest.fn(async (_em: unknown, _scope: unknown, config: unknown) => ({ config, revision: 3 }))
const mockLoadPreference = jest.fn(async () => ({ favorites: [], recentWorkspace: null, selectedPreset: null }))
const mockSavePreference = jest.fn(async (_em: unknown, _scope: unknown, value: unknown) => value)

jest.mock('@open-mercato/shared/lib/auth/server', () => ({ getAuthFromRequest: mockAuth }))
jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: async () => ({ resolve: () => ({ fork: () => ({}) }) }),
}))
jest.mock('../lib/scope', () => ({ resolveWorkspaceScope: mockScope }))
jest.mock('../lib/repository', () => ({
  loadLayout: () => mockLoadLayout(),
  saveLayout: (em: unknown, scope: unknown, config: unknown) => mockSaveLayout(em, scope, config),
  loadPreference: () => mockLoadPreference(),
  savePreference: (em: unknown, scope: unknown, value: unknown) => mockSavePreference(em, scope, value),
}))
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      status: init?.status ?? 200,
      headers: { get: (key: string) => (init?.headers ?? {})[key] ?? null },
      json: async () => body,
    }),
  },
}))

import { GET as getLayout, PUT as putLayout } from '../api/layout/route'
import { PUT as putPreference } from '../api/preferences/route'

function request(body?: unknown): NextRequest {
  return { json: async () => body, headers: { get: () => null } } as unknown as NextRequest
}

beforeEach(() => {
  mockAuth.mockClear()
  mockScope.mockClear()
  mockLoadLayout.mockClear()
  mockSaveLayout.mockClear()
})

describe('workspace layout API', () => {
  it('refuses an anonymous caller before touching storage', async () => {
    mockAuth.mockResolvedValueOnce(null as never)
    const res = await getLayout(request())
    expect(res.status).toBe(401)
    expect(mockLoadLayout).not.toHaveBeenCalled()
  })

  it('refuses an all-organizations caller instead of guessing an organization', async () => {
    mockScope.mockResolvedValueOnce(null as never)
    const res = await getLayout(request())
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('organization_required')
  })

  it('returns the stored layout with no-store', async () => {
    const res = await getLayout(request())
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect((await res.json()).revision).toBeNull()
  })

  it('rejects a malformed document with a stable code', async () => {
    const res = await putLayout(request({ config: { order: ['Not An Id'] } }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('invalid_layout')
    expect(mockSaveLayout).not.toHaveBeenCalled()
  })

  it('stores the normalized document, dropping duplicates', async () => {
    const res = await putLayout(request({ config: { order: ['trade', 'trade'] } }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.config.order).toEqual(['trade'])
    expect(mockSaveLayout).toHaveBeenCalledTimes(1)
  })
})

describe('navigation preference API', () => {
  it('rejects a favorite that is not a backend path', async () => {
    const res = await putPreference(request({ favorites: ['https://evil.test'] }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('invalid_preference')
  })

  it('saves a valid preference', async () => {
    const res = await putPreference(request({ favorites: ['/backend/manage'], recentWorkspace: 'customers' }))
    expect(res.status).toBe(200)
    expect((await res.json()).preference).toMatchObject({ recentWorkspace: 'customers' })
  })
})
