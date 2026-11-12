/**
 * Real-Postgres runner for the internal-note READ path (S96 / design rev2 F3-06).
 *
 * The compose itself goes through the installed `messages.messages.compose`
 * command, which needs the whole messages module (container, command bus, guards,
 * events); booting that against a throwaway database is out of scope here and is
 * recorded as not covered. What IS proven here is the SQL this app owns: notes are
 * filtered by tenant, `visibility=internal`, `sourceEntityType/Id`, `deletedAt` and
 * the NULL-inclusive organization scope, in ascending creation order.
 *
 * Launched by `internal-notes-realdb.test.ts` through `tsx`; skipped without
 * P6_REALDB_URL.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { MikroORM } from '@mikro-orm/postgresql'
import { Message } from '@open-mercato/core/modules/messages/data/entities'
import { CONVERSATION_SOURCE, listInternalNotes } from '../../lib/internal-notes'

const url = process.env.P6_REALDB_URL
assert.ok(url, 'P6_REALDB_URL is required')

const orm = await MikroORM.init({ clientUrl: url, entities: [Message], debug: false })
try {
  await orm.schema.create({ wrap: false })
} catch (error) {
  if ((error as { code?: string }).code !== '42P07') throw error
}

const tenantId = randomUUID()
const organizationId = randomUUID()
const otherOrgId = randomUUID()
const conversationId = randomUUID()
const authorId = randomUUID()

function em() {
  return orm.em.fork()
}

async function clean() {
  await em().nativeDelete(Message, {})
}

async function seedNote(options: {
  conversation?: string
  visibility?: 'public' | 'internal' | null
  organization?: string | null
  deleted?: boolean
  subject?: string
  createdAt?: Date
}) {
  const manager = em()
  const note = manager.create(Message, {
    type: 'note',
    senderUserId: authorId,
    subject: options.subject ?? '订单 #42',
    body: '内部备注',
    bodyFormat: 'text',
    isDraft: false,
    visibility: options.visibility === undefined ? 'internal' : options.visibility,
    sourceEntityType: CONVERSATION_SOURCE,
    sourceEntityId: options.conversation ?? conversationId,
    tenantId,
    organizationId: options.organization === undefined ? organizationId : options.organization,
    createdAt: options.createdAt ?? new Date('2026-11-12T10:00:00Z'),
    updatedAt: new Date('2026-11-12T10:00:00Z'),
    deletedAt: options.deleted ? new Date('2026-11-12T11:00:00Z') : null,
  } as never)
  manager.persist(note)
  await manager.flush()
  return note
}

try {
  await clean()
  const first = await seedNote({ subject: '第一条', createdAt: new Date('2026-11-12T10:00:00Z') })
  const second = await seedNote({ subject: '第二条', createdAt: new Date('2026-11-12T10:01:00Z') })
  const tenantWide = await seedNote({
    subject: '租户级',
    organization: null,
    createdAt: new Date('2026-11-12T10:02:00Z'),
  })
  await seedNote({ subject: '别的组织', organization: otherOrgId })
  await seedNote({ subject: '公开消息', visibility: 'public' })
  await seedNote({ subject: '已删除', deleted: true })
  await seedNote({ subject: '别的会话', conversation: randomUUID() })

  const notes = await listInternalNotes(em(), { tenantId, organizationId, conversationId })
  const subjects = notes.map((note) => note.subject)

  assert.deepEqual(subjects, ['第一条', '第二条', '租户级'], 'only own/NULL-org internal notes of this conversation, oldest first')
  assert.deepEqual(
    notes.map((note) => note.id),
    [first.id, second.id, tenantWide.id],
  )
  assert.equal(notes[0].authorUserId, authorId)
  assert.equal(notes[0].bodyFormat, 'text')
  console.log('PASS listing filters tenant/visibility/conversation/deleted/org and keeps ascending order')

  // A caller without an organization cannot see another organization's notes.
  const unscoped = await listInternalNotes(em(), { tenantId, organizationId: null, conversationId })
  assert.deepEqual(unscoped.map((note) => note.subject), ['租户级'])
  console.log('PASS an organization-less caller sees only tenant-wide notes')
} finally {
  await clean().catch(() => undefined)
  await orm.close(true)
}

console.log('internal notes realdb: all scenarios passed')
