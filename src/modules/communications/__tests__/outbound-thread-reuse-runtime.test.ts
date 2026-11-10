import { afterAll, describe, expect, it, jest } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * RUNTIME differential proof for the `outbound-thread-reuse` managed patch.
 *
 * Seam (chosen because the installed module is ESM inside node_modules):
 * - (A) `require()` the real installed `lib/send-as-user.js` through Jest's
 *   transformer, with `@open-mercato/shared/lib/encryption/find` mocked as a
 *   pass-through and the hub queue module stubbed.
 * - (B) mirror the small dist module closure into `.tmp/p6-<uuid>`, write queue
 *   and email-mime stubs, run the real patch script with `OM_PATCH_REPO_ROOT`
 *   pointing at that mirror, then `require()` the patched absolute path. The
 *   mirror lives under the worktree, so bare deps resolve up to the real
 *   node_modules; relative deps resolve to the copied closure.
 * - The fake EM matches entities by `entity.name`, so the real and copied
 *   entity class instances are interchangeable.
 * The shared install is never modified; the temp mirror is removed in afterAll.
 */

const mockEnqueue = jest.fn(async () => undefined)

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findOneWithDecryption: async (
    em: { findOne: (entity: unknown, where: unknown) => Promise<unknown> },
    entity: unknown,
    where: unknown,
  ) => em.findOne(entity, where),
  findWithDecryption: async (
    em: { find: (entity: unknown, where: unknown) => Promise<unknown[]> },
    entity: unknown,
    where: unknown,
  ) => em.find(entity, where),
}))

jest.mock('@open-mercato/core/modules/communication_channels/lib/queue', () => ({
  COMMUNICATION_CHANNELS_QUEUES: { outbound: 'cc-outbound' },
  getCommunicationChannelsQueue: jest.fn(() => ({ enqueue: mockEnqueue })),
}))

type Row = Record<string, unknown>

type FakeDb = {
  channel: Row
  conversations: Row[]
  links: Row[]
  mappings: Row[]
  createdConversations: Row[]
  createdMappings: Row[]
  createdLinks: Row[]
}

function createFakeDb(): FakeDb {
  const parentConversation: Row = {
    id: 'conv-parent',
    channelId: 'ch-1',
    externalConversationId: 'wa-15550001111',
    subject: 'Inbound thread',
    assignedUserId: 'u1',
    lastMessageAt: new Date('2026-11-01T10:00:00Z'),
    tenantId: 't1',
    organizationId: 'o1',
  }
  const parentLink: Row = {
    id: 'link-parent',
    messageId: 'parent-msg-1',
    externalConversationId: 'conv-parent',
    providerKey: 'whatsapp-business',
    channelType: 'whatsapp',
    direction: 'inbound',
    deliveryStatus: 'received',
    tenantId: 't1',
    organizationId: 'o1',
  }
  const parentMapping: Row = {
    id: 'map-parent',
    externalConversationId: 'conv-parent',
    messageThreadId: 'thread-1',
    channelId: 'ch-1',
    providerKey: 'whatsapp-business',
    externalThreadRef: 'wa-15550001111',
    assignedUserId: 'u1',
    tenantId: 't1',
    organizationId: 'o1',
  }
  return {
    channel: {
      id: 'ch-1',
      tenantId: 't1',
      organizationId: 'o1',
      userId: 'u1',
      isActive: true,
      status: 'connected',
      providerKey: 'whatsapp-business',
      channelType: 'whatsapp',
      visibility: 'private',
      deletedAt: null,
    },
    conversations: [parentConversation],
    links: [parentLink],
    mappings: [parentMapping],
    createdConversations: [],
    createdMappings: [],
    createdLinks: [],
  }
}

function entityName(entity: unknown): string {
  return (entity as { name?: string })?.name ?? ''
}

