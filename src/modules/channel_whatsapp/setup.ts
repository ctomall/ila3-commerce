import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import {
  hasChannelAdapter,
  registerChannelAdapter,
} from '@open-mercato/core/modules/communication_channels/lib/adapter-registry-singleton'
import { WHATSAPP_PROVIDER_KEY, createWhatsAppAdapter } from './lib/adapter'

/**
 * Register once per process, guarded so dev HMR / repeated imports do not throw
 * the registry's duplicate-providerKey error (same pattern as channel-imap).
 */
function ensureWhatsAppAdapterRegistered(): void {
  if (hasChannelAdapter(WHATSAPP_PROVIDER_KEY)) return
  registerChannelAdapter(createWhatsAppAdapter())
}

ensureWhatsAppAdapterRegistered()

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['channel_whatsapp.view', 'channel_whatsapp.configure'],
    admin: ['channel_whatsapp.view', 'channel_whatsapp.configure'],
  },
  async onTenantCreated() {
    ensureWhatsAppAdapterRegistered()
  },
}

export default setup
