import { describe, expect, it, jest } from '@jest/globals'
import {
  canConnectTenantChannel,
  TENANT_CHANNEL_CONNECT_FEATURE,
} from '../lib/channel-connect-grant'
import { metadata as connectPageMetadata } from '../backend/communications/channels/connect/page.meta'

describe('tenant channel connect grant', () => {
  it('asks for exactly the feature the connect page is gated by', () => {
    expect(connectPageMetadata.requireFeatures).toEqual([TENANT_CHANNEL_CONNECT_FEATURE])
  })

  it('renders the connect entry only for a caller that carries the grant', async () => {
    const allowed = jest.fn(async (feature: string) => feature === TENANT_CHANNEL_CONNECT_FEATURE)
    await expect(canConnectTenantChannel(allowed)).resolves.toBe(true)
    expect(allowed).toHaveBeenCalledWith(TENANT_CHANNEL_CONNECT_FEATURE)
  })

  it('closes the entry when the grant is absent (employee after the reply split)', async () => {
    const denied = jest.fn(async () => false)
    await expect(canConnectTenantChannel(denied)).resolves.toBe(false)
  })

  it('fails closed when the authorization check throws', async () => {
    const broken = jest.fn(async () => {
      throw new Error('rbac unavailable')
    })
    await expect(canConnectTenantChannel(broken)).resolves.toBe(false)
  })
})
