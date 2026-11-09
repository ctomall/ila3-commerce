import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'channel_messenger',
  title: 'Facebook Page Messenger channel adapter',
  version: '0.1.0',
  description:
    'ChannelAdapter for Facebook Page Messenger: HMAC-verified events, PSID-addressed text outbound through the Graph API, read watermarks as receipts.',
  author: 'ILA3 Commerce Team',
  license: 'MIT',
}
