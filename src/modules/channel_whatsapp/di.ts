import { asValue } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import {
  hasChannelAdapter,
  registerChannelAdapter,
} from '@open-mercato/core/modules/communication_channels/lib/adapter-registry-singleton'
import { createWhatsAppAdapter } from './lib/adapter'

/** Safety net for runtime nodes that bypass module setup (workers, CLI). */
export function register(container: AppContainer): void {
  const adapter = createWhatsAppAdapter()
  if (!hasChannelAdapter(adapter.providerKey)) registerChannelAdapter(adapter)
  container.register({ whatsappChannelAdapter: asValue(adapter) })
}
