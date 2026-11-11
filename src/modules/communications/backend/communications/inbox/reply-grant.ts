import { getAuthFromCookies } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { canActorReply } from '../../../lib/reply-permission-server'

/**
 * Resolve the inbox reply grant for the two entry pages (list and thread detail).
 *
 * The send route refuses a read-only caller; rendering a composer anyway made
 * that look like a broken page. Both pages call this and use it to show a
 * read-only note instead. Any auth/DI/RBAC failure resolves to `false`.
 */
export async function resolveInboxCanReply(): Promise<boolean> {
  try {
    const auth = await getAuthFromCookies()
    if (!auth?.sub) return false
    const container = await createRequestContainer()
    return await canActorReply(auth, container)
  } catch {
    return false
  }
}
