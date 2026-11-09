import type { IntegrationDefinition } from '@open-mercato/shared/modules/integrations/types'

export const integration: IntegrationDefinition = {
  id: 'channel_messenger',
  title: 'Facebook Page Messenger',
  description:
    'Tenant-wide Facebook Page: HMAC-verified Messenger events, PSID-addressed text outbound through the Graph API.',
  category: 'communication',
  hub: 'communication_channels',
  providerKey: 'messenger',
  icon: 'message',
  package: '@app',
  version: '0.1.0',
  author: 'ILA3 Commerce Team',
  license: 'MIT',
  tags: ['messenger', 'facebook', 'meta', 'communication'],
  apiVersions: [
    {id: 'v21.0', label: 'Graph API v21.0', status: 'stable', default: true, changelog: 'Initial Messenger baseline.'},
  ],
  credentials: {
    fields: [
      {key: 'pageAccessToken', label: 'Page access token', type: 'secret', required: true, helpText: 'Long-lived Page token with pages_messaging.'},
      {key: 'pageId', label: 'Page ID', type: 'text', required: true, helpText: 'Graph page id (not the page name).'},
      {key: 'appSecret', label: 'App secret', type: 'secret', required: true, helpText: 'Verifies X-Hub-Signature-256 on every webhook.'},
      {key: 'graphBaseUrl', label: 'Graph base URL (optional)', type: 'text', required: false, helpText: 'Defaults to https://graph.facebook.com/v21.0.'},
    ],
  },
}

export default integration