function createFakeEm(db: FakeDb) {
  const pending: Array<{ kind: string; row: Row }> = []

  const findOne = jest.fn(async (entity: unknown, where: Row) => {
    const name = entityName(entity)
    if (name === 'CommunicationChannel') {
      return where.id && where.id !== db.channel.id ? null : db.channel
    }
    if (name === 'ExternalConversation') {
      if (where.id) return db.conversations.find((row) => row.id === where.id) ?? null
      return (
        db.conversations.find(
          (row) =>
            row.channelId === where.channelId &&
            row.externalConversationId === where.externalConversationId,
        ) ?? null
      )
    }
    if (name === 'MessageChannelLink') {
      if (where.messageId === 'parent-msg-1' && where.direction === 'inbound') {
        return db.links.find((row) => row.messageId === 'parent-msg-1') ?? null
      }
      return db.links.find((row) => row.messageId === where.messageId) ?? null
    }
    if (name === 'ChannelThreadMapping') {
      return (
        db.mappings.find((row) => row.externalConversationId === where.externalConversationId) ?? null
      )
    }
    return null
  })

  const find = jest.fn(async (entity: unknown) => {
    const name = entityName(entity)
    if (name === 'CommunicationChannel') return [db.channel]
    if (name === 'ExternalConversation') return db.conversations
    if (name === 'MessageChannelLink') return db.links
    if (name === 'ChannelThreadMapping') return db.mappings
    return []
  })

  const em = {
    findOne,
    find,
    create: jest.fn((entity: unknown, data: Row) => {
      const name = entityName(entity)
      const prefix =
        name === 'ExternalConversation'
          ? 'conv-created'
          : name === 'ChannelThreadMapping'
            ? 'map-created'
            : name === 'MessageChannelLink'
              ? 'link-created'
              : 'row-created'
      const row = { id: `${prefix}-${pending.length + 1}`, ...data }
      pending.push({ kind: name, row })
      return row
    }),
    persist: jest.fn((row: Row) => {
      pending.find((entry) => entry.row === row)
      return row
    }),
    flush: jest.fn(async () => {
      for (const entry of pending.splice(0)) {
        if (entry.kind === 'ExternalConversation') {
          db.conversations.push(entry.row)
          db.createdConversations.push(entry.row)
        } else if (entry.kind === 'ChannelThreadMapping') {
          db.mappings.push(entry.row)
          db.createdMappings.push(entry.row)
        } else if (entry.kind === 'MessageChannelLink') {
          db.links.push(entry.row)
          db.createdLinks.push(entry.row)
        }
      }
    }),
    transactional: jest.fn(async (fn: () => Promise<unknown>) => fn()),
  }

  return em
}

function createContainer(db: FakeDb, em: ReturnType<typeof createFakeEm>) {
  const adapter = {
    providerKey: 'whatsapp-business',
    channelType: 'whatsapp',
    capabilities: { recipientFormat: 'provider-native', threading: true },
  }
  const commandBus = {
    execute: jest.fn(async () => ({
      result: { id: 'new-msg-1', threadId: 'thread-1' },
    })),
  }
  return {
    resolve: (name: string) => {
      if (name === 'em') return { fork: () => em }
      if (name === 'commandBus') return commandBus
      if (name === 'channelAdapterRegistry') return { get: () => adapter }
      throw new Error(`unexpected resolve: ${name}`)
    },
  }
}

const actor = { userId: 'u1', tenantId: 't1', organizationId: 'o1' }
const input = {
  userChannelId: 'ch-1',
  to: ['15550001111'],
  subject: 'Re: inbound',
  body: { plain: 'reply body' },
  parentMessageId: 'parent-msg-1',
}

const tempRoots: string[] = []

