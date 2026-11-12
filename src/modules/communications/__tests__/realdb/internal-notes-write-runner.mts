/**
 * Real-Postgres runner for the internal-note WRITE path (S99 / design rev2 F3-06).
 *
 * S96 proved the read query and the compose *input contract*. This runner closes
 * the loop by executing the actual installed `messages.messages.compose` command
 * through a minimal container (only `em`) against a real database:
 *
 *   buildInternalNoteInput -> compose command -> messages.message row -> listInternalNotes
 *
 * Absent services (event bus) only log a warning in the hub code, so their absence
 * is exactly what a minimal harness can exercise.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { MikroORM } from '@mikro-orm/postgresql'
import { Message, MessageRecipient } from '@open-mercato/core/modules/messages/data/entities'
import { commandRegistry } from '@open-mercato/shared/lib/commands/registry'
import { CONVERSATION_SOURCE, buildInternalNoteInput, listInternalNotes } from '../../lib/internal-notes'

const url = process.env.P6_REALDB_URL
assert.ok(url, 'P6_REALDB_URL is required')

const orm = await MikroORM.init({ clientUrl: url, entities: [Message, MessageRecipient], debug: false })
try {
  await orm.schema.create({ wrap: false })
} catch (error) {
  if ((error as { code?: string }).code !== '42P07') throw error
}

// Registers `messages.messages.compose` in the process-level command registry.
await import('@open-mercato/core/modules/messages/commands/messages')
const compose = commandRegistry.get('messages.messages.compose')
assert.ok(compose, 'messages.messages.compose must be registered')

const tenantId = randomUUID()
const organizationId = randomUUID()
const authorId = randomUUID()
const conversationId = randomUUID()

const container = {
  resolve: (name: string) => {
    if (name === 'em') return orm.em
    // Everything else is absent on purpose: the hub tolerates a missing event bus
    // (it logs), and anything that genuinely needs a service should fail loudly.
    throw new Error(`unexpected resolve ${name}`)
  },
}

type ComposeResult = { id: string; threadId: string | null }

async function composeNote(input: Record<string, unknown>): Promise<ComposeResult> {
  return (await compose!.execute(input, {
    container,
    auth: null,
    organizationScope: null,
    selectedOrganizationId: organizationId,
    organizationIds: [organizationId],
    request: new Request('http://localhost/api/communications/me/threads/x/notes'),
  })) as ComposeResult
}

function em() {
  return orm.em.fork()
}

async function clean() {
  await em().nativeDelete(MessageRecipient, {})
  await em().nativeDelete(Message, {})
}

try {
  await clean()

  // 1) a note with no parent becomes its own internal thread and is readable
  const created = await composeNote(
    buildInternalNoteInput({
      tenantId,
      organizationId,
      userId: authorId,
      conversationId,
      subject: '订单 #42',
      body: '客户情绪激动，先别报价',
    }),
  )
  assert.ok(created.id)
  const stored = await em().findOne(Message, { id: created.id } as never)
  assert.equal(stored?.visibility, 'internal')
  assert.equal(stored?.type, 'note')
  assert.equal(stored?.isDraft, false)
  assert.equal(stored?.sourceEntityType, CONVERSATION_SOURCE)
  assert.equal(stored?.sourceEntityId, conversationId)
  assert.equal(stored?.senderUserId, authorId)
  assert.equal(stored?.sendViaEmail, false)
  assert.equal(stored?.threadId, created.id, 'a root note anchors its own thread')
  console.log('PASS compose creates an internal note row with no delivery flags')

  const recipients = await em().find(MessageRecipient, { messageId: created.id } as never)
  assert.equal(recipients.length, 1)
  assert.equal(recipients[0].recipientUserId, authorId)
  assert.equal(recipients[0].status, 'unread')
  console.log('PASS the note is addressed to its author')

  // 2) reading through the app query returns exactly that note
  const listed = await listInternalNotes(em(), { tenantId, organizationId, conversationId })
  assert.deepEqual(listed.map((note) => note.id), [created.id])
  assert.equal(listed[0].body, '客户情绪激动，先别报价')
  assert.equal(listed[0].authorUserId, authorId)
  console.log('PASS the composed note is returned by the app read path')

  // 3) a note replying to an existing message inherits that message's thread
  const root = await composeNote(
    buildInternalNoteInput({
      tenantId,
      organizationId,
      userId: authorId,
      conversationId,
      subject: '订单 #42',
      body: '根消息',
    }),
  )
  const reply = await composeNote(
    buildInternalNoteInput({
      tenantId,
      organizationId,
      userId: authorId,
      conversationId,
      subject: '订单 #42',
      body: '回复根消息',
      parentMessageId: root.id,
    }),
  )
  const replyRow = await em().findOne(Message, { id: reply.id } as never)
  const rootRow = await em().findOne(Message, { id: root.id } as never)
  assert.equal(replyRow?.threadId, rootRow?.threadId, 'reply must share the parent thread')
  assert.equal(replyRow?.parentMessageId, root.id)
  console.log('PASS a note with a parent inherits the parent thread')

  // 4) another conversation's notes stay out of this conversation's list
  const otherConversation = randomUUID()
  await composeNote(
    buildInternalNoteInput({
      tenantId,
      organizationId,
      userId: authorId,
      conversationId: otherConversation,
      subject: '别的会话',
      body: '不该出现在这里',
    }),
  )
  const scoped = await listInternalNotes(em(), { tenantId, organizationId, conversationId })
  assert.ok(scoped.every((note) => note.id !== undefined))
  assert.deepEqual(
    new Set(scoped.map((note) => note.body)),
    new Set(['客户情绪激动，先别报价', '根消息', '回复根消息']),
  )
  console.log('PASS another conversation stays out of the list')
} finally {
  await clean().catch(() => undefined)
  await orm.close(true)
}

console.log('internal notes write realdb: all scenarios passed')
