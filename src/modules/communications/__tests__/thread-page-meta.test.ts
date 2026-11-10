import { describe, expect, it } from '@jest/globals'
import { metadata } from '../backend/communications/inbox/[thread]/page.meta'

/**
 * The thread route is a page in its own right; without page metadata the
 * generated route had no requireAuth/requireFeatures, so an unauthenticated GET
 * rendered the inbox shell with HTTP 200. The gate must match the list page and
 * must not register a second navigation entry for the dynamic route.
 */
describe('inbox thread page metadata', () => {
  it('requires authentication', () => {
    expect(metadata.requireAuth).toBe(true)
  })

  it('uses the same feature gate as the inbox list page', () => {
    expect(metadata.requireFeatures).toEqual(['communication_channels.connect_user_channel'])
  })

  it('does not add a second nav entry for the dynamic detail route', () => {
    expect((metadata as { pageGroup?: string }).pageGroup).toBeUndefined()
    expect((metadata as { pageOrder?: number }).pageOrder).toBeUndefined()
    expect((metadata as { navHidden?: boolean }).navHidden).toBeUndefined()
  })
})
