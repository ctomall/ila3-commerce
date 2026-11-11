import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
  ChannelThreadMapping,
  CommunicationChannel,
  ExternalMessage,
  MessageChannelLink,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import { Message } from '@open-mercato/core/modules/messages/data/entities'

/**
 * CHARACTERIZATION TEST — now INVERTED, as the file's original note required.
 *
 * The managed patch `scripts/patches/apply-outbound-attempt-unknown.mjs`
 * (manifest id `outbound-attempt-unknown`) is applied — verified in both this
 * tree and the current production release. It marks an accepted-but-uncommitted
 * send `unknown` instead of retrying, so the drill below must now expect ONE
 * provider send and an `unknown` link, never a second send.
 *
 * K2 drill — provider accepted, local commit failed → retry re-sends.
 *
 * `deliver-outbound-message.ts` calls the provider (line 455) and only THEN
 * flushes the success records (line 520). The comment at 445-454 calls this
 * at-least-once semantics on purpose. The round-64 managed patch
 * (`apply-dedupe-external-message-id.mjs`) only dedupes when the provider hands
 * back an external id we already persisted — it cannot help when the success
 * flush never committed, because nothing was stored.
 *
 * This drill drives the REAL installed command twice against a fake EM/DB:
 *   attempt 1: provider returns wamid.1, the success flush throws a transient
 *              PG error (08006), the failure path marks the link `failed`;
 *   attempt 2 (worker retry): link is non-terminal, so the command sends again.
 *
 * Result: one platform message, TWO provider sends. That is the risk.
 */

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findOneWithDecryption: async (em: { findOne: Function }, entity: unknown, where: unknown) =>
    em.findOne(entity, where),
  findWithDecryption: async (em: { find: Function }, entity: unknown, where: unknown) =>
    em.find(entity, where),
}))

jest.mock('@open-mercato/shared/lib/commands', () => ({
  registerCommand: () => undefined,
}))

jest.mock('@open-mercato/core/modules/communication_channels/lib/thread-token', () => ({
  getOrCreateThreadToken: jest.fn(async () => ({ token: 'om_test_token', created: false })),
  buildBodyFooter: () => ({ html: '<span style="display:none">[OM:om_test_token]</span>', plain: '\n[OM:om_test_token]' }),
  buildReferencesId: () => '<om_test_token@open-mercato.invalid>',
}))

jest.mock('@open-mercato/core/modules/communication_channels/lib/credential-refresh', () => ({
  refreshCredentialsIfNeeded: jest.fn(async (input: { credentials: unknown }) => ({
    credentials: input.credentials,
  })),
}))

jest.mock('@open-mercato/core/modules/communication_channels/lib/outbound-reply-ref', () => ({
  resolveOutboundReplyExternalId: jest.fn(async () => null),
  stripCallerReplyTargeting: (metadata: unknown) => metadata,
}))

const tenantId = '11111111-1111-4111-8111-111111111111'
const organizationId = null

type Db = {
  message: Record<string, unknown>
  mapping: Record<string, unknown>
  channels: Record<string, unknown>[]
  links: Record<string, unknown>[]
  external: Record<string, unknown>[]
  flushCount: number
  failSuccessFlushOnce: boolean
}

function createDb(): Db {
  return {
    message: {
      id: '22222222-2222-4222-8222-222222222222',
      threadId: '33333333-3333-4333-8333-333333333333',
      body: 'hello from the CRM',
      bodyFormat: 'text',
      parentMessageId: null,
      visibility: 'public',
      senderUserId: 'u1',
      tenantId,
      organizationId,
    },
    mapping: {
      id: 'map-1',
      messageThreadId: '33333333-3333-4333-8333-333333333333',
      externalConversationId: 'conv-1',
      channelId: 'ch-1',
      providerKey: 'whatsapp-business',
      externalThreadRef: '15550001111',
      tenantId,
      organizationId,
      assignedUserId: null,
    },
    channels: [
      {
        id: 'ch-1',
        providerKey: 'whatsapp-business',
        channelType: 'whatsapp',
        isActive: true,
        status: 'connected',
        credentialsRef: 'cred-1',
        userId: null,
        tenantId,
        organizationId,
      },
    ],
    links: [],
    external: [],
    flushCount: 0,
    failSuccessFlushOnce: true,
  }
}

