import * as React from 'react'
import { InboxView } from '../InboxView'
import { resolveInboxCanReply } from '../reply-grant'

export default async function CommunicationsThreadPage({ params }: { params: Promise<{ thread: string }> }) {
  const { thread } = await params
  // The newest window: replies and attachment actions live here.
  const canReply = await resolveInboxCanReply()
  return <InboxView selectedId={thread} canReply={canReply} />
}
