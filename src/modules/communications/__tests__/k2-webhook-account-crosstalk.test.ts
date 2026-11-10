import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import crypto from 'node:crypto'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CommunicationChannel } from '@open-mercato/core/modules/communication_channels/data/entities'
import { getCommunicationChannelsQueue } from '@open-mercato/core/modules/communication_channels/lib/queue'

/**
 * CHARACTERIZATION TEST — documents OPEN defect D3, not a regression guard.
 *
 * When D3 is fixed (webhook routing must pin the payload's account identity to
 * the channel), this test MUST BE INVERTED: it currently asserts the event is
 * queued against the wrong tenant's channel.
 *
 * K2 drill — multi-account crosstalk between two tenants that share a Meta app.
 *
 * Both the hub's generic webhook route (`api/post/webhook/[provider]/route.ts:114-147`)
 * and this app's dedicated WhatsApp route (`api/webhook/whatsapp/route.ts:61-89`)
 * select a channel by asking "does THIS channel's appSecret verify the HMAC?".
 * The signature is a property of the Meta APP, not of the phone number/page, so
 * when two tenants connect different numbers under the same app (the normal
 * SaaS shape), every candidate verifies. The first candidate wins, and the
 * payload's own `metadata.phone_number_id` — the only field that says which
 * account the event belongs to — is never consulted.
 *
 * This drill proves the mismatch: a signed event for phone B is accepted and
 * queued against tenant A's channel because it appears first in the candidate
 * list.
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

const channelA = {
  id: 'ch-tenant-a',
  providerKey: 'whatsapp-business',
  channelType: 'whatsapp',
  tenantId: 'tenant-a',
  organizationId: null,
  userId: null,
  isActive: true,
  credentialsRef: 'cred-a',
}

const channelB = {
  id: 'ch-tenant-b',
  providerKey: 'whatsapp-business',
  channelType: 'whatsapp',
  tenantId: 'tenant-b',
  organizationId: null,
  userId: null,
  isActive: true,
  credentialsRef: 'cred-b',
}

function setup() {
  const enqueue = jest.fn(async () => ({ id: 'job' }))
  mockQueue.mockReturnValue({ enqueue } as never)
  const em = {
    find: jest.fn(async (entity: unknown) =>
      entity === CommunicationChannel ? [channelA, channelB] : [],
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

describe('K2: Meta webhook routing ignores phone_number_id', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('queues an event addressed to phone B against the first verified channel (tenant A)', async () => {
    const { enqueue } = setup()
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                // The payload says which phone number this event belongs to.
                metadata: { phone_number_id: 'PHONE_B', display_phone_number: '+15550002222' },
                contacts: [{ wa_id: '15550003333', profile: { name: 'Customer' } }],
                messages: [
                  {
                    from: '15550003333',
                    id: 'wamid.INBOUND-FOR-B',
                    timestamp: '1700000000',
                    type: 'text',
                    text: { body: 'hello tenant B' },
                  },
                ],
              },
            },
          ],
        },
      ],
    })

    const { POST } = await import('../api/webhook/whatsapp/route')
    const res = await POST(
      new Request('http://localhost/api/communications/webhook/whatsapp', {
        method: 'POST',
        body,
        headers: { 'x-hub-signature-256': sign(body) },
      }),
    )

    expect(res.status).toBe(202)
    expect(enqueue).toHaveBeenCalledTimes(1)
    const job = (enqueue.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    // Reproduced: the event explicitly targets PHONE_B, but it is queued against
    // channelA and tenant-a because signature verification cannot tell the two
    // tenants apart when they share a Meta app.
    expect(job).toMatchObject({ channelId: 'ch-tenant-a', scope: { tenantId: 'tenant-a' } })
    expect(job.channelId).not.toBe('ch-tenant-b')
  })
})
