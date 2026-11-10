import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import crypto from 'node:crypto'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CommunicationChannel } from '@open-mercato/core/modules/communication_channels/data/entities'
import { getCommunicationChannelsQueue } from '@open-mercato/core/modules/communication_channels/lib/queue'

/**
 * Regression for K2-D3 — pin inbound Meta webhooks to the channel account.
 *
 * The appSecret HMAC proves the Meta APP, not the phone number / Page. Two
 * tenants can connect different accounts under the same app, so before this fix
 * the first channel that verified the signature received every event. The
 * payload's `metadata.phone_number_id` (WhatsApp) / `entry[].id` (Messenger) is
 * now compared with the candidate channel's `externalIdentifier`; a mismatch
 * moves on to the next candidate and an unmatched account is rejected.
 */

jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: jest.fn(),
}))

jest.mock('@open-mercato/core/modules/communication_channels/lib/queue', () => ({
  COMMUNICATION_CHANNELS_QUEUES: { inbound: 'cc-inbound' },
  getCommunicationChannelsQueue: jest.fn(),
}))

const mockContainer = createRequestContainer as jest.MockedFunction<typeof createRequestContainer>
const mockQueue = getCommunicationChannelsQueue as jest.MockedFunction<typeof getCommunicationChannelsQueue>

const APP_SECRET = 'shared-meta-app-secret'

function sign(body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex')
}

type Channel = Record<string, unknown>

function channel(overrides: Channel): Channel {
  return {
    providerKey: 'whatsapp-business',
    channelType: 'whatsapp',
    organizationId: null,
    userId: null,
    isActive: true,
    credentialsRef: 'cred',
    ...overrides,
  }
}

const waChannelA = channel({
  id: 'ch-tenant-a',
  tenantId: 'tenant-a',
  externalIdentifier: 'PHONE_A',
})
const waChannelB = channel({
  id: 'ch-tenant-b',
  tenantId: 'tenant-b',
  externalIdentifier: 'PHONE_B',
})
const msChannelA = channel({
  id: 'ms-tenant-a',
  providerKey: 'messenger',
  channelType: 'messenger',
  tenantId: 'tenant-a',
  externalIdentifier: 'PAGE_A',
})
const msChannelB = channel({
  id: 'ms-tenant-b',
  providerKey: 'messenger',
  channelType: 'messenger',
  tenantId: 'tenant-b',
  externalIdentifier: 'PAGE_B',
})

function setup(channels: Channel[]) {
  const enqueue = jest.fn(async () => ({ id: 'job' }))
  mockQueue.mockReturnValue({ enqueue } as never)
  const em = {
    find: jest.fn(async (entity: unknown) =>
      entity === CommunicationChannel ? channels : [],
    ),
    findOne: jest.fn(async () => null),
    flush: jest.fn(async () => undefined),
  }
  const credentials = { resolve: jest.fn(async () => ({ appSecret: APP_SECRET })) }
  mockContainer.mockResolvedValue({
    resolve: (name: string) => {
      if (name === 'em') return { fork: () => em }
      if (name === 'integrationCredentialsService') return credentials
      throw new Error(`unexpected resolve ${name}`)
    },
  } as never)
  return { enqueue, em }
}

function whatsappBody(phoneNumberId: string, id = 'wamid.INBOUND') {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: phoneNumberId, display_phone_number: '+15550002222' },
              contacts: [{ wa_id: '15550003333', profile: { name: 'Customer' } }],
              messages: [
                {
                  from: '15550003333',
                  id,
                  timestamp: '1700000000',
                  type: 'text',
                  text: { body: 'hello' },
                },
              ],
            },
          },
        ],
      },
    ],
  })
}

function messengerBody(pageId: string, mid = 'm_INBOUND') {
  return JSON.stringify({
    object: 'page',
    entry: [
      {
        id: pageId,
        time: 1700000000000,
        messaging: [
          {
            sender: { id: 'PSID_CUSTOMER' },
            recipient: { id: pageId },
            timestamp: 1700000000000,
            message: { mid, text: 'hello' },
          },
        ],
      },
    ],
  })
}

async function postWhatsApp(body: string) {
  const { POST } = await import('../api/webhook/whatsapp/route')
  return POST(
    new Request('http://localhost/api/communications/webhook/whatsapp', {
      method: 'POST',
      body,
      headers: { 'x-hub-signature-256': sign(body) },
    }),
  )
}

async function postMessenger(body: string) {
  const { POST } = await import('../api/webhook/messenger/route')
  return POST(
    new Request('http://localhost/api/communications/webhook/messenger', {
      method: 'POST',
      body,
      headers: { 'x-hub-signature-256': sign(body) },
    }),
  )
}

describe('K2-D3: WhatsApp webhook is pinned to the channel account', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('queues a PHONE_B event against the PHONE_B channel, not the first candidate', async () => {
    const { enqueue } = setup([waChannelA, waChannelB])
    const res = await postWhatsApp(whatsappBody('PHONE_B'))

    expect(res.status).toBe(202)
    expect(enqueue).toHaveBeenCalledTimes(1)
    const job = (enqueue.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(job).toMatchObject({ channelId: 'ch-tenant-b', scope: { tenantId: 'tenant-b' } })
    expect(job.channelId).not.toBe('ch-tenant-a')
  })

  it('rejects an event for an account no channel owns, without enqueuing', async () => {
    const { enqueue } = setup([waChannelA, waChannelB])
    const res = await postWhatsApp(whatsappBody('PHONE_UNKNOWN'))

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: 'verification_failed', detail: 'account' })
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('rejects a payload mixing two accounts instead of guessing', async () => {
    const { enqueue } = setup([waChannelA, waChannelB])
    const mixed = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-1',
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: 'PHONE_A' },
                messages: [{ from: '1', id: 'wamid.A', timestamp: '1700000000', type: 'text', text: { body: 'a' } }],
              },
            },
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: 'PHONE_B' },
                messages: [{ from: '2', id: 'wamid.B', timestamp: '1700000000', type: 'text', text: { body: 'b' } }],
              },
            },
          ],
        },
      ],
    })
    const res = await postWhatsApp(mixed)

    expect(res.status).toBe(401)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('keeps legacy behavior when the channel has no externalIdentifier', async () => {
    const legacy = channel({ id: 'ch-legacy', tenantId: 'tenant-a', externalIdentifier: null })
    const { enqueue } = setup([legacy, waChannelB])
    const res = await postWhatsApp(whatsappBody('PHONE_B'))

    // Cannot prove the account, so the old first-verified-channel behavior is
    // retained (with a structured warning) until the row is reconnected.
    expect(res.status).toBe(202)
    expect((enqueue.mock.calls[0] as unknown[])[0]).toMatchObject({ channelId: 'ch-legacy' })
  })
})

describe('K2-D3: Messenger webhook is pinned to the Page account', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('queues a PAGE_B event against the PAGE_B channel', async () => {
    const { enqueue } = setup([msChannelA, msChannelB])
    const res = await postMessenger(messengerBody('PAGE_B'))

    expect(res.status).toBe(202)
    const job = (enqueue.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(job).toMatchObject({ channelId: 'ms-tenant-b', scope: { tenantId: 'tenant-b' } })
  })

  it('rejects a Page no channel owns', async () => {
    const { enqueue } = setup([msChannelA, msChannelB])
    const res = await postMessenger(messengerBody('PAGE_UNKNOWN'))

    expect(res.status).toBe(401)
    expect(enqueue).not.toHaveBeenCalled()
  })
})
