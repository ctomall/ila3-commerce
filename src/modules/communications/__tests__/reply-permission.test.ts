import { describe, expect, it, jest } from '@jest/globals'
import {
  canReply,
  LEGACY_REPLY_FEATURE,
  REPLY_FEATURE,
} from '../lib/reply-permission'
import { features as communicationsFeatures } from '../acl'

describe('reply permission split', () => {
  it('declares the dedicated reply feature in the module acl', () => {
    expect(communicationsFeatures.map((feature) => feature.id)).toContain('communications.reply')
    expect(REPLY_FEATURE).toBe('communications.reply')
    expect(LEGACY_REPLY_FEATURE).toBe('communication_channels.connect_user_channel')
  })

  it('accepts the dedicated reply grant and does not consult the legacy one', async () => {
    const check = jest.fn(async (feature: string) => feature === REPLY_FEATURE)
    await expect(canReply(check)).resolves.toBe(true)
    expect(check).toHaveBeenCalledTimes(1)
    expect(check).toHaveBeenCalledWith(REPLY_FEATURE)
  })

  it('keeps an existing role working through the legacy connect grant', async () => {
    const check = jest.fn(async (feature: string) => feature === LEGACY_REPLY_FEATURE)
    await expect(canReply(check)).resolves.toBe(true)
    expect(check.mock.calls.map(([feature]) => feature)).toEqual([REPLY_FEATURE, LEGACY_REPLY_FEATURE])
  })

  it('denies a caller that has neither grant', async () => {
    const check = jest.fn(async () => false)
    await expect(canReply(check)).resolves.toBe(false)
  })
})
