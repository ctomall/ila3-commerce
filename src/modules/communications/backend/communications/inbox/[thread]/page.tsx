import * as React from 'react'
import { InboxView } from '../InboxView'

export default async function CommunicationsThreadPage({ params }: { params: Promise<{ thread: string }> }) {
  const { thread } = await params
  return <InboxView selectedId={thread} />
}
