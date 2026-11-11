import { describe, expect, it, jest } from '@jest/globals'
import { internalApiBase, loadErrorMessage, selfFetch } from '../lib/inbox-fetch'

/**
 * K1 regression: a failed inbox read must never be presented as an empty list
 * or an unselected conversation.
 *
 * The behaviour lived inline in `InboxView` (a server component importing
 * next/headers and the UI kit), so it had no direct test. These cases pin the
 * two halves that make the guarantee: `selfFetch` keeps the failure status, and
 * `loadErrorMessage` maps every status class to wording that stays distinct
 * from "you have no conversations".
 */
describe('selfFetch keeps a failed read as a failure', () => {
  const cookie = 'session=abc'

  function response(status: number, body: unknown = {}): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response
  }

  it('returns the status for 401 instead of an empty success', async () => {
    const fetchImpl = jest.fn(async () => response(401)) as unknown as typeof fetch
    await expect(selfFetch('/api/x', cookie, { base: 'http://127.0.0.1:9', fetchImpl })).resolves.toEqual({
      ok: false,
      status: 401,
    })
  })

  it('returns the status for 403 and 5xx', async () => {
    for (const status of [403, 500, 503]) {
      const fetchImpl = jest.fn(async () => response(status)) as unknown as typeof fetch
      await expect(
        selfFetch('/api/x', cookie, { base: 'http://127.0.0.1:9', fetchImpl }),
      ).resolves.toEqual({ ok: false, status })
    }
  })

  it('maps a thrown fetch to status 0 (transport), not to an empty page', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    await expect(selfFetch('/api/x', cookie, { base: 'http://127.0.0.1:9', fetchImpl })).resolves.toEqual({
      ok: false,
      status: 0,
    })
  })

  it('forwards the cookie, disables caching and joins base + path', async () => {
    const fetchImpl = jest.fn(async () => response(200, { items: [] })) as unknown as typeof fetch
    const result = await selfFetch<{ items: unknown[] }>('/api/communications/me/threads', cookie, {
      base: 'http://127.0.0.1:9',
      fetchImpl,
    })
    expect(result).toEqual({ ok: true, data: { items: [] } })
    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:9/api/communications/me/threads')
    expect(init).toMatchObject({ headers: { cookie }, cache: 'no-store' })
  })
})

describe('internalApiBase stays in-process', () => {
  it('prefers INTERNAL_API_BASE_URL and trims a trailing slash', () => {
    expect(internalApiBase({ INTERNAL_API_BASE_URL: 'http://127.0.0.1:4000/' })).toBe('http://127.0.0.1:4000')
  })

  it('falls back to loopback on the server port', () => {
    expect(internalApiBase({ PORT: '3100' })).toBe('http://127.0.0.1:3100')
    expect(internalApiBase({})).toBe('http://127.0.0.1:3000')
  })
})

describe('loadErrorMessage distinguishes failures from an empty inbox', () => {
  it('says the session expired for 401 in both scopes', () => {
    expect(loadErrorMessage(401, 'list')).toContain('重新登录')
    expect(loadErrorMessage(401, 'detail')).toContain('重新登录')
  })

  it('names the missing grant for 403 and keeps list vs detail distinct', () => {
    const list = loadErrorMessage(403, 'list')
    const detail = loadErrorMessage(403, 'detail')
    expect(list).toContain('communication_channels.view')
    expect(detail).toContain('communication_channels.view')
    expect(list).not.toBe(detail)
  })

  it('reports a transport failure as unreachable service, not as empty', () => {
    expect(loadErrorMessage(0, 'list')).toContain('无法连接服务')
    expect(loadErrorMessage(0, 'detail')).toContain('无法连接服务')
    expect(loadErrorMessage(0, 'list')).not.toBe(loadErrorMessage(0, 'detail'))
  })

  it('masks an unknown thread for a detail 404', () => {
    expect(loadErrorMessage(404, 'detail')).toContain('无权访问')
  })

  it('shows the status for other failures and says it is not an empty state', () => {
    const list = loadErrorMessage(500, 'list')
    const detail = loadErrorMessage(503, 'detail')
    expect(list).toContain('HTTP 500')
    expect(list).toContain('这不是"没有会话"')
    expect(detail).toContain('HTTP 503')
    expect(detail).toContain('这不是"空会话"')
  })

  it('never reuses the empty-state wording for a failure', () => {
    // The exact empty states rendered by InboxView. A failure may *mention* the
    // empty state to say it is NOT one ("这不是\"没有会话\""), but it must never
    // BE that sentence.
    const emptyStates = ['没有可访问的会话。', '该会话暂无消息。']
    const failureMarkers = ['重新登录', 'communication_channels.view', '无法连接', '无权访问', 'HTTP']
    for (const status of [0, 401, 403, 404, 429, 500, 503]) {
      for (const scope of ['list', 'detail'] as const) {
        const message = loadErrorMessage(status, scope)
        expect(emptyStates).not.toContain(message)
        expect(failureMarkers.some((marker) => message.includes(marker))).toBe(true)
      }
    }
  })
})
