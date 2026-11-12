import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

/**
 * Runtime proof for the K2 case "provider accepted, local commit failed".
 *
 * The outbound job commits the attempt marker, calls the provider, then commits
 * the result. When the provider accepted but the result commit fails, the
 * message is already with the customer — the CRM must not pretend nothing
 * happened and must not send it again. `outbound-attempt-unknown` classifies
 * that window as `unknown` with `reason: local_commit_failed` and stores the
 * provider id when the adapter returned one.
 *
 * The second scenario is the recovery shape: if the unknown marker itself could
 * not be committed (the write path that just failed fails again), the database
 * keeps `pending` + `attempting=true`. A redelivery must then land on the
 * attempt-lease branch, mark the link `unknown` and never call the provider
 * again. That is the difference between "unknown, reconcile" and a blind
 * resend.
 *
 * The patched command is built in a temp mirror by the real managed patch
 * scripts (attempt-unknown + dedupe), so the assertions run the shipped text,
 * not a copy of it.
 */
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

jest.mock('@open-mercato/shared/lib/commands', () => ({
  registerCommand: () => undefined,
}))

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const MESSAGE_ID = '44444444-4444-4444-8444-444444444444'
const THREAD_ID = '55555555-5555-4555-8555-555555555555'
const CHANNEL_ID = '66666666-6666-4666-8666-666666666666'
const CONVERSATION_ID = '77777777-7777-4777-8777-777777777777'
const LINK_ID = '88888888-8888-4888-8888-888888888888'
const MAPPING_ID = '99999999-9999-4999-8999-999999999999'
const PROVIDER_ID = 'wamid.LOCAL1'

type State = {
  message: Record<string, unknown>
  mapping: Record<string, unknown>
  channel: Record<string, unknown>
  link: Record<string, unknown>
  external: Record<string, unknown> | null
}

const globalEvents = globalThis as Record<string, unknown>
globalEvents.__K2_COMMIT_EVENTS__ = [] as unknown[][]
const eventLog = globalEvents.__K2_COMMIT_EVENTS__ as unknown[][]

function scenario(overrides: Record<string, unknown> = {}): State {
  return {
    message: {
      id: MESSAGE_ID,
      threadId: THREAD_ID,
      body: 'outbound body',
      bodyFormat: 'text',
      parentMessageId: null,
      tenantId: TENANT,
      organizationId: ORG,
    },
    mapping: {
      id: MAPPING_ID,
      channelId: CHANNEL_ID,
      externalConversationId: CONVERSATION_ID,
      messageThreadId: THREAD_ID,
      providerKey: 'whatsapp-business',
      externalThreadRef: 'wa-1',
      tenantId: TENANT,
      organizationId: ORG,
    },
    channel: {
      id: CHANNEL_ID,
      providerKey: 'whatsapp-business',
      channelType: 'whatsapp',
      isActive: true,
      status: 'connected',
      userId: null,
      credentialsRef: null,
      tenantId: TENANT,
      organizationId: ORG,
    },
    link: {
      id: LINK_ID,
      messageId: MESSAGE_ID,
      externalConversationId: CONVERSATION_ID,
      direction: 'outbound',
      deliveryStatus: 'pending',
      providerKey: 'whatsapp-business',
      channelType: 'whatsapp',
      channelMetadata: {},
      tenantId: TENANT,
      organizationId: ORG,
      ...overrides,
    },
    external: null,
  }
}

type FakeEm = {
  findOne: jest.Mock
  create: jest.Mock
  persist: jest.Mock
  flush: jest.Mock
  fork: () => FakeEm
  getConnection: () => { execute: jest.Mock }
}

function createFakeEm(state: State, flushBehaviour: 'commit-once-then-fail' | 'always-ok' | 'always-fail'): FakeEm {
  let flushCall = 0
  const flush = jest.fn(async () => {
    flushCall += 1
    if (flushBehaviour === 'always-fail') throw new Error('commit failed')
    if (flushBehaviour === 'commit-once-then-fail' && flushCall === 1) throw new Error('commit failed')
    return undefined
  })

  const findOne = jest.fn(async (entity: unknown, where: Record<string, unknown>) => {
    const name = (entity as { name?: string })?.name
    if (name === 'Message') return state.message
    if (name === 'ChannelThreadMapping') return state.mapping
    if (name === 'CommunicationChannel') return state.channel
    if (name === 'MessageChannelLink') {
      if (where?.messageId !== state.message.id) return null
      return state.link
    }
    if (name === 'ExternalMessage') return state.external
    return null
  })

  const create = jest.fn((_entity: unknown, data: Record<string, unknown>) => ({ ...data }))
  const persist = jest.fn(() => undefined)
  const execute = jest.fn(async () => [{ id: LINK_ID }])

  const em: FakeEm = {
    findOne,
    create,
    persist,
    flush,
    fork: () => em,
    getConnection: () => ({ execute }),
  }
  return em
}

