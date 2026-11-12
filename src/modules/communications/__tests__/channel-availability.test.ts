import { describe, expect, it } from '@jest/globals'
import {
  INBOUND_CAPABLE_PROVIDERS,
  describeChannelAvailability,
  type Availability,
} from '../lib/channel-availability'

const base = {
  providerKey: 'whatsapp-business',
  channelType: 'whatsapp',
  status: 'connected',
  externalIdentifier: '1234567890',
  adapterRegistered: true,
}

function codes(result: { inbound: Availability; outbound: Availability }) {
  return { inbound: result.inbound.code, outbound: result.outbound.code }
}

describe('describeChannelAvailability', () => {
  it('reports both directions ready for a connected, pinned WhatsApp account', () => {
    const result = describeChannelAvailability(base)
    expect(codes(result)).toEqual({ inbound: 'ready', outbound: 'ready' })
    expect(result.inbound.available).toBe(true)
    expect(result.outbound.available).toBe(true)
  })

  it('says out loud that Resend can send but never receive (F8-05)', () => {
    const result = describeChannelAvailability({
      ...base,
      providerKey: 'resend',
      channelType: 'email',
      externalIdentifier: null,
    })
    expect(codes(result)).toEqual({ inbound: 'provider_has_no_inbound', outbound: 'ready' })
    expect(result.inbound.hint).toContain('只支持发送')
  })

  it('treats SES the same way, without a local adapter probe inventing anything', () => {
    const result = describeChannelAvailability({
      ...base,
      providerKey: 'ses',
      channelType: 'email',
      externalIdentifier: null,
    })
    expect(result.inbound.code).toBe('provider_has_no_inbound')
    expect(result.outbound.code).toBe('ready')
  })

  it('refuses inbound for a pinned provider without an account identity', () => {
    const result = describeChannelAvailability({ ...base, externalIdentifier: null })
    expect(codes(result)).toEqual({ inbound: 'missing_account_identity', outbound: 'ready' })
  })

  it('does not require an account identity for email inbound', () => {
    const result = describeChannelAvailability({
      ...base,
      providerKey: 'imap',
      channelType: 'email',
      externalIdentifier: null,
    })
    expect(result.inbound.code).toBe('ready')
  })

  it('maps every non-connected lifecycle status to an actionable code in both directions', () => {
    for (const [status, expected] of [
      ['requires_reauth', 'requires_reauth'],
      ['error', 'channel_error'],
      ['paused', 'paused'],
      ['pending', 'not_connected'],
      [null, 'not_connected'],
    ] as const) {
      const result = describeChannelAvailability({ ...base, status })
      expect(codes(result)).toEqual({ inbound: expected, outbound: expected })
      expect(result.inbound.hint.length).toBeGreaterThan(0)
    }
  })

  it('blames the deployment, not the provider, when the adapter is not registered', () => {
    const result = describeChannelAvailability({ ...base, adapterRegistered: false })
    expect(codes(result)).toEqual({ inbound: 'ready', outbound: 'adapter_missing' })
  })

  it('keeps the inbound set explicit so a new provider cannot silently claim inbound', () => {
    expect([...INBOUND_CAPABLE_PROVIDERS].sort()).toEqual(['gmail', 'imap', 'messenger', 'whatsapp-business'])
    expect(
      describeChannelAvailability({ ...base, providerKey: 'discord', channelType: 'discord', externalIdentifier: null })
        .inbound.code,
    ).toBe('provider_has_no_inbound')
  })
})
