import { describe, expect, it } from '@jest/globals'
import { hasNewMessages, livePollDelayMs, newestCursor, nextPollDelayMs, pollOutcome } from '../lib/inbox-live'

describe('inbox live refresh helpers', () => {
  it('takes the newest createdAt from an ascending page', () => {
    expect(newestCursor([{ createdAt: 'a' }, { createdAt: 'b' }])).toBe('b')
    expect(newestCursor([])).toBeNull()
    expect(newestCursor([{ createdAt: null }, {}])).toBeNull()
  })

  it('refreshes only when the incremental poll returns items', () => {
    expect(hasNewMessages({ items: [{}] })).toBe(true)
    expect(hasNewMessages({ items: [] })).toBe(false)
    expect(hasNewMessages({})).toBe(false)
    expect(hasNewMessages(null)).toBe(false)
  })

  it('polls only while visible and clamps the interval', () => {
    expect(livePollDelayMs('hidden', 20_000)).toBeNull()
    expect(livePollDelayMs('visible', 1_000)).toBe(5_000)
    expect(livePollDelayMs('visible', 20_000)).toBe(20_000)
    expect(livePollDelayMs('visible', 999_999)).toBe(300_000)
  })

  it('keeps polling on transient statuses and transport errors', () => {
    for (const status of [200, 204, 0, 429, 500, 502, 503]) {
      expect(pollOutcome(status)).toBe('continue')
    }
  })

  it('stops and surfaces an auth or existence failure instead of polling forever', () => {
    for (const status of [401, 403, 404]) {
      expect(pollOutcome(status)).toBe('surface-and-stop')
    }
  })

  it('backs off exponentially after transient failures and caps at five minutes', () => {
    expect(nextPollDelayMs(0, 20_000)).toBe(20_000)
    expect(nextPollDelayMs(1, 20_000)).toBe(40_000)
    expect(nextPollDelayMs(2, 20_000)).toBe(80_000)
    expect(nextPollDelayMs(3, 20_000)).toBe(160_000)
    expect(nextPollDelayMs(4, 20_000)).toBe(300_000)
    // Stays capped however long the outage lasts.
    expect(nextPollDelayMs(50, 20_000)).toBe(300_000)
  })

  it('keeps the hidden-tab and base-interval rules for the backoff', () => {
    expect(nextPollDelayMs(2, 20_000, 'hidden')).toBeNull()
    // Never faster than 5s even if a caller passes a tiny interval.
    expect(nextPollDelayMs(0, 1_000)).toBe(5_000)
    // Never slower than the 5-minute cap even if the base interval is larger.
    expect(nextPollDelayMs(0, 600_000)).toBe(300_000)
    expect(nextPollDelayMs(-1, 20_000)).toBe(20_000)
  })
})
