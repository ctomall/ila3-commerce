import { asValue } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import {
  hasChannelAdapter,
  registerChannelAdapter,
} from '@open-mercato/core/modules/communication_channels/lib/adapter-registry-singleton'
import { createMessengerAdapter } from './lib/adapter'

export function register(container: AppContainer): void {
  const adapter = createMessengerAdapter()
  if (!hasChannelAdapter(adapter.providerKey)) registerChannelAdapter(adapter)
  container.register({ messengerChannelAdapter: asValue(adapter) })
}
