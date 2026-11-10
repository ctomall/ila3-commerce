import type { CoreNavPayload } from '@/nav/crm-navigation'

/**
 * Bounded reader for the core navigation payload.
 *
 * The app route must never hang the shell on an upstream navigation build:
 * one bounded timeout, one retry for transport/5xx failures, no retry for
 * authentication failures, and no logging of request headers (the cookie must
 * never reach a log line).
 */

export type CoreNavFailureReason = 'timeout' | 'network' | 'upstream' | 'invalid'

export type CoreNavResult =
  | { ok: true; payload: CoreNavPayload; attempts: number }
  | { ok: false; status: number; reason: CoreNavFailureReason; attempts: number }

export type CoreNavAttempt = { attempt: number; status?: number; reason?: CoreNavFailureReason }

export type FetchCoreNavigationOptions = {
  url: string
  cookie?: string | null
  /** Per-attempt deadline. Default 4000 ms. */
  timeoutMs?: number
  /** Total attempts including the first. Default 2. */
  attempts?: number
  fetchImpl?: typeof fetch
  /** Sanitized observation hook: never receives headers or the cookie. */
  onAttempt?: (attempt: CoreNavAttempt) => void
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function fetchCoreNavigation(options: FetchCoreNavigationOptions): Promise<CoreNavResult> {
  const {
    url,
    cookie,
    timeoutMs = 4000,
    attempts = 2,
    fetchImpl = fetch,
    onAttempt,
  } = options
  const maxAttempts = Math.max(1, Math.min(3, attempts))
  let lastStatus = 502
  let lastReason: CoreNavFailureReason = 'network'

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const headers = new Headers({ accept: 'application/json' })
      if (cookie) headers.set('cookie', cookie)
      const response = await fetchImpl(url, {
        headers,
        cache: 'no-store',
        signal: controller.signal,
      })
      onAttempt?.({ attempt, status: response.status })

      if (response.status === 401 || response.status === 403) {
        return { ok: false, status: response.status, reason: 'upstream', attempts: attempt }
      }
      if (!response.ok) {
        lastStatus = response.status
        lastReason = 'upstream'
        if (attempt < maxAttempts) {
          await delay(150)
          continue
        }
        return { ok: false, status: lastStatus, reason: lastReason, attempts: attempt }
      }

      try {
        const payload = (await response.json()) as CoreNavPayload
        return { ok: true, payload, attempts: attempt }
      } catch {
        return { ok: false, status: 502, reason: 'invalid', attempts: attempt }
      }
    } catch (error) {
      const aborted = controller.signal.aborted || (error as { name?: string })?.name === 'AbortError'
      lastReason = aborted ? 'timeout' : 'network'
      lastStatus = aborted ? 504 : 502
      onAttempt?.({ attempt, reason: lastReason })
      if (attempt < maxAttempts) {
        await delay(150)
        continue
      }
      return { ok: false, status: lastStatus, reason: lastReason, attempts: attempt }
    } finally {
      clearTimeout(timer)
    }
  }

  return { ok: false, status: lastStatus, reason: lastReason, attempts: maxAttempts }
}
