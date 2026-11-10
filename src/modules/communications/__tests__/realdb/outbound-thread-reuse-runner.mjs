#!/usr/bin/env node
/**
 * Real-Postgres runner for the outbound-thread-reuse differential proof.
 *
 * Spawned by `outbound-thread-reuse-realdb.test.ts`; not a Jest test itself.
 * Requires `P6_REALDB_URL` (isolated migrated database). The shared install is
 * never modified: both modules are loaded from temp mirrors under `.tmp/`.
 *
 * (A) unpatched mirror: byte-identical `send-as-user.js` from the installed dist.
 * (B) patched mirror: the same file after the real managed patch script ran.
 * Both use the real MikroORM EM against the real database; only the hub queue
 * and email-mime modules are stubbed inside the mirrors (the drill never sends).
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { MikroORM } from '@mikro-orm/postgresql'
import {
  ChannelThreadMapping,
  CommunicationChannel,
  ExternalConversation,
  ExternalMessage,
  MessageChannelLink,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import { Message } from '@open-mercato/core/modules/messages/data/entities'

const clientUrl = process.env.P6_REALDB_URL
assert.ok(clientUrl, 'P6_REALDB_URL is required')

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const ACTOR = '33333333-3333-4333-8333-333333333333'
const MARKER = '/* [patched:outbound-thread-reuse] */'
const repoRoot = process.cwd()
const tempRoots = []
let orm

function newIds() {
  return {
    channelId: randomUUID(),
    conversationId: randomUUID(),
    parentMessageId: randomUUID(),
    parentLinkId: randomUUID(),
    mappingId: randomUUID(),
    threadId: randomUUID(),
    newMessageId: randomUUID(),
    externalConversationKey: `wa-${randomUUID()}`,
  }
}

function buildMirror({ patched }) {
  const tempRoot = path.join(repoRoot, '.tmp', `p6db-${randomUUID()}`)
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
  for (const relative of ['lib/send-as-user.js', 'lib/mutation-guards.js', 'lib/outbound-recipient.js']) {
    fs.copyFileSync(path.join(distRoot, relative), path.join(communicationRoot, relative))
  }
  // Re-export the REAL entity classes so the real MikroORM metadata (registered
  // by the runner) recognizes them. The only behavior file under test is
  // send-as-user.js; entity modules must stay the installed instances.
  fs.writeFileSync(
    path.join(communicationRoot, 'data/entities.js'),
    `export * from ${JSON.stringify(pathToFileURL(path.join(distRoot, 'data/entities.js')).href)};\n`,
  )
  fs.writeFileSync(
    path.join(communicationRoot, 'lib/queue.js'),
    'export const COMMUNICATION_CHANNELS_QUEUES = { outbound: "cc-outbound" };\n' +
      'export function getCommunicationChannelsQueue() { return { enqueue: async () => undefined }; }\n',
  )
  fs.writeFileSync(
    path.join(communicationRoot, 'lib/email-mime.js'),
    'export function htmlToText(html) { return String(html ?? ""); }\n',
  )

  const sendAsUserPath = path.join(communicationRoot, 'lib/send-as-user.js')
  if (patched) {
    execFileSync(process.execPath, [path.join(repoRoot, 'scripts/patches/apply-outbound-thread-reuse.mjs')], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, OM_PATCH_REPO_ROOT: tempRoot },
    })
    assert.ok(fs.readFileSync(sendAsUserPath, 'utf8').includes(MARKER), 'patched mirror is marked')
  } else {
    assert.ok(!fs.readFileSync(sendAsUserPath, 'utf8').includes(MARKER), 'unpatched mirror has no marker')
  }
  return sendAsUserPath
}

async function loadSendAsUser(absolutePath) {
  const url = pathToFileURL(absolutePath).href
  const mod = await import(url)
  return mod.sendAsUser
}