function createEm(db: Db) {
  let pendingNew: Array<{ entity: unknown; row: Record<string, unknown> }> = []
  const em = {
    findOne: jest.fn(async (entity: unknown, where: Record<string, unknown>) => {
      if (entity === Message) return db.message
      if (entity === ChannelThreadMapping) return db.mapping
      if (entity === CommunicationChannel) return db.channels.find((row) => row.id === where.id) ?? null
      if (entity === MessageChannelLink) {
        return db.links.find((row) => row.messageId === where.messageId) ?? null
      }
      if (entity === ExternalMessage) {
        return (
          db.external.find(
            (row) =>
              row.channelId === where.channelId && row.externalMessageId === where.externalMessageId,
          ) ?? null
        )
      }
      return null
    }),
    create: (_entity: unknown, data: Record<string, unknown>) => ({ ...data }),
    persist: (row: Record<string, unknown>) => {
      pendingNew.push({ entity: null, row })
    },
    flush: jest.fn(async () => {
      db.flushCount += 1
      // The second flush of the first attempt is the success flush that commits
      // the ExternalMessage + flips the link to `sent`. Model a transient DB
      // failure there (the provider has already accepted the send).
      if (db.failSuccessFlushOnce && db.flushCount === 2) {
        db.failSuccessFlushOnce = false
        pendingNew = []
        // Roll back the in-memory unit of work the way the DB would: the link
        // stays `pending` (it was committed by flush #1), no ExternalMessage row.
        for (const link of db.links) {
          link.deliveryStatus = 'pending'
          link.externalMessageId = null
        }
        throw Object.assign(new Error('connection terminated unexpectedly'), { code: '08006' })
      }
      for (const { row } of pendingNew) {
        if (!db.links.includes(row as never) && (row as { messageId?: unknown }).messageId) {
          db.links.push(row)
        } else if ((row as { externalMessageId?: unknown }).externalMessageId) {
          db.external.push(row)
        }
      }
      pendingNew = []
    }),
    fork: () => createEm(db),
    // Model the `patched:outbound-concurrent-claim` UPDATE ... RETURNING: the
    // claim succeeds only for a link that is neither terminal nor already
    // marked `attempting`, and the marker is committed immediately (it is not
    // part of the entity-manager unit of work).
    getConnection: () => ({
      execute: async () => {
        const link = db.links.find((row) => row.messageId === db.message.id)
        if (!link) return []
        const metadata = (link.channelMetadata ?? {}) as Record<string, unknown>
        const status = String(link.deliveryStatus)
        const terminal = ['sent', 'delivered', 'read'].includes(status)
        if (terminal || metadata.attempting === true) return []
        link.channelMetadata = { ...metadata, attempting: true, lastAttemptAt: new Date().toISOString() }
        return [{ id: link.id }]
      },
    }),
  }
  return em
}

function createAdapter() {
  const sendMessage = jest.fn(async () => ({
    externalMessageId: `wamid.${sendMessage.mock.calls.length}`,
    status: 'sent' as const,
  }))
  return {
    providerKey: 'whatsapp-business',
    channelType: 'whatsapp',
    capabilities: {
      threading: true,
      richText: false,
      fileSharing: true,
      readReceipts: true,
      deliveryReceipts: true,
      typingIndicators: false,
      reactions: false,
      multiReactionPerUser: false,
      editMessage: false,
      deleteMessage: false,
      presence: false,
      richBlocks: false,
      interactiveComponents: true,
      inlineImages: true,
      conversationHistory: false,
      contactCards: false,
      locationSharing: false,
      voiceNotes: true,
      stickers: true,
      supportedBodyFormats: ['text' as const],
      realtimeMaxBodyLength: undefined,
      recipientFormat: 'provider-native' as const,
    },
    convertOutbound: jest.fn(async (input: { body: string }) => ({
      content: { text: input.body, bodyFormat: 'text' as const },
      metadata: { to: '15550001111' },
    })),
    sendMessage,
  }
}

function commandContext(em: unknown, adapter: unknown) {
  const container = {
    resolve: (name: string) => {
      if (name === 'em') return { fork: () => em }
      if (name === 'channelAdapterRegistry') return { get: () => adapter }
      if (name === 'integrationCredentialsService') {
        return { resolve: async () => ({ accessToken: 'token', phoneNumberId: '15550000000' }) }
      }
      throw new Error(`unavailable: ${name}`)
    },
  }
  return {
    container,
    auth: null,
    organizationScope: null,
    selectedOrganizationId: organizationId,
    organizationIds: null,
  }
}

describe('K2: provider accepted but the success commit failed', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('never re-invokes the provider after an unknown outcome (inverted defect drill)', async () => {
    const db = createDb()
    const em = createEm(db)
    const adapter = createAdapter()
    const { default: deliver } = await import(
      '@open-mercato/core/modules/communication_channels/commands/deliver-outbound-message'
    )

    const input = {
      messageId: db.message.id as string,
      scope: { tenantId, organizationId },
    }

    // Attempt 1 — provider accepts, then the local success flush dies (08006).
    // The outcome is UNKNOWN, not a retryable failure: the customer may already
    // have the message, so the link must never look like a clean retry.
    const first = await deliver.execute(input, commandContext(em, adapter) as never)
    expect(first).toMatchObject({ status: 'unknown', reason: 'local_commit_failed' })
    expect(adapter.sendMessage).toHaveBeenCalledTimes(1)
    // Nothing committed: the accepted provider id is not in the CRM.
    expect(db.external).toHaveLength(0)
    expect(db.links[0]).toMatchObject({ deliveryStatus: 'unknown' })
    expect(db.links[0].channelMetadata).toMatchObject({ unknownResult: true, attempting: false })

    // Attempt 2 — a replay (stalled job, worker restart, manual re-run) must not
    // call the provider again; the unknown link short-circuits on entry.
    const second = await deliver.execute(
      input,
      commandContext(createEm(db), adapter) as never,
    )
    expect(second).toMatchObject({ status: 'unknown', error: 'local_commit_failed' })
    expect(adapter.sendMessage).toHaveBeenCalledTimes(1)
    expect(db.external).toHaveLength(0)
    expect(db.links[0]).toMatchObject({ deliveryStatus: 'unknown' })
  })
})
