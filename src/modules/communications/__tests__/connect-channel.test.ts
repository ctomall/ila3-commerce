import { describe, expect, it } from '@jest/globals'
import { PROVIDERS, buildCredentials, mapConnectError } from '../backend/communications/channels/connect/connect-channel'

describe('tenant channel connect helpers', () => {
  const whatsapp = PROVIDERS.find((entry) => entry.key === 'whatsapp-business')!
  const messenger = PROVIDERS.find((entry) => entry.key === 'messenger')!

  it('keeps only provider fields with trimmed non-empty values', () => {
    expect(buildCredentials(whatsapp, {
      accessToken: '  token  ',
      phoneNumberId: 'pn-1',
      appSecret: 'secret',
      graphBaseUrl: '   ',
      pageId: 'ignored',
    })).toEqual({ accessToken: 'token', phoneNumberId: 'pn-1', appSecret: 'secret' })
  })

  it('offers every Messenger field the integration declares, including the graph override', () => {
    expect(messenger.fields.map((field) => field.key)).toEqual(['pageAccessToken', 'pageId', 'appSecret', 'graphBaseUrl'])
  })

  it('does not leak per-user-only fields across providers', () => {
    expect(buildCredentials(messenger, { pageAccessToken: 'p', pageId: '1', appSecret: 's', accessToken: 'x' }))
      .toEqual({ pageAccessToken: 'p', pageId: '1', appSecret: 's' })
  })

  it('maps permission, adapter, scope and validation errors', () => {
    expect(mapConnectError(403, null)).toContain('权限')
    expect(mapConnectError(404, 'No adapter registered')).toBe('No adapter registered')
    expect(mapConnectError(400, 'provider_not_tenant_scoped')).toContain('个人方式')
    expect(mapConnectError(422, 'bad token')).toBe('凭据校验未通过：bad token')
    expect(mapConnectError(422, null)).toContain('凭据校验未通过')
    expect(mapConnectError(503, null)).toContain('稍后')
    expect(mapConnectError(418, null)).toContain('418')
  })
})
