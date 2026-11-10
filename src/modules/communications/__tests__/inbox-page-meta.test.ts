import { describe, expect, it } from '@jest/globals'
import { metadata } from '../backend/communications/inbox/page.meta'

/**
 * The inbox must be reachable from the normal menu. It was once navHidden with
 * its own page group, which made a shipped feature undiscoverable in the CRM.
 * Reading is gated by `communication_channels.view`; the connect feature must
 * not be a prerequisite to read a conversation.
 */
describe('inbox page metadata', () => {
  it('is registered into the existing messages nav group', () => {
    expect(metadata.pageGroupKey).toBe('messages.nav.group')
  })

  it('is not nav-hidden and keeps the feature gate', () => {
    expect((metadata as {navHidden?: boolean}).navHidden).toBeUndefined()
    expect(metadata.requireFeatures).toEqual(['communication_channels.view'])
  })

  it('sits after the messages scene inside the group', () => {
    expect(metadata.pageOrder).toBeGreaterThan(460)
    expect(metadata.pageOrder).toBeLessThan(1000)
  })
})