async function seed(ids) {
  const connection = orm.em.fork().getConnection()
  await connection.execute(
    `insert into communication_channels
       (id, provider_key, channel_type, display_name, user_id, tenant_id, organization_id,
        is_active, is_primary, status, visibility, created_at, updated_at)
     values (?, 'whatsapp-business', 'whatsapp', 'P6 WABA', ?, ?, ?, true, false, 'connected', 'private', now(), now())`,
    [ids.channelId, ACTOR, TENANT, ORG],
  )
  await connection.execute(
    `insert into messages
       (id, type, thread_id, sender_user_id, subject, body, body_format, priority, status,
        is_draft, sent_at, tenant_id, organization_id, created_at, updated_at)
     values (?, 'channel.whatsapp-business', ?, ?, 'Inbound thread', 'inbound body', 'text',
             'normal', 'sent', false, now(), ?, ?, now(), now())`,
    [ids.parentMessageId, ids.threadId, ACTOR, TENANT, ORG],
  )
  await connection.execute(
    `insert into external_conversations
       (id, channel_id, external_conversation_id, subject, assigned_user_id, last_message_at,
        tenant_id, organization_id, created_at, updated_at)
     values (?, ?, ?, 'Inbound thread', ?, now(), ?, ?, now(), now())`,
    [ids.conversationId, ids.channelId, ids.externalConversationKey, ACTOR, TENANT, ORG],
  )
  await connection.execute(
    `insert into message_channel_links
       (id, message_id, external_conversation_id, provider_key, channel_type, direction,
        delivery_status, channel_payload, channel_metadata, tenant_id, organization_id, created_at)
     values (?, ?, ?, 'whatsapp-business', 'whatsapp', 'inbound', 'received', '{}', '{}', ?, ?, now())`,
    [ids.parentLinkId, ids.parentMessageId, ids.conversationId, TENANT, ORG],
  )
  await connection.execute(
    `insert into channel_thread_mappings
       (id, external_conversation_id, message_thread_id, channel_id, provider_key,
        external_thread_ref, assigned_user_id, tenant_id, organization_id, created_at, updated_at)
     values (?, ?, ?, ?, 'whatsapp-business', ?, ?, ?, ?, now(), now())`,
    [ids.mappingId, ids.conversationId, ids.threadId, ids.channelId, ids.externalConversationKey, ACTOR, TENANT, ORG],
  )
}

function containerFor(ids) {
  const adapter = {
    providerKey: 'whatsapp-business',
    channelType: 'whatsapp',
    capabilities: { recipientFormat: 'provider-native', threading: true },
  }
  const commandBus = {
    execute: async () => ({ result: { id: ids.newMessageId, threadId: ids.threadId } }),
  }
  return {
    resolve: (name) => {
      if (name === 'em') return { fork: () => orm.em.fork() }
      if (name === 'commandBus') return commandBus
      if (name === 'channelAdapterRegistry') return { get: () => adapter }
      throw new Error(`unexpected resolve: ${name}`)
    },
  }
}

const actor = { userId: ACTOR, tenantId: TENANT, organizationId: ORG }
const inputFor = (ids) => ({
  userChannelId: ids.channelId,
  to: ['15550001111'],
  subject: 'Re: inbound',
  body: { plain: 'reply body' },
  parentMessageId: ids.parentMessageId,
})

async function rows(sql, params) {
  return orm.em.fork().getConnection().execute(sql, params)
}

async function linkSnapshot(linkId) {
  const found = await rows(`select * from message_channel_links where id = ?`, [linkId])
  return found[0] ?? null
}

async function conversationRows(channelId) {
  return rows(
    `select id, external_conversation_id, subject, assigned_user_id, last_message_at
       from external_conversations where channel_id = ? order by created_at`,
    [channelId],
  )
}

async function mappingRows(channelId) {
  return rows(
    `select id, external_conversation_id, message_thread_id, external_thread_ref
       from channel_thread_mappings where channel_id = ? order by created_at`,
    [channelId],
  )
}

async function linkRows(messageIds) {
  return rows(
    `select id, message_id, external_conversation_id, direction, delivery_status
       from message_channel_links where message_id in (?, ?) order by created_at`,
    [messageIds[0], messageIds[1]],
  )
}

