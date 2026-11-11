'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { hasNewMessages, livePollDelayMs } from '../../../lib/inbox-live'

/**
 * Poll the incremental `after` cursor while the tab is visible and refresh the
 * server-rendered thread only when the poll brings new messages. Disabled when
 * the page has no cursor (empty thread) or the document is hidden.
 */
export function InboxLiveRefresh({
  threadId,
  after,
  intervalMs = 20_000,
}: {
  threadId: string
  after: string | null
  intervalMs?: number
}) {
  const router = useRouter()

  useEffect(() => {
    if (!after) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const schedule = (delay: number) => {
      if (stopped) return
      timer = setTimeout(poll, delay)
    }
    const poll = async () => {
      if (stopped) return
      const delay = livePollDelayMs(document.visibilityState, intervalMs)
      if (delay === null) {
        schedule(intervalMs)
        return
      }
      try {
        const url = `/api/communications/me/threads/${encodeURIComponent(threadId)}/messages?after=${encodeURIComponent(after)}&limit=1`
        const response = await fetch(url, { cache: 'no-store' })
        if (response.ok) {
          const payload = (await response.json().catch(() => null)) as unknown
          if (!stopped && hasNewMessages(payload)) {
            router.refresh()
            return
          }
        }
      } catch {
        /* offline/transient: retry on the next tick */
      }
      schedule(intervalMs)
    }
    const onVisibility = () => {
      if (stopped) return
      if (document.visibilityState === 'visible') {
        if (timer) clearTimeout(timer)
        schedule(500)
      }
    }
    schedule(intervalMs)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [after, intervalMs, router, threadId])

  return null
}
