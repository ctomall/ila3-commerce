import { describe, expect, it } from '@jest/globals'
import { metadata } from '../backend/communications/channels/connect/page.meta'

describe('connect channel page metadata', () => {
  it('requires the tenant channel grant and stays out of navigation', () => {
    expect(metadata.requireAuth).toBe(true)
    expect(metadata.requireFeatures).toEqual(['communication_channels.connect_tenant_channel'])
    expect(metadata.navHidden).toBe(true)
  })
})