async function scenarioA(sendAsUser) {
  const ids = newIds()
  await seed(ids)
  const parentBefore = await linkSnapshot(ids.parentLinkId)
  const result = await sendAsUser(containerFor(ids), actor, inputFor(ids))
  assert.equal(result.ok, true)
  assert.equal(result.threadId, ids.threadId)

  const conversations = await conversationRows(ids.channelId)
  assert.equal(conversations.length, 2)
  const created = conversations.find((row) => row.id !== ids.conversationId)
  assert.ok(created, 'a second conversation exists')
  assert.equal(created.external_conversation_id, `outbound:${ids.threadId}`)

  const links = await linkRows([ids.parentMessageId, ids.newMessageId])
  assert.equal(links.length, 2)
  const outboundLink = links.find((row) => row.message_id === ids.newMessageId)
  assert.ok(outboundLink)
  assert.equal(outboundLink.external_conversation_id, created.id)
  assert.notEqual(outboundLink.external_conversation_id, ids.conversationId)

  const mappings = await mappingRows(ids.channelId)
  assert.equal(mappings.length, 2)
  assert.ok(mappings.some((row) => row.external_thread_ref === `outbound:${ids.threadId}`))

  assert.deepEqual(await linkSnapshot(ids.parentLinkId), parentBefore)

  return {
    conversationCount: conversations.length,
    threadId: ids.threadId,
    createdConversationKey: created.external_conversation_id,
    outboundLinkConversationId: outboundLink.external_conversation_id,
    parentConversationId: ids.conversationId,
    mappingCount: mappings.length,
    parentLinkUnchanged: true,
    conversations: conversations.map((row) => ({
      id: row.id,
      externalConversationId: row.external_conversation_id,
    })),
    mappings: mappings.map((row) => ({
      externalConversationId: row.external_conversation_id,
      externalThreadRef: row.external_thread_ref,
    })),
    outboundLink: {
      messageId: outboundLink.message_id,
      externalConversationId: outboundLink.external_conversation_id,
    },
  }
}

async function scenarioB(sendAsUser) {
  const ids = newIds()
  await seed(ids)
  const parentBefore = await linkSnapshot(ids.parentLinkId)
  const result = await sendAsUser(containerFor(ids), actor, inputFor(ids))
  assert.equal(result.ok, true)
  assert.equal(result.threadId, ids.threadId)

  const conversations = await conversationRows(ids.channelId)
  assert.equal(conversations.length, 1)
  assert.equal(conversations[0].id, ids.conversationId)
  assert.equal(conversations[0].external_conversation_id, ids.externalConversationKey)

  const links = await linkRows([ids.parentMessageId, ids.newMessageId])
  assert.equal(links.length, 2)
  const outboundLink = links.find((row) => row.message_id === ids.newMessageId)
  assert.ok(outboundLink)
  assert.equal(outboundLink.external_conversation_id, ids.conversationId)

  const mappings = await mappingRows(ids.channelId)
  assert.equal(mappings.length, 1)
  assert.equal(mappings[0].external_conversation_id, ids.conversationId)
  assert.equal(mappings[0].message_thread_id, ids.threadId)
  assert.equal(mappings[0].external_thread_ref, ids.externalConversationKey)

  assert.deepEqual(await linkSnapshot(ids.parentLinkId), parentBefore)

  return {
    conversationCount: conversations.length,
    threadId: ids.threadId,
    conversationKey: conversations[0].external_conversation_id,
    outboundLinkConversationId: outboundLink.external_conversation_id,
    parentConversationId: ids.conversationId,
    mappingCount: mappings.length,
    parentLinkUnchanged: true,
    conversations: conversations.map((row) => ({
      id: row.id,
      externalConversationId: row.external_conversation_id,
    })),
    mappings: mappings.map((row) => ({
      externalConversationId: row.external_conversation_id,
      externalThreadRef: row.external_thread_ref,
    })),
    outboundLink: {
      messageId: outboundLink.message_id,
      externalConversationId: outboundLink.external_conversation_id,
    },
  }
}

try {
  orm = await MikroORM.init({
    entities: [
      CommunicationChannel,
      ExternalConversation,
      ExternalMessage,
      MessageChannelLink,
      ChannelThreadMapping,
      Message,
    ],
    clientUrl,
    debug: false,
  })

  const unpatchedPath = buildMirror({ patched: false })
  const patchedPath = buildMirror({ patched: true })
  const unpatched = await loadSendAsUser(unpatchedPath)
  const patched = await loadSendAsUser(patchedPath)

  const A = await scenarioA(unpatched)
  const B = await scenarioB(patched)

  console.log(`@@P6_RESULT@@${JSON.stringify({ ok: true, A, B })}`)
} catch (error) {
  console.error(`@@P6_ERROR@@${error?.stack ?? String(error)}`)
  process.exitCode = 1
} finally {
  if (orm) await orm.close(true)
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
}
