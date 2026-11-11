import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

/**
 * Runtime proof for `outbound-inactive-channel-failed`.
 *
 * Fake EM seams (same pattern as the D2 drill): the installed command reads
 * Message → ChannelThreadMapping → CommunicationChannel and, on the patched
 * path, the outbound MessageChannelLink. No adapter/queue is resolved on that
 * path. The patched copy is built in a temp mirror by the real patch script; its
 * relative deps are tiny stubs/re-exports, and the event emitter records into a
 * global so the test can assert the persistent failure event.
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

jest.mock('@open-mercato/core/modules/communication_channels/lib/thread-token', () => ({
  getOrCreateThreadToken: jest.fn(async () => ({ token: 'om_test' })),
  buildBodyFooter: () => ({ html: '', plain: '' }),
  buildReferencesId: () => '<om_test@open-mercato.invalid>',
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

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const MESSAGE_ID = '44444444-4444-4444-8444-444444444444'
const THREAD_ID = '55555555-5555-4555-8555-555555555555'
const CHANNEL_ID = '66666666-6666-4666-8666-666666666666'
const CONVERSATION_ID = '77777777-7777-4777-8777-777777777777'
const LINK_ID = '88888888-8888-4888-8888-888888888888'
const MAPPING_ID = '99999999-9999-4999-8999-999999999999'

type State = {
  message: Record<string, unknown>
  mapping: Record<string, unknown>
  channel: Record<string, unknown> | null
  link: Record<string, unknown> | null
}

function scenario(linkStatus = 'queued', channelPresent = true): State {
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
    channel: channelPresent
      ? {
          id: CHANNEL_ID,
          providerKey: 'whatsapp-business',
          channelType: 'whatsapp',
          isActive: false,
          userId: null,
          tenantId: TENANT,
          organizationId: ORG,
        }
      : null,
    link: {
      id: LINK_ID,
      messageId: MESSAGE_ID,
      direction: 'outbound',
      deliveryStatus: linkStatus,
      providerKey: 'whatsapp-business',
      channelType: 'whatsapp',
      channelMetadata: {},
      tenantId: TENANT,
      organizationId: ORG,
    },
  }
}

function createFakeEm(state: State) {
  const flush = jest.fn(async () => undefined)
  const findOne = jest.fn(async (entity: unknown, where: Record<string, unknown>) => {
    const name = (entity as { name?: string })?.name
    if (name === 'Message') return state.message
    if (name === 'ChannelThreadMapping') return state.mapping
    if (name === 'CommunicationChannel') return state.channel
    if (name === 'MessageChannelLink') {
      if (where?.direction === 'outbound' && where.messageId === state.message.id) return state.link
      return null
    }
    return null
  })
  return { findOne, flush }
}

function createContainer(em: ReturnType<typeof createFakeEm>) {
  const adapterGet = jest.fn(() => ({
    providerKey: 'whatsapp-business',
    channelType: 'whatsapp',
    capabilities: { recipientFormat: 'provider-native', threading: true },
  }))
  return {
    container: {
      resolve: (name: string) => {
        if (name === 'em') return { fork: () => em }
        if (name === 'channelAdapterRegistry') return { get: adapterGet }
        throw new Error(`unexpected resolve: ${name}`)
      },
    },
    adapterGet,
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

const eventLog: unknown[][] = []
;(globalThis as Record<string, unknown>).__P6_DELIVERY_EVENTS__ = eventLog

function buildPatchedCommand(): string {
  const repoRoot = process.cwd()
  const scriptPath = path.join(repoRoot, 'scripts/patches/apply-outbound-inactive-channel-failed.mjs')
  const tempRoot = path.join(repoRoot, '.tmp', `p6inactive-${randomUUID()}`)
  fs.mkdirSync(path.join(repoRoot, '.tmp'), { recursive: true })

  const communicationRoot = path.join(
    tempRoot,
    'node_modules/@open-mercato/core/dist/modules/communication_channels',
  )
  const distRoot = path.join(
    repoRoot,
    'node_modules/@open-mercato/core/dist/modules/communication_channels',
  )
  fs.mkdirSync(path.join(communicationRoot, 'commands'), { recursive: true })
  fs.mkdirSync(path.join(communicationRoot, 'lib'), { recursive: true })
  fs.mkdirSync(path.join(communicationRoot, 'data'), { recursive: true })
  fs.mkdirSync(path.join(tempRoot, 'node_modules/@open-mercato/core/dist/modules/messages/data'), {
    recursive: true,
  })

  fs.copyFileSync(
    path.join(distRoot, 'commands/deliver-outbound-message.js'),
    path.join(communicationRoot, 'commands/deliver-outbound-message.js'),
  )

  const entityReexport = (relative: string) =>
    `export * from ${JSON.stringify(pathToFileUrl(path.join(distRoot, relative)))};\n`
  fs.writeFileSync(path.join(communicationRoot, 'data/entities.js'), entityReexport('data/entities.js'))
  fs.writeFileSync(
    path.join(tempRoot, 'node_modules/@open-mercato/core/dist/modules/messages/data/entities.js'),
    `export * from ${JSON.stringify(
      pathToFileUrl(path.join(repoRoot, 'node_modules/@open-mercato/core/dist/modules/messages/data/entities.js')),
    )};\n`,
  )

  fs.writeFileSync(
    path.join(communicationRoot, 'events.js'),
    'export async function emitCommunicationChannelsEvent(...args) {\n' +
      '  globalThis.__P6_DELIVERY_EVENTS__.push(args);\n' +
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

  execFileSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, OM_PATCH_REPO_ROOT: tempRoot },
  })

  return path.join(communicationRoot, 'commands/deliver-outbound-message.js')
}

function pathToFileUrl(absolutePath: string): string {
  return pathToFileURL(absolutePath).href
}

function loadCommand(absolutePath: string): {
  execute: (input: unknown, ctx: unknown) => Promise<Record<string, unknown>>
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require(absolutePath) as {
    default: { execute: (input: unknown, ctx: unknown) => Promise<Record<string, unknown>> }
  }).default
}

describe('outbound-inactive-channel-failed runtime', () => {
  beforeEach(() => {
    eventLog.length = 0
    jest.clearAllMocks()
  })

  it('patched: marks the queued link failed, emits, returns failed, never resolves the adapter', async () => {
    const patchedPath = buildPatchedCommand()
    expect(fs.readFileSync(patchedPath, 'utf8')).toContain('/* [patched:outbound-inactive-channel-failed] */')
    const deliver = loadCommand(patchedPath)
    const state = scenario('queued', true)
    const em = createFakeEm(state)
    const { container, adapterGet } = createContainer(em)

    const result = await deliver.execute(input, commandCtx(container))

    expect(result).toMatchObject({
      status: 'failed',
      error: 'channel_inactive',
      transient: false,
      channelLinkId: LINK_ID,
    })
    expect(state.link?.deliveryStatus).toBe('failed')
    expect(state.link?.channelMetadata).toMatchObject({ lastError: 'channel_inactive', transient: false })
    expect(em.flush).toHaveBeenCalled()
    expect(adapterGet).not.toHaveBeenCalled()
    expect(eventLog).toHaveLength(1)
    expect(eventLog[0][0]).toBe('communication_channels.message.delivery_failed')
    expect(eventLog[0][1]).toMatchObject({
      messageId: MESSAGE_ID,
      channelLinkId: LINK_ID,
      error: 'channel_inactive',
      transient: false,
      providerKey: 'whatsapp-business',
    })
  })

  it('patched: a missing channel marks channel_missing', async () => {
    const deliver = loadCommand(buildPatchedCommand())
    const state = scenario('pending', false)
    const em = createFakeEm(state)
    const { container } = createContainer(em)

    const result = await deliver.execute(input, commandCtx(container))

    expect(result).toMatchObject({ status: 'failed', error: 'channel_missing', transient: false })
    expect(state.link?.deliveryStatus).toBe('failed')
    expect(state.link?.channelMetadata).toMatchObject({ lastError: 'channel_missing' })
  })

  it('patched: no outbound link keeps the original throw', async () => {
    const deliver = loadCommand(buildPatchedCommand())
    const state = scenario('queued', true)
    state.link = null
    const em = createFakeEm(state)
    const { container } = createContainer(em)

    await expect(deliver.execute(input, commandCtx(container))).rejects.toThrow(/inactive/)
    expect(em.flush).not.toHaveBeenCalled()
    expect(eventLog).toHaveLength(0)
  })

  it('the installed module behaves according to its own patch state (no stale pristine control)', async () => {
    // This case used to hard-code the PRISTINE baseline ("throws, link stays
    // queued"). That baseline no longer exists once the managed patch is applied
    // to the install, which is what production ships, so the assertion is now
    // tied to the artifact actually present: a marker/behavior mismatch (half an
    // applied patch) is what this case is here to catch.
    const installedPath = path.join(
      process.cwd(),
      'node_modules/@open-mercato/core/dist/modules/communication_channels/commands/deliver-outbound-message.js',
    )
    const installedPatched = fs
      .readFileSync(installedPath, 'utf8')
      .includes('/* [patched:outbound-inactive-channel-failed] */')
    const deliver = loadCommand(installedPath)
    const state = scenario('queued', true)
    const em = createFakeEm(state)
    const { container } = createContainer(em)

    if (installedPatched) {
      await expect(deliver.execute(input, commandCtx(container))).resolves.toMatchObject({
        status: 'failed',
        error: 'channel_inactive',
        transient: false,
      })
      expect(state.link?.deliveryStatus).toBe('failed')
      // The installed artifact emits through the real event bus, which is absent
      // under jest; the persistent-event wiring itself is proven by the patched
      // temp-mirror case above, which records into a stub.
    } else {
      // Pristine install: the original behavior the patch replaces.
      await expect(deliver.execute(input, commandCtx(container))).rejects.toThrow(/inactive/)
      expect(state.link?.deliveryStatus).toBe('queued')
      expect(eventLog).toHaveLength(0)
    }
  })
})
