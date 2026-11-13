import * as React from 'react'
import { InboxView } from '../InboxView'
import { resolveInboxCanReply } from '../reply-grant'
import { resolveCanConnectTenantChannel } from '../../../../lib/channel-connect-grant-server'

export default async function CommunicationsThreadPage({ params }: { params: Promise<{ thread: string }> }) {
  const { thread } = await params
  // The newest window: replies and attachment actions live here. The connect link
  // is resolved with the wizard's own grant here too, or a superadmin would lose
  // the entry the moment they open one conversation.
  const [canReply, canConnect] = await Promise.all([
    resolveInboxCanReply(),
    resolveCanConnectTenantChannel(),
  ])
  return <InboxView selectedId={thread} canReply={canReply} canConnect={canConnect} />
}
