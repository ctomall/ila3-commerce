#!/usr/bin/env node
/**
 * Real-Postgres runner for the outbound mapping / tenant-shared fixes.
 *
 * Spawned by `outbound-mapping-realdb.test.ts`; requires `P6_REALDB_URL`.
 * The shared install is never modified: every module is loaded from a temp
 * mirror under `.tmp/`, patched by the real managed patch scripts.
 *
 * Scenarios:
 *   A. control: UNPATCHED sendAsUser, actor org O, inbound conversation/link/
 *      mapping org NULL → splits into a second `outbound:<threadId>` conversation.
 *   B. v2 PATCHED sendAsUser, same seed, run TWICE with parentMessageId:
 *      exactly 1 conversation, 1 mapping updated in place (stale ref healed),
 *      both outbound links point at the seeded conversation, no unique violation.
 *   C. connect-channel visibility: UNPATCHED createConnectedChannelRow leaves a
 *      tenant-scoped channel `private`; PATCHED (tenant-channel-shared) creates
 *      it `shared` with user_id NULL.
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
    externalConversationKey: `wa-${randomUUID()}`,
  }
}

function fileUrl(target) {
  return pathToFileURL(target).href
}

function mirrorRoot(prefix) {
  const tempRoot = path.join(repoRoot, '.tmp', `${prefix}-${randomUUID()}`)
  tempRoots.push(tempRoot)
  fs.mkdirSync(path.join(repoRoot, '.tmp'), { recursive: true })
  const communicationRoot = path.join(
    tempRoot,
    'node_modules/@open-mercato/core/dist/modules/communication_channels',
  )
  const distRoot = path.join(
    repoRoot,
    'node_modules/@open-mercato/core/dist/modules/communication_channels',
  )
  fs.mkdirSync(path.join(communicationRoot, 'lib'), { recursive: true })
  fs.mkdirSync(path.join(communicationRoot, 'data'), { recursive: true })
  fs.mkdirSync(path.join(tempRoot, 'node_modules/@open-mercato/core/dist/modules/messages/data'), {
    recursive: true,
  })
  fs.writeFileSync(
    path.join(communicationRoot, 'data/entities.js'),
    `export * from ${JSON.stringify(fileUrl(path.join(distRoot, 'data/entities.js')))};\n`,
  )
  fs.writeFileSync(
    path.join(tempRoot, 'node_modules/@open-mercato/core/dist/modules/messages/data/entities.js'),
    `export * from ${JSON.stringify(
      fileUrl(path.join(repoRoot, 'node_modules/@open-mercato/core/dist/modules/messages/data/entities.js')),
    )};\n`,
  )
  return { tempRoot, communicationRoot, distRoot }
}

function buildSendAsUserMirror({ patched }) {
  const { tempRoot, communicationRoot, distRoot } = mirrorRoot('p6map-send')
  for (const relative of ['lib/send-as-user.js', 'lib/mutation-guards.js', 'lib/outbound-recipient.js']) {
    fs.copyFileSync(path.join(distRoot, relative), path.join(communicationRoot, relative))
  }
  fs.writeFileSync(
    path.join(communicationRoot, 'lib/queue.js'),
    'export const COMMUNICATION_CHANNELS_QUEUES = { outbound: "cc-outbound" };\n' +
      'export function getCommunicationChannelsQueue() { return { enqueue: async () => undefined }; }\n',
  )
  fs.writeFileSync(
    path.join(communicationRoot, 'lib/email-mime.js'),
    'export function htmlToText(html) { return String(html ?? ""); }\n',
  )
  const target = path.join(communicationRoot, 'lib/send-as-user.js')
  if (patched) {
    execFileSync(process.execPath, [path.join(repoRoot, 'scripts/patches/apply-outbound-thread-reuse-v2.mjs')], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, OM_PATCH_REPO_ROOT: tempRoot },
    })
    assert.ok(fs.readFileSync(target, 'utf8').includes('/* [patched:outbound-thread-reuse-v2] */'))
  } else {
    assert.ok(!fs.readFileSync(target, 'utf8').includes('patched:outbound-thread-reuse-v2'))
  }
  return target
}

function buildConnectMirror({ patched }) {
  const { tempRoot, communicationRoot, distRoot } = mirrorRoot('p6map-connect')
  for (const relative of ['lib/connect-channel.js', 'lib/pg-errors.js']) {
    fs.copyFileSync(path.join(distRoot, relative), path.join(communicationRoot, relative))
  }
  const target = path.join(communicationRoot, 'lib/connect-channel.js')
  if (patched) {
    execFileSync(process.execPath, [path.join(repoRoot, 'scripts/patches/apply-tenant-channel-shared.mjs')], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, OM_PATCH_REPO_ROOT: tempRoot },
    })
    assert.ok(fs.readFileSync(target, 'utf8').includes('/* [patched:tenant-channel-shared] */'))
  } else {
    assert.ok(!fs.readFileSync(target, 'utf8').includes('patched:tenant-channel-shared'))
  }
  return target
}

