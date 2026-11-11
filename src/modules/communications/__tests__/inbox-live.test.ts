import { describe, expect, it } from '@jest/globals'
import { hasNewMessages, livePollDelayMs, newestCursor, pollOutcome } from '../lib/inbox-live'

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
})
