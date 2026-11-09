import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'channel_whatsapp',
  title: 'WhatsApp Business channel adapter',
  version: '0.1.0',
  description:
    'ChannelAdapter for the WhatsApp Cloud API: HMAC-verified inbound events, text/template outbound through Graph, status events handed to the hub.',
  author: 'ILA3 Commerce Team',
  license: 'MIT',
}
