/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Mock } from 'jest-mock'
import { NextRequest } from 'next/server'

jest.mock('@/bootstrap-api', () => ({ bootstrap: jest.fn() }))
jest.mock('@open-mercato/shared/lib/auth/server', () => ({ getAuthFromRequest: jest.fn() }))
jest.mock('@open-mercato/shared/lib/logger', () => {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { createLogger: () => logger }
})
jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: jest.fn(async () => ({
    resolve: () => ({ userHasAllFeatures: jest.fn(async () => true) }),
  })),
}))
jest.mock('@/modules/customer_access/services/orm-repository', () => ({
  createRequestCustomerAccessRepository: jest.fn(async () => ({
    listLive: jest.fn(async () => [
      {
        id: 'g-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-2',
        customerEntityId: 'c-1',
        accessLevel: 'view',
        grantedBy: 'admin-1',
        createdAt: '2026-11-12T00:00:00.000Z',
        revokedAt: null,
      },
    ]),
    upsert: jest.fn(async (input: { customerEntityId: string; accessLevel: string }) => ({
      id: 'g-2',
      userId: 'user-2',
      customerEntityId: input.customerEntityId,
      accessLevel: input.accessLevel,
      revokedAt: null,
    })),
    revoke: jest.fn(async () => ({ id: 'g-2', revokedAt: '2026-11-12T01:00:00.000Z' })),
  })),
}))

import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { GET, POST } from '../route'
import { DELETE } from '../[id]/route'

const mockAuth = getAuthFromRequest as unknown as Mock<typeof getAuthFromRequest>
const CUSTOMER = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'

function request(method: string, body?: unknown, url = 'http://localhost/api/internal/customer-access'): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ sub: 'admin-1', tenantId: 'tenant-1', orgId: 'org-1' } as never)
})

describe('GET /api/internal/customer-access', () => {
  it('requires a session', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await GET(request('GET'))).status).toBe(401)
  })

  it('rejects a malformed userId before touching the repository', async () => {
    const res = await GET(request('GET', undefined, `http://localhost/api/internal/customer-access?userId=nope`))
    expect(res.status).toBe(400)
  })

  it('lists live grants for the requested employee', async () => {
    const res = await GET(
      request('GET', undefined, `http://localhost/api/internal/customer-access?userId=${USER}`),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { grants: Array<{ id: string }> }
    expect(body.grants).toHaveLength(1)
  })
})

describe('POST /api/internal/customer-access', () => {
  it('rejects an unknown access level', async () => {
    const res = await POST(
      request('POST', { userId: USER, customerEntityId: CUSTOMER, accessLevel: 'admin' }),
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ code: 'invalid_access_level' })
  })

  it('creates a grant with the session scope', async () => {
    const res = await POST(
      request('POST', { userId: USER, customerEntityId: CUSTOMER, accessLevel: 'edit' }),
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ grant: { customerEntityId: CUSTOMER } })
  })
})

describe('DELETE /api/internal/customer-access/[id]', () => {
  it('404s a non-uuid grant id', async () => {
    const res = await DELETE(request('DELETE'), { params: Promise.resolve({ id: 'nope' }) })
    expect(res.status).toBe(404)
  })

  it('revokes a grant', async () => {
    const res = await DELETE(request('DELETE'), { params: Promise.resolve({ id: CUSTOMER }) })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ grant: { revokedAt: expect.any(String) } })
  })
})
