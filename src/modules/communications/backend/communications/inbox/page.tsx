import * as React from 'react'
import { InboxView } from './InboxView'
import { resolveInboxCanReply } from './reply-grant'
import { resolveCanConnectTenantChannel } from '../../../lib/channel-connect-grant-server'

export default async function CommunicationsInboxPage() {
  const [canReply, canConnect] = await Promise.all([
    resolveInboxCanReply(),
    resolveCanConnectTenantChannel(),
  ])
  return <InboxView canReply={canReply} canConnect={canConnect} />
}
