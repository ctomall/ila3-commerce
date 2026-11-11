/**
 * Incremental-sync helpers for the inbox live refresh.
 *
 * The messages API exposes `after` (exclusive createdAt cursor) and `nextAfter`;
 * the client polls with the newest message's timestamp and refreshes the server
 * component only when the poll returns something new. Keeping these decisions
 * free of DOM/React lets them be unit-tested.
 */

export function newestCursor(items: ReadonlyArray<{createdAt?: string | null}> | null | undefined): string | null {
  if (!items || items.length === 0) return null
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const value = items[index]?.createdAt
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

export function hasNewMessages(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  const items = (payload as {items?: unknown}).items
  return Array.isArray(items) && items.length > 0
}

export function livePollDelayMs(visibility: 'visible' | 'hidden' | string, intervalMs: number): number | null {
  if (visibility !== 'visible') return null
  return Math.max(5_000, Math.min(intervalMs, 300_000))
}
