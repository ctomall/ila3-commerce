import { describe, expect, it } from '@jest/globals'
import { planChannelDisconnect, planChannelReconnect } from '../lib/channel-actions'

/**
 * S92 / design rev2 F1-05: unbind and re-authorize reuse the installed hub routes.
 * The plan decides which route and which permission, because choosing the admin
 * route for a personal channel would be a permission misuse even though the hub
 * masks it as 404.
 */
describe('planChannelDisconnect', () => {
  it('sends a personal channel through the owner route', () => {
    const plan = planChannelDisconnect({ id: 'ch-1', visibility: 'private', providerKey: 'imap' })
    expect(plan.url).toBe('/api/communication_channels/channels/ch-1')
    expect(plan.permission).toBe('communication_channels.connect_user_channel')
    expect(plan.warning).toContain('只影响你本人')
  })

  it('sends a tenant-wide channel through the admin route and says it affects the team', () => {
    const plan = planChannelDisconnect({
      id: 'ch-2',
      visibility: 'shared',
      providerKey: 'whatsapp-business',
      displayName: 'WhatsApp 业务号',
    })
    expect(plan.url).toBe('/api/communication_channels/admin/channels/ch-2')
    expect(plan.permission).toBe('communication_channels.admin')
    expect(plan.warning).toContain('WhatsApp 业务号')
    expect(plan.warning).toContain('整个团队收件箱')
  })

  it('always states that history is kept, because deletion here is a disconnect', () => {
    for (const visibility of ['private', 'shared'] as const) {
      expect(planChannelDisconnect({ id: 'ch-3', visibility }).warning).toContain('历史消息保留')
    }
  })
})

describe('planChannelReconnect', () => {
  it('links a shared channel to the app connect form with its provider preselected', () => {
    const plan = planChannelReconnect({ id: 'ch-1', visibility: 'shared', providerKey: 'whatsapp-business' })
    expect(plan).toMatchObject({
      kind: 'app-connect',
      href: '/backend/communications/channels/connect?provider=whatsapp-business',
    })
  })

  it('defers a personal channel to the installed profile page instead of re-implementing credentials', () => {
    const plan = planChannelReconnect({ id: 'ch-2', visibility: 'private', providerKey: 'gmail' })
    expect(plan.kind).toBe('hub-profile')
    expect(plan.note).toContain('我的资料')
  })
})
