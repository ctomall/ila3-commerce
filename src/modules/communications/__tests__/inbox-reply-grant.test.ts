import { describe, expect, it, jest } from '@jest/globals'

jest.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromCookies: jest.fn(),
}))
jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: jest.fn(),
}))

import { getAuthFromCookies } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { resolveInboxCanReply } from '../backend/communications/inbox/reply-grant'

const mockAuth = getAuthFromCookies as jest.MockedFunction<typeof getAuthFromCookies>
const mockContainer = createRequestContainer as jest.MockedFunction<typeof createRequestContainer>

function containerWith(rbac: unknown) {
  mockContainer.mockResolvedValue({ resolve: () => rbac } as never)
}

describe('resolveInboxCanReply', () => {
  it('returns false without a session and never builds a container', async () => {
    mockAuth.mockResolvedValue(null as never)
    await expect(resolveInboxCanReply()).resolves.toBe(false)
    expect(mockContainer).not.toHaveBeenCalled()
  })

  it('accepts a legacy connect grant for the inbox page', async () => {
    mockAuth.mockResolvedValue({ sub: 'u1', tenantId: 't1', orgId: 'o1' } as never)
    containerWith({
      userHasAllFeatures: jest.fn(async (_u: string, features: string[]) =>
        features.includes('communication_channels.connect_user_channel'),
      ),
    })
    await expect(resolveInboxCanReply()).resolves.toBe(true)
  })

  it('denies a read-only caller so the composer is not rendered', async () => {
    mockAuth.mockResolvedValue({ sub: 'u1', tenantId: 't1', orgId: 'o1' } as never)
    containerWith({ userHasAllFeatures: jest.fn(async () => false) })
    await expect(resolveInboxCanReply()).resolves.toBe(false)
  })

  it('fails closed when auth or DI throws', async () => {
    mockAuth.mockRejectedValue(new Error('cookies unavailable'))
    await expect(resolveInboxCanReply()).resolves.toBe(false)
    mockAuth.mockResolvedValue({ sub: 'u1', tenantId: 't1', orgId: 'o1' } as never)
    mockContainer.mockRejectedValue(new Error('container down'))
    await expect(resolveInboxCanReply()).resolves.toBe(false)
  })
})
