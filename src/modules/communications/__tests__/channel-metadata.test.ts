import { describe, expect, it } from '@jest/globals'
import { sanitizeCallerChannelMetadata } from '../lib/channel-metadata'

/**
 * Defence in depth for outbound sends.
 *
 * The hub keeps the last word on routing fields, but the delivery command
 * addresses provider-native channels from `link.channelMetadata.to`, so a
 * smuggled recipient must never even reach the hub from this BFF.
 */
describe('sanitizeCallerChannelMetadata', () => {
  it('drops every routing field a caller must not set', () => {
    const cleaned = sanitizeCallerChannelMetadata({
      to: ['attacker@example.test'],
      cc: ['cc@example.test'],
      bcc: ['bcc@example.test'],
      subject: 'spoofed',
      inReplyTo: '<spoofed@example.test>',
      references: ['<spoofed@example.test>'],
      from: 'ceo@example.test',
      replyTo: 'ceo@example.test',
      replyToExternalId: 'wamid.spoofed',
      messageReferenceId: 'spoofed',
      externalThreadRef: 'spoofed-thread',
    })
    expect(cleaned).toEqual({})
  })

  it('keeps non-routing pass-through metadata', () => {
    const cleaned = sanitizeCallerChannelMetadata({
      crmPersonId: 'p-1',
      visibility: 'internal',
      template: { name: 'hello', language: 'zh_CN' },
    })
    expect(cleaned).toEqual({
      crmPersonId: 'p-1',
      visibility: 'internal',
      template: { name: 'hello', language: 'zh_CN' },
    })
  })

  it('strips routing keys while keeping the rest, without mutating the input', () => {
    const input = { to: ['x@example.test'], crmPersonId: 'p-1' }
    expect(sanitizeCallerChannelMetadata(input)).toEqual({ crmPersonId: 'p-1' })
    expect(input).toEqual({ to: ['x@example.test'], crmPersonId: 'p-1' })
  })

  it('treats missing metadata as empty', () => {
    expect(sanitizeCallerChannelMetadata(undefined)).toEqual({})
    expect(sanitizeCallerChannelMetadata(null)).toEqual({})
  })
})
