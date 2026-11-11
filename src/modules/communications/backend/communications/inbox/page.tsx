import * as React from 'react'
import { InboxView } from './InboxView'
import { resolveInboxCanReply } from './reply-grant'

export default async function CommunicationsInboxPage() {
  const canReply = await resolveInboxCanReply()
  return <InboxView canReply={canReply} />
}
