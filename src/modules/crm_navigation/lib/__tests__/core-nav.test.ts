import { describe, expect, it, jest } from '@jest/globals'
import { fetchCoreNavigation } from '../core-nav'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('fetchCoreNavigation', () => {
  it('returns the payload on the first successful attempt', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ groups: [], settingsSections: [], profileSections: [] })) as unknown as typeof fetch
    const result = await fetchCoreNavigation({ url: 'http://test/nav', fetchImpl })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.attempts).toBe(1)
  })

  it('retries a 5xx once and then succeeds', async () => {
    let calls = 0
    const fetchImpl = jest.fn(async () => {
      calls += 1
      return calls === 1 ? jsonResponse({ error: 'boom' }, 503) : jsonResponse({ groups: [] })
    }) as unknown as typeof fetch
    const result = await fetchCoreNavigation({ url: 'http://test/nav', fetchImpl, attempts: 2 })
    expect(result.ok).toBe(true)
    expect(calls).toBe(2)
  })

  it('does not retry an authentication failure', async () => {
    let calls = 0
    const fetchImpl = jest.fn(async () => {
      calls += 1
      return jsonResponse({ error: 'unauthorized' }, 401)
    }) as unknown as typeof fetch
    const result = await fetchCoreNavigation({ url: 'http://test/nav', fetchImpl, attempts: 2 })
    expect(result).toMatchObject({ ok: false, status: 401, reason: 'upstream', attempts: 1 })
    expect(calls).toBe(1)
  })

  it('aborts a hung upstream and reports a bounded timeout', async () => {
    let calls = 0
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      calls += 1
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    }) as unknown as typeof fetch
    const result = await fetchCoreNavigation({ url: 'http://test/nav', fetchImpl, timeoutMs: 20, attempts: 2 })
    expect(result).toMatchObject({ ok: false, status: 504, reason: 'timeout', attempts: 2 })
    expect(calls).toBe(2)
  })

  it('never passes the cookie to the observation hook', async () => {
    const seen: unknown[] = []
    const fetchImpl = jest.fn(async () => jsonResponse({ groups: [] })) as unknown as typeof fetch
    await fetchCoreNavigation({
      url: 'http://test/nav',
      cookie: 'session=secret',
      fetchImpl,
      onAttempt: (attempt) => seen.push(attempt),
    })
    expect(JSON.stringify(seen)).not.toContain('secret')
  })
})
