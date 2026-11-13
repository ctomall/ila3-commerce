import * as React from 'react'
import { ChannelsView } from './ChannelsView'
import { resolveCanConnectTenantChannel } from '../../../lib/channel-connect-grant-server'

export default async function CommunicationsChannelsPage() {
  const canConnect = await resolveCanConnectTenantChannel()
  return <ChannelsView canConnect={canConnect} />
}
