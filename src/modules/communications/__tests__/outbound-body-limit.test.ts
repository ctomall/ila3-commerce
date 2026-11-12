import { describe, expect, it, jest } from '@jest/globals'

jest.mock('@open-mercato/core/modules/communication_channels/lib/adapter-registry-singleton', () => ({
  getChannelAdapter: jest.fn(),
}))

import { getChannelAdapter } from '@open-mercato/core/modules/communication_channels/lib/adapter-registry-singleton'
import {
  BODY_TOO_LONG,
  checkOutboundBodyLength,
  outboundTextLength,
  resolveMaxBodyLength,
} from '../lib/outbound-body-limit'

const mockAdapter = getChannelAdapter as jest.MockedFunction<typeof getChannelAdapter>

function withLimit(maxBodyLength: number | undefined, providerKey = 'whatsapp-business') {
  mockAdapter.mockImplementation(((key: string) =>
    key === providerKey
      ? ({ providerKey, capabilities: { maxBodyLength } } as never)
      : undefined) as never)
}

describe('resolveMaxBodyLength', () => {
  it('reads the connector capability instead of hard-coding a provider value', () => {
    withLimit(4096)
    expect(resolveMaxBodyLength('whatsapp-business')).toBe(4096)
  })

  it('returns null when the provider declares no limit (email)', () => {
    withLimit(undefined, 'resend')
    expect(resolveMaxBodyLength('resend')).toBeNull()
  })

  it('returns null for an unknown provider, so a missing adapter stays permissive', () => {
    mockAdapter.mockReturnValue(undefined as never)
    expect(resolveMaxBodyLength('unknown-provider')).toBeNull()
  })

  it('returns null for an empty key and for a broken registry', () => {
    expect(resolveMaxBodyLength('')).toBeNull()
    expect(resolveMaxBodyLength(null)).toBeNull()
    mockAdapter.mockImplementation(() => {
      throw new Error('registry down')
    })
    expect(resolveMaxBodyLength('whatsapp-business')).toBeNull()
  })

  it('ignores non-positive and non-finite declarations', () => {
    withLimit(0)
    expect(resolveMaxBodyLength('whatsapp-business')).toBeNull()
    withLimit(Number.POSITIVE_INFINITY)
    expect(resolveMaxBodyLength('whatsapp-business')).toBeNull()
  })
})

describe('outboundTextLength', () => {
  it('counts the plain body, not the HTML alternative', () => {
    expect(outboundTextLength({ plain: 'abc' })).toBe(3)
    expect(outboundTextLength({ html: '<p>abc</p>' })).toBe(0)
  })
})

describe('checkOutboundBodyLength', () => {
  it('allows text at the limit and refuses one character over', () => {
    withLimit(10)
    expect(checkOutboundBodyLength({ providerKey: 'whatsapp-business', body: { plain: '0123456789' } })).toBeNull()
    expect(
      checkOutboundBodyLength({ providerKey: 'whatsapp-business', body: { plain: '0123456789a' } }),
    ).toEqual({ code: BODY_TOO_LONG, providerKey: 'whatsapp-business', maxLength: 10, actual: 11 })
  })

  it('counts UTF-16 units the way the platform message length is measured today', () => {
    withLimit(2)
    expect(checkOutboundBodyLength({ providerKey: 'whatsapp-business', body: { plain: '中文' } })).toBeNull()
    expect(checkOutboundBodyLength({ providerKey: 'whatsapp-business', body: { plain: '中文!' } })?.actual).toBe(3)
  })

  it('never blocks when the adapter declares no limit', () => {
    withLimit(undefined, 'resend')
    const long = 'x'.repeat(40_000)
    expect(checkOutboundBodyLength({ providerKey: 'resend', body: { plain: long } })).toBeNull()
  })
})