async function load(absolutePath) {
  return import(fileUrl(absolutePath))
}

async function seed(ids, { channelVisibility = 'shared' } = {}) {
  const connection = orm.em.fork().getConnection()
  await connection.execute(
    `insert into communication_channels
       (id, provider_key, channel_type, display_name, user_id, tenant_id, organization_id,
        is_active, is_primary, status, visibility, created_at, updated_at)
     values (?, 'whatsapp-business', 'whatsapp', 'P6 WABA', null, ?, ?, true, false, 'connected', ?, now(), now())`,
    [ids.channelId, TENANT, ORG, channelVisibility],
  )
  await connection.execute(
    `insert into messages
       (id, type, thread_id, sender_user_id, subject, body, body_format, priority, status,
        is_draft, sent_at, tenant_id, organization_id, created_at, updated_at)
     values (?, 'channel.whatsapp-business', ?, ?, 'Inbound thread', 'inbound body', 'text',
             'normal', 'sent', false, now(), ?, null, now(), now())`,
    [ids.parentMessageId, ids.threadId, ACTOR, TENANT],
  )
  // Inbound conversation / link / mapping deliberately carry organization_id NULL
  // while the channel and the sending actor have org O.
  await connection.execute(
    `insert into external_conversations
       (id, channel_id, external_conversation_id, subject, assigned_user_id, last_message_at,
        tenant_id, organization_id, created_at, updated_at)
     values (?, ?, ?, 'Inbound thread', ?, now(), ?, null, now(), now())`,
    [ids.conversationId, ids.channelId, ids.externalConversationKey, ACTOR, TENANT],
  )
  await connection.execute(
    `insert into message_channel_links
       (id, message_id, external_conversation_id, provider_key, channel_type, direction,
        delivery_status, channel_payload, channel_metadata, tenant_id, organization_id, created_at)
     values (?, ?, ?, 'whatsapp-business', 'whatsapp', 'inbound', 'received', '{}', '{}', ?, null, now())`,
    [ids.parentLinkId, ids.parentMessageId, ids.conversationId, TENANT],
  )
  await connection.execute(
    `insert into channel_thread_mappings
       (id, external_conversation_id, message_thread_id, channel_id, provider_key,
        external_thread_ref, assigned_user_id, tenant_id, organization_id, created_at, updated_at)
     values (?, ?, ?, ?, 'whatsapp-business', 'stale:ref', ?, ?, null, now(), now())`,
    [ids.mappingId, ids.conversationId, ids.threadId, ids.channelId, ACTOR, TENANT],
  )
}