afterAll(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function buildPatchedModule(): string {
  const repoRoot = process.cwd()
  const scriptPath = path.join(repoRoot, 'scripts/patches/apply-outbound-thread-reuse.mjs')
  const tempRoot = path.join(repoRoot, '.tmp', `p6-${randomUUID()}`)
  tempRoots.push(tempRoot)
  fs.mkdirSync(path.join(repoRoot, '.tmp'), { recursive: true })

  const communicationRoot = path.join(
    tempRoot,
    'node_modules/@open-mercato/core/dist/modules/communication_channels',
  )
  fs.mkdirSync(path.join(communicationRoot, 'lib'), { recursive: true })
  fs.mkdirSync(path.join(communicationRoot, 'data'), { recursive: true })

  const distRoot = path.join(
    repoRoot,
    'node_modules/@open-mercato/core/dist/modules/communication_channels',
  )
  for (const [from, to] of [
    ['lib/send-as-user.js', 'lib/send-as-user.js'],
    ['lib/mutation-guards.js', 'lib/mutation-guards.js'],
    ['lib/outbound-recipient.js', 'lib/outbound-recipient.js'],
    ['data/entities.js', 'data/entities.js'],
  ]) {
    fs.copyFileSync(path.join(distRoot, from), path.join(communicationRoot, to))
  }

  // Keep the mirror self-contained: sendAsUser imports these two, but the
  // differential only exercises compose/conversation behavior.
  fs.writeFileSync(
    path.join(communicationRoot, 'lib/queue.js'),
    'export const COMMUNICATION_CHANNELS_QUEUES = { outbound: "cc-outbound" };\n' +
      'export function getCommunicationChannelsQueue() { return { enqueue: async () => undefined }; }\n',
  )
  fs.writeFileSync(
    path.join(communicationRoot, 'lib/email-mime.js'),
    'export function htmlToText(html) { return String(html ?? ""); }\n',
  )

  execFileSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, OM_PATCH_REPO_ROOT: tempRoot },
  })

  return path.join(communicationRoot, 'lib/send-as-user.js')
}

function loadModule(absolutePath: string): {
  sendAsUser: (
    container: unknown,
    actor: Record<string, unknown>,
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(absolutePath) as {
    sendAsUser: (
      container: unknown,
      actor: Record<string, unknown>,
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>
  }
}

describe('outbound-thread-reuse runtime differential', () => {
  it('A: unpatched sendAsUser creates a second outbound:<threadId> conversation', async () => {
    const db = createFakeDb()
    const em = createFakeEm(db)
    const sendAsUser = loadModule(
      path.join(
        process.cwd(),
        'node_modules/@open-mercato/core/dist/modules/communication_channels/lib/send-as-user.js',
      ),
    ).sendAsUser

    const parentLinkBefore = JSON.stringify(db.links[0])
    const result = await sendAsUser(createContainer(db, em), actor, input)

    expect(result).toMatchObject({ ok: true, threadId: 'thread-1' })
    expect(db.conversations).toHaveLength(2)
    expect(db.createdConversations).toHaveLength(1)
    expect(db.createdConversations[0]).toMatchObject({
      channelId: 'ch-1',
      externalConversationId: 'outbound:thread-1',
    })
    expect(db.createdConversations[0].id).not.toBe('conv-parent')
    expect(db.createdMappings).toHaveLength(1)
    expect(db.createdMappings[0]).toMatchObject({
      messageThreadId: 'thread-1',
      externalThreadRef: 'outbound:thread-1',
    })
    expect(db.createdLinks).toHaveLength(1)
    expect(db.createdLinks[0].externalConversationId).toBe(db.createdConversations[0].id)
    expect(JSON.stringify(db.links[0])).toBe(parentLinkBefore)
  })

  it('B: patched sendAsUser reuses the inbound conversation and creates no second one', async () => {
    const patchedPath = buildPatchedModule()
    const patchedSource = fs.readFileSync(patchedPath, 'utf8')
    expect(patchedSource).toContain('/* [patched:outbound-thread-reuse] */')

    const db = createFakeDb()
    const em = createFakeEm(db)
    const sendAsUser = loadModule(patchedPath).sendAsUser

    const parentLinkBefore = JSON.stringify(db.links[0])
    const result = await sendAsUser(createContainer(db, em), actor, input)

    expect(result).toMatchObject({ ok: true, threadId: 'thread-1' })
    // No new conversation and no new mapping; the existing inbound one is used.
    expect(db.conversations).toHaveLength(1)
    expect(db.createdConversations).toHaveLength(0)
    expect(db.createdMappings).toHaveLength(0)
    // The outbound link is filed against the seeded inbound conversation.
    expect(db.createdLinks).toHaveLength(1)
    expect(db.createdLinks[0].externalConversationId).toBe('conv-parent')
    // The parent message/link is read-only.
    expect(JSON.stringify(db.links[0])).toBe(parentLinkBefore)
    expect(db.conversations[0]).toMatchObject({
      id: 'conv-parent',
      externalConversationId: 'wa-15550001111',
    })
  })
})
