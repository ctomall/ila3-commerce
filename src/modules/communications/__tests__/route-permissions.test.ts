import { describe, expect, it, jest } from '@jest/globals'
import { metadata as threadsMetadata } from '../api/me/threads/route'
import { metadata as messagesMetadata } from '../api/me/threads/[id]/messages/route'
import { metadata as sendMetadata } from '../api/me/send/route'

// The route modules import the DI container, which pulls the ESM-only `kysely`
// build; the sibling route tests mock these two seams for the same reason.
jest.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: jest.fn(),
}))
jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: jest.fn(),
}))

/**
 * K1 permission split: read routes are gated by `communication_channels.view`.
 * `POST /me/send` keeps that read gate (you must see the inbox) and checks the
 * reply capability in the handler — `communications.reply` OR the legacy
 * `communication_channels.connect_user_channel` — because the framework matches
 * route features with AND. This test exists so a future "make them consistent"
 * edit cannot silently turn a read permission into a send/bind one.
 */
describe('communications route permission gates', () => {
  it('gates the thread list read on view', () => {
    expect(threadsMetadata.GET.requireFeatures).toEqual(['communication_channels.view'])
  })

  it('gates the message read on view', () => {
    expect(messagesMetadata.GET.requireFeatures).toEqual(['communication_channels.view'])
  })

  it('gates sending on the read feature and leaves the reply grant to the handler', () => {
    expect(sendMetadata.POST.requireFeatures).toEqual(['communication_channels.view'])
  })
})