function createContainer(em: FakeEm) {
  const sendMessage = jest.fn(async () => ({ status: 'sent', externalMessageId: PROVIDER_ID }))
  const convertOutbound = jest.fn(async () => ({
    content: { text: 'outbound body' },
    metadata: { messageId: '<outbound@example.invalid>' },
  }))
  const adapter = {
    providerKey: 'whatsapp-business',
    channelType: 'whatsapp',
    capabilities: { threading: false },
    convertOutbound,
    sendMessage,
  }
  return {
    container: {
      resolve: (name: string) => {
        if (name === 'em') return { fork: () => em }
        if (name === 'channelAdapterRegistry') return { get: () => adapter }
        throw new Error(`unexpected resolve: ${name}`)
      },
    },
    sendMessage,
    convertOutbound,
  }
}

const commandCtx = (container: unknown) =>
  ({
    container,
    auth: null,
    organizationScope: null,
    selectedOrganizationId: ORG,
    organizationIds: [ORG],
  }) as never

const input = { messageId: MESSAGE_ID, scope: { tenantId: TENANT, organizationId: ORG } }

function pathToFileUrl(absolutePath: string): string {
  return pathToFileURL(absolutePath).href
}

/**
 * Builds the shipped command in a temp mirror: the installed dist file plus the
 * two managed patches that own this window (attempt/claim + dedupe). Relative
 * deps become tiny stubs, so the test exercises the patched control flow.
 */
function buildPatchedCommand(): string {
  const repoRoot = process.cwd()
  const tempRoot = path.join(repoRoot, '.tmp', `k2commit-${randomUUID()}`)
  fs.mkdirSync(path.join(repoRoot, '.tmp'), { recursive: true })

  const communicationRoot = path.join(
    tempRoot,
    'node_modules/@open-mercato/core/dist/modules/communication_channels',
  )
  const distRoot = path.join(repoRoot, 'node_modules/@open-mercato/core/dist/modules/communication_channels')
  for (const dir of ['commands', 'lib', 'data', 'workers']) {
    fs.mkdirSync(path.join(communicationRoot, dir), { recursive: true })
  }
  fs.mkdirSync(path.join(tempRoot, 'node_modules/@open-mercato/core/dist/modules/messages/data'), {
    recursive: true,
  })

  fs.copyFileSync(
    path.join(distRoot, 'commands/deliver-outbound-message.js'),
    path.join(communicationRoot, 'commands/deliver-outbound-message.js'),
  )
  // The attempt-unknown patch also teaches the worker that `unknown` is
  // terminal; it must exist in the mirror even though this test drives the
  // command directly.
  fs.copyFileSync(
    path.join(distRoot, 'workers/outbound-delivery.js'),
    path.join(communicationRoot, 'workers/outbound-delivery.js'),
  )

  const reexport = (absolutePath: string) => `export * from ${JSON.stringify(pathToFileUrl(absolutePath))};\n`
  fs.writeFileSync(
    path.join(communicationRoot, 'data/entities.js'),
    reexport(path.join(distRoot, 'data/entities.js')),
  )
  fs.writeFileSync(
    path.join(tempRoot, 'node_modules/@open-mercato/core/dist/modules/messages/data/entities.js'),
    reexport(path.join(repoRoot, 'node_modules/@open-mercato/core/dist/modules/messages/data/entities.js')),
  )

  fs.writeFileSync(
    path.join(communicationRoot, 'events.js'),
    'export async function emitCommunicationChannelsEvent(...args) {\n' +
      '  globalThis.__K2_COMMIT_EVENTS__.push(args);\n' +
      '}\n',
  )
  fs.writeFileSync(
    path.join(communicationRoot, 'lib/credential-refresh.js'),
    'export async function refreshCredentialsIfNeeded(input) { return { credentials: input.credentials }; }\n',
  )
  fs.writeFileSync(
    path.join(communicationRoot, 'lib/thread-token.js'),
    'export async function getOrCreateThreadToken() { return { token: "om_test" }; }\n' +
      'export function buildBodyFooter() { return { html: "", plain: "" }; }\n' +
      'export function buildReferencesId() { return "<om_test@open-mercato.invalid>"; }\n',
  )
  fs.writeFileSync(
    path.join(communicationRoot, 'lib/email-mime.js'),
    'export function stringOrUndefined(value) { return typeof value === "string" ? value : undefined; }\n' +
      'export function stripBrackets(value) { return typeof value === "string" ? value.replace(/^<|>$/g, "") : value; }\n',
  )
  fs.writeFileSync(
    path.join(communicationRoot, 'lib/outbound-reply-ref.js'),
    'export async function resolveOutboundReplyExternalId() { return null; }\n' +
      'export function stripCallerReplyTargeting(metadata) { return metadata; }\n',
  )
  fs.writeFileSync(
    path.join(communicationRoot, 'lib/pg-errors.js'),
    'export function isUniqueViolation() { return false; }\n',
  )
  fs.writeFileSync(
    path.join(communicationRoot, 'lib/error-classification.js'),
    'export function classifyOutboundError(error) { return { transient: false, message: String(error?.message ?? error) }; }\n' +
      'export function isReauthError() { return false; }\n' +
      'export function computeBackoffMs() { return 1; }\n',
  )

  for (const script of [
    'scripts/patches/apply-outbound-attempt-unknown.mjs',
    'scripts/patches/apply-dedupe-external-message-id.mjs',
  ]) {
    execFileSync(process.execPath, [path.join(repoRoot, script)], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, OM_PATCH_REPO_ROOT: tempRoot },
    })
  }

  return path.join(communicationRoot, 'commands/deliver-outbound-message.js')
}

