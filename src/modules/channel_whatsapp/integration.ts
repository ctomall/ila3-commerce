import type { IntegrationDefinition } from '@open-mercato/shared/modules/integrations/types'

/**
 * Integration definition for the WhatsApp Cloud API provider.
 *
 * The credentials id must stay `channel_whatsapp-business` because the shared
 * webhook/credential conventions resolve provider secrets as `channel_<providerKey>`.
 */
export const integration: IntegrationDefinition = {
  id: 'channel_whatsapp-business',
  title: 'WhatsApp Business (Cloud API)',
  description:
    'Tenant-wide WhatsApp Business number: HMAC-verified inbound messages and delivery receipts, outbound text and approved templates through the Meta Graph API.',
  category: 'communication',
  hub: 'communication_channels',
  providerKey: 'whatsapp-business',
  icon: 'message',
  package: '@app',
  version: '0.1.0',
  author: 'ILA3 Commerce Team',
  license: 'MIT',
  tags: ['whatsapp', 'meta', 'cloud-api', 'communication'],
  apiVersions: [
    {
      id: 'v21.0',
      label: 'Cloud API v21.0',
      status: 'stable',
      default: true,
      changelog: 'Initial Cloud API baseline: messages, status receipts, template sends.',
    },
  ],
  credentials: {
    fields: [
      {
        key: 'accessToken',
        label: 'System user access token',
        type: 'secret',
        required: true,
        helpText: 'Meta system-user token with whatsapp_business_messaging + whatsapp_business_management.',
      },
      {
        key: 'phoneNumberId',
        label: 'Phone number ID',
        type: 'text',
        required: true,
        helpText: 'Cloud API phone number id (not the display number).',
      },
      {
        key: 'appSecret',
        label: 'App secret',
        type: 'secret',
        required: true,
        helpText: 'Used to verify X-Hub-Signature-256 on every webhook.',
      },
      {
        key: 'graphBaseUrl',
        label: 'Graph base URL (optional)',
        type: 'text',
        required: false,
        helpText: 'Defaults to https://graph.facebook.com/v21.0; a drill may point at a local fake.',
      },
    ],
  },
}

export default integration
