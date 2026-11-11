import { describe, expect, it, jest } from '@jest/globals'
import { canActorReply } from '../lib/reply-permission-server'
import { LEGACY_REPLY_FEATURE, REPLY_FEATURE } from '../lib/reply-permission'

function containerWith(rbac: unknown) {
  return {
    resolve: (name: string) => {
      if (name === 'rbacService') return rbac
      throw new Error(`unexpected resolve: ${name}`)
    },
  } as never
}

const auth = { sub: 'u1', tenantId: 't1', orgId: 'o1' }

describe('canActorReply', () => {
  it('accepts the dedicated reply grant', async () => {
    const rbac = { userHasAllFeatures: jest.fn(async (_u: string, features: string[]) => features.includes(REPLY_FEATURE)) }
    await expect(canActorReply(auth, containerWith(rbac))).resolves.toBe(true)
  })

  it('keeps the legacy connect grant working', async () => {
    const rbac = { userHasAllFeatures: jest.fn(async (_u: string, features: string[]) => features.includes(LEGACY_REPLY_FEATURE)) }
    await expect(canActorReply(auth, containerWith(rbac))).resolves.toBe(true)
  })

  it('denies a caller with neither grant', async () => {
    const rbac = { userHasAllFeatures: jest.fn(async () => false) }
    await expect(canActorReply(auth, containerWith(rbac))).resolves.toBe(false)
  })

  it('fails closed when rbac throws, when the service is missing, or when the caller is unknown', async () => {
    const throwing = { userHasAllFeatures: jest.fn(async () => { throw new Error('rbac down') }) }
    await expect(canActorReply(auth, containerWith(throwing))).resolves.toBe(false)
    await expect(canActorReply(auth, containerWith(undefined))).resolves.toBe(false)
    await expect(canActorReply(null, containerWith({ userHasAllFeatures: async () => true }))).resolves.toBe(false)
    const brokenContainer = { resolve: () => { throw new Error('no container') } } as never
    await expect(canActorReply(auth, brokenContainer)).resolves.toBe(false)
  })

  it('passes the tenant and organization scope to rbac', async () => {
    const rbac = { userHasAllFeatures: jest.fn(async () => true) }
    await canActorReply(auth, containerWith(rbac), { organizationId: 'o-override' })
    const [, , scope] = rbac.userHasAllFeatures.mock.calls[0] as unknown as [string, string[], { tenantId: string; organizationId: string }]
    expect(scope).toEqual({ tenantId: 't1', organizationId: 'o-override' })
  })
})
