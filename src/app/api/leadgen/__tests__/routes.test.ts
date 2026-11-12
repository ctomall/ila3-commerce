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
jest.mock('@/modules/leadgen/services/orm-repository', () => ({
  createRequestLeadgenRepository: jest.fn(async () => ({})),
}))

import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { POST as decisions } from '../candidates/[id]/decisions/route'
import { POST as crmWrite } from '../candidates/[id]/crm-write/route'

const mockAuth = getAuthFromRequest as unknown as Mock<typeof getAuthFromRequest>
const ID = '11111111-1111-4111-8111-111111111111'

function request(body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/leadgen/candidates/${ID}/decisions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
const params = { params: Promise.resolve({ id: ID }) }

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ sub: 'user-1', tenantId: 'tenant-1', orgId: 'org-1' } as never)
})

describe('leadgen decisions route', () => {
  it('requires a session', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await decisions(request({ decision: 'approve', decisionKey: 'decision-key-1' }), params)).status).toBe(401)
  })

  it('rejects an unknown decision before touching storage', async () => {
    const res = await decisions(request({ decision: 'maybe', decisionKey: 'decision-key-1' }), params)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ code: 'invalid_decision' })
  })

  it('requires a merge target and a long decision key', async () => {
    expect((await decisions(request({ decision: 'merge', decisionKey: 'decision-key-1' }), params)).status).toBe(400)
    expect((await decisions(request({ decision: 'approve', decisionKey: 'short' }), params)).status).toBe(400)
  })

  it('404s a non-uuid candidate id', async () => {
    const res = await decisions(request({ decision: 'approve', decisionKey: 'decision-key-1' }), {
      params: Promise.resolve({ id: 'nope' }),
    })
    expect(res.status).toBe(404)
  })
})

describe('leadgen crm-write route', () => {
  it('requires a session', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await crmWrite(request(), params)).status).toBe(401)
  })

  it('404s a non-uuid candidate id', async () => {
    expect((await crmWrite(request(), { params: Promise.resolve({ id: 'nope' }) })).status).toBe(404)
  })
})
