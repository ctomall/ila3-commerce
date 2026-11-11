import * as React from 'react'
import { InboxView } from '../InboxView'
import { resolveInboxCanReply } from '../reply-grant'

export default async function CommunicationsThreadPage({ params }: { params: Promise<{ thread: string }> }) {
  const { thread } = await params
  // The thread detail URL is where replies actually happen, so it resolves the
  // same reply grant as the list page instead of defaulting to read-only.
  const canReply = await resolveInboxCanReply()
  return <InboxView selectedId={thread} canReply={canReply} />
}