function containerFor(ids, composeCalls) {
  const adapter = {
    providerKey: 'whatsapp-business',
    channelType: 'whatsapp',
    capabilities: { recipientFormat: 'provider-native', threading: true },
  }
  return {
    resolve: (name) => {
      if (name === 'em') return { fork: () => orm.em.fork() }
      if (name === 'commandBus') {
        return {
          execute: async () => {
            composeCalls.push(1)
            return { result: { id: randomUUID(), threadId: ids.threadId } }
          },
        }
      }
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

async function conversations(channelId) {
  return rows(
    `select id, external_conversation_id, organization_id from external_conversations where channel_id = ? order by created_at`,
    [channelId],
  )
}

async function mappings(channelId) {
  return rows(
    `select id, external_conversation_id, message_thread_id, external_thread_ref, organization_id
       from channel_thread_mappings where channel_id = ? order by created_at`,
    [channelId],
  )
}

async function outboundLinks(channelId, conversationId) {
  return rows(
    `select id, message_id, external_conversation_id, direction from message_channel_links
      where direction = 'outbound' and external_conversation_id = ? order by created_at`,
    [conversationId],
  )
}

async function scenarioControl(sendAsUser, ids) {
  const composeCalls = []
  const result = await sendAsUser(containerFor(ids, composeCalls), actor, inputFor(ids))
  assert.equal(result.ok, true)
  const convs = await conversations(ids.channelId)
  const maps = await mappings(ids.channelId)
  assert.equal(convs.length, 2)
  assert.equal(maps.length, 2)
  const created = convs.find((row) => row.id !== ids.conversationId)
  assert.ok(created)
  assert.equal(created.external_conversation_id, `outbound:${ids.threadId}`)
  return {
    conversationCount: convs.length,
    mappingCount: maps.length,
    createdConversationKey: created.external_conversation_id,
  }
}

async function runPatchedOnce(sendAsUser, ids, composeCalls) {
  const result = await sendAsUser(containerFor(ids, composeCalls), actor, inputFor(ids))
  assert.equal(result.ok, true)
}

async function scenarioPatched(sendAsUser, ids) {
  const composeCalls = []
  await runPatchedOnce(sendAsUser, ids, composeCalls)
  const first = {
    conversations: await conversations(ids.channelId),
    mappings: await mappings(ids.channelId),
    links: await outboundLinks(ids.channelId, ids.conversationId),
  }
  assert.equal(first.conversations.length, 1)
  assert.equal(first.conversations[0].id, ids.conversationId)
  assert.equal(first.mappings.length, 1)
  assert.equal(first.mappings[0].external_thread_ref, ids.externalConversationKey)
  assert.equal(first.mappings[0].message_thread_id, ids.threadId)
  assert.equal(first.mappings[0].organization_id, null)
  assert.equal(first.links.length, 1)
  assert.equal(first.links[0].external_conversation_id, ids.conversationId)

  // Second reply on the same inbound message: must not throw, and must not
  // create another conversation/mapping.
  await runPatchedOnce(sendAsUser, ids, composeCalls)
  const second = {
    conversations: await conversations(ids.channelId),
    mappings: await mappings(ids.channelId),
    links: await outboundLinks(ids.channelId, ids.conversationId),
  }
  assert.equal(second.conversations.length, 1)
  assert.equal(second.mappings.length, 1)
  assert.equal(second.mappings[0].external_thread_ref, ids.externalConversationKey)
  assert.equal(second.links.length, 2)
  assert.ok(second.links.every((row) => row.external_conversation_id === ids.conversationId))

  return {
    firstRun: {
      conversationCount: first.conversations.length,
      mappingCount: first.mappings.length,
      mappingRef: first.mappings[0].external_thread_ref,
      outboundLinks: first.links.length,
    },
    secondRun: {
      conversationCount: second.conversations.length,
      mappingCount: second.mappings.length,
      mappingRef: second.mappings[0].external_thread_ref,
      outboundLinks: second.links.length,
      allOutboundPointAtInbound: true,
      threw: false,
    },
    composeCalls: composeCalls.length,
  }
}

async function connectVisibility(createConnectedChannelRow, displayName) {
  const created = await createConnectedChannelRow({
    em: orm.em.fork(),
    adapter: {
      channelType: 'whatsapp',
      channelScope: 'tenant',
      capabilities: { realtimePush: true },
    },
    providerKey: 'whatsapp-business',
    displayName,
    externalIdentifier: null,
    credentialsRefId: randomUUID(),
    userId: null,
    scope: { tenantId: TENANT, organizationId: ORG },
  })
  const found = await rows(
    `select visibility, user_id from communication_channels where id = ?`,
    [created.id],
  )
  return { id: created.id, visibility: found[0]?.visibility, userId: found[0]?.user_id }
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

  const unpatchedSendAsUser = (await load(buildSendAsUserMirror({ patched: false }))).sendAsUser
  const patchedSendAsUser = (await load(buildSendAsUserMirror({ patched: true }))).sendAsUser
  const unpatchedConnect = (await load(buildConnectMirror({ patched: false }))).createConnectedChannelRow
  const patchedConnect = (await load(buildConnectMirror({ patched: true }))).createConnectedChannelRow

  const controlIds = newIds()
  await seed(controlIds)
  const A = await scenarioControl(unpatchedSendAsUser, controlIds)

  const patchedIds = newIds()
  await seed(patchedIds)
  const B = await scenarioPatched(patchedSendAsUser, patchedIds)

  const unpatchedChannel = await connectVisibility(unpatchedConnect, 'P6 control tenant channel')
  const patchedChannel = await connectVisibility(patchedConnect, 'P6 patched tenant channel')
  assert.equal(unpatchedChannel.visibility, 'private')
  assert.equal(patchedChannel.visibility, 'shared')
  assert.equal(patchedChannel.userId, null)

  console.log(
    `@@P6_MAPPING_RESULT@@${JSON.stringify({
      ok: true,
      A,
      B,
      C: { unpatched: unpatchedChannel, patched: patchedChannel },
    })}`,
  )
} catch (error) {
  console.error(`@@P6_MAPPING_ERROR@@${error?.stack ?? String(error)}`)
  process.exitCode = 1
} finally {
  if (orm) await orm.close(true)
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
}
