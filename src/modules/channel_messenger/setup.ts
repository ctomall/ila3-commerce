import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import {
  hasChannelAdapter,
  registerChannelAdapter,
} from '@open-mercato/core/modules/communication_channels/lib/adapter-registry-singleton'
import { MESSENGER_PROVIDER_KEY, createMessengerAdapter } from './lib/adapter'

function ensureMessengerAdapterRegistered(): void {
  if (hasChannelAdapter(MESSENGER_PROVIDER_KEY)) return
  registerChannelAdapter(createMessengerAdapter())
}

ensureMessengerAdapterRegistered()

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['channel_messenger.view', 'channel_messenger.configure'],
    admin: ['channel_messenger.view', 'channel_messenger.configure'],
  },
  async onTenantCreated() {
    ensureMessengerAdapterRegistered()
  },
}

export default setup
