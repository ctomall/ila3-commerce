import * as React from 'react'
import { InboxView } from '../../../InboxView'
import { resolveInboxCanReply } from '../../../reply-grant'

/**
 * Older-message window.
 *
 * The module page dispatcher only passes `params`, so the cursor is a path
 * segment instead of a query string: `/inbox/<thread>/before/<iso>`. The read
 * gate is the same inbox view; the cursor is validated again by the messages API.
 */
export default async function CommunicationsOlderMessagesPage({
  params,
}: {
  params: Promise<{ thread: string; cursor: string }>
}) {
  const { thread, cursor } = await params
  const before = decodeURIComponent(cursor)
  const canReply = await resolveInboxCanReply()
  return <InboxView selectedId={thread} before={before} canReply={canReply} />
}