function loadCommand(absolutePath: string): {
  execute: (input: unknown, ctx: unknown) => Promise<Record<string, unknown>>
} {
  return (require(absolutePath) as {
    default: { execute: (input: unknown, ctx: unknown) => Promise<Record<string, unknown>> }
  }).default
}

describe('K2 provider accepted / local commit failed (runtime)', () => {
  beforeEach(() => {
    eventLog.length = 0
    jest.clearAllMocks()
  })

  it('marks the link unknown with the provider id instead of resending', async () => {
    const commandPath = buildPatchedCommand()
    const source = fs.readFileSync(commandPath, 'utf8')
    expect(source).toContain('/* [patched:outbound-attempt-unknown] */')
    expect(source).toContain('/* [patched:outbound-concurrent-claim] */')
    expect(source).toContain('/* [patched:dedupe-external-id] */')

    const deliver = loadCommand(commandPath)
    const state = scenario()
    // The first flush is the result commit; it fails after the provider accepted.
    const em = createFakeEm(state, 'commit-once-then-fail')
    const { container, sendMessage } = createContainer(em)

    const result = await deliver.execute(input, commandCtx(container))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      status: 'unknown',
      messageId: MESSAGE_ID,
      channelLinkId: LINK_ID,
      providerKey: 'whatsapp-business',
      reason: 'local_commit_failed',
    })
    expect(state.link.deliveryStatus).toBe('unknown')
    expect(state.link.channelMetadata).toMatchObject({
      attempting: false,
      unknownResult: true,
      unknownReason: 'local_commit_failed',
      providerExternalMessageId: PROVIDER_ID,
    })
    // The provider id is recorded so reconciliation can match it later.
    const external = em.create.mock.calls.find(
      ([, data]) => (data as Record<string, unknown>)?.externalMessageId === PROVIDER_ID,
    )
    expect(external).toBeTruthy()
    expect(em.persist).toHaveBeenCalled()

    const names = eventLog.map((entry) => entry[0])
    expect(names).toEqual(['communication_channels.message.delivery_failed'])
    expect(eventLog[0][1]).toMatchObject({
      messageId: MESSAGE_ID,
      channelLinkId: LINK_ID,
      unknownResult: true,
      reason: 'local_commit_failed',
      error: expect.stringContaining('commit failed'),
    })
    // A committed-send event must never claim success for an uncommitted send.
    expect(names).not.toContain('communication_channels.message.sent')
  })

  it('after the unknown marker itself failed, a redelivery expires the lease and never re-sends', async () => {
    const deliver = loadCommand(buildPatchedCommand())
    // Database truth after the failed marker write: pending + a stale attempt.
    const state = scenario({
      deliveryStatus: 'pending',
      channelMetadata: {
        attempting: true,
        lastAttemptAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        providerAccepted: false,
      },
    })
    const em = createFakeEm(state, 'always-ok')
    const { container, sendMessage } = createContainer(em)

    const result = await deliver.execute(input, commandCtx(container))

    expect(sendMessage).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'unknown', channelLinkId: LINK_ID, error: 'attempt_lease_expired' })
    expect(state.link.deliveryStatus).toBe('unknown')
    expect(state.link.channelMetadata).toMatchObject({
      attempting: false,
      unknownResult: true,
      unknownReason: 'attempt_lease_expired',
    })
    expect(eventLog.map((entry) => entry[0])).toEqual(['communication_channels.message.delivery_failed'])
  })

  it('a live attempt marker is not resent either, even before the lease expires', async () => {
    const deliver = loadCommand(buildPatchedCommand())
    const state = scenario({
      deliveryStatus: 'pending',
      channelMetadata: { attempting: true, lastAttemptAt: new Date().toISOString() },
    })
    const em = createFakeEm(state, 'always-ok')
    const { container, sendMessage } = createContainer(em)

    const result = await deliver.execute(input, commandCtx(container))

    expect(sendMessage).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'unknown', error: 'attempt_marker_present' })
    expect(state.link.deliveryStatus).toBe('unknown')
  })
})
