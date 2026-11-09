import { describe, expect, it } from '@jest/globals'
import { CUSTOMER_WINDOW_MS, evaluateSendPolicy } from '../lib/send-policy'

const now = new Date('2026-11-09T12:00:00Z')
const at = (msAgo: number) => new Date(now.getTime() - msAgo)

describe('evaluateSendPolicy', () => {
  it('does not window email or unknown channel types', () => {
    expect(evaluateSendPolicy({ channelType: 'email', lastInboundAt: null, hasTemplate: false, now })).toEqual({ allowed: true, reason: 'no_window' })
    expect(evaluateSendPolicy({ channelType: null, lastInboundAt: null, hasTemplate: false, now })).toEqual({ allowed: true, reason: 'no_window' })
  })

  it('allows whatsapp inside 24h, including the exact boundary', () => {
    expect(evaluateSendPolicy({ channelType: 'whatsapp', lastInboundAt: at(CUSTOMER_WINDOW_MS), hasTemplate: false, now })).toEqual({ allowed: true, reason: 'within_window' })
    expect(evaluateSendPolicy({ channelType: 'messenger', lastInboundAt: at(1000), hasTemplate: false, now })).toEqual({ allowed: true, reason: 'within_window' })
  })

  it('closes the window one millisecond past 24h', () => {
    const result = evaluateSendPolicy({ channelType: 'whatsapp', lastInboundAt: at(CUSTOMER_WINDOW_MS + 1), hasTemplate: false, now })
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.code).toBe('WINDOW_CLOSED')
      expect(result.lastInboundAt).toBe(at(CUSTOMER_WINDOW_MS + 1).toISOString())
    }
  })

  it('closes the window when there is no inbound message at all', () => {
    const result = evaluateSendPolicy({ channelType: 'messenger', lastInboundAt: null, hasTemplate: false, now })
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.lastInboundAt).toBeNull()
  })

  it('a template is allowed regardless of the window', () => {
    expect(evaluateSendPolicy({ channelType: 'whatsapp', lastInboundAt: null, hasTemplate: true, now })).toEqual({ allowed: true, reason: 'template' })
  })
})
