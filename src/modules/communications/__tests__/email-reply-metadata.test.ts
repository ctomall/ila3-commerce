import { describe, expect, it } from '@jest/globals'
import { buildEmailReplyMetadata } from '../lib/email-reply-metadata'

describe('buildEmailReplyMetadata', () => {
  it('threads an email reply to the verified parent', () => {
    expect(
      buildEmailReplyMetadata({ parentExternalMessageId: '<parent@acme.test>', channelType: 'email' }),
    ).toEqual({ inReplyTo: '<parent@acme.test>', references: ['<parent@acme.test>'] })
  })

  it('accepts a bracketed or stripped id unchanged (assembleRfc2822 normalizes)', () => {
    expect(
      buildEmailReplyMetadata({ parentExternalMessageId: 'parent@acme.test', channelType: 'email' }),
    ).toEqual({ inReplyTo: 'parent@acme.test', references: ['parent@acme.test'] })
  })

  it('adds nothing on a chat channel, where threading uses provider ids', () => {
    expect(
      buildEmailReplyMetadata({ parentExternalMessageId: '<parent@acme.test>', channelType: 'whatsapp' }),
    ).toEqual({})
    expect(
      buildEmailReplyMetadata({ parentExternalMessageId: '<parent@acme.test>', channelType: 'messenger' }),
    ).toEqual({})
  })

  it('adds nothing without a resolved parent, so an unthreaded reply stays unthreaded', () => {
    expect(buildEmailReplyMetadata({ parentExternalMessageId: null, channelType: 'email' })).toEqual({})
    expect(buildEmailReplyMetadata({ parentExternalMessageId: '   ', channelType: 'email' })).toEqual({})
  })
})
