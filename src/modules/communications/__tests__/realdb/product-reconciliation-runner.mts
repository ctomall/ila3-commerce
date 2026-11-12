/**
 * Real-Postgres runner for the product reconciliation path (S94).
 *
 * The unit tests drive a fake EM, which proves control flow but not the SQL. This
 * runner executes `recordReconciliation` / `listUnknownLinks` against a throwaway
 * database through a REAL MikroORM EntityManager, so a wrong column, a jsonb write
 * that drops sibling keys, or a broken NULL-inclusive organization scope fails
 * here instead of during a live reconciliation.
 *
 * It is launched by `product-reconciliation-realdb.test.ts` through `tsx` (Jest's
 * CommonJS transform cannot load the ESM MikroORM packages), and skipped there
 * unless P6_REALDB_URL points at a disposable database.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { MikroORM } from '@mikro-orm/postgresql'
import { MessageChannelLink } from '@open-mercato/core/modules/communication_channels/data/entities'
import { listUnknownLinks, recordReconciliation } from '../../lib/unknown-reconciliation'

const url = process.env.P6_REALDB_URL
assert.ok(url, 'P6_REALDB_URL is required')

const orm = await MikroORM.init({ clientUrl: url, entities: [MessageChannelLink], debug: false })
// The database is disposable and empty, so create the schema outright; v6 moved
// these helpers onto `orm.schema`, and `createSchema` exists on every version we
// run here.
const schema = orm.schema as unknown as {
  create: (options?: { wrap?: boolean }) => Promise<unknown>
}
try {
  await schema.create({ wrap: false })
} catch (error) {
  // Re-runs hit an existing table; that is fine, the suite owns the rows.
  if ((error as { code?: string }).code !== '42P07') throw error
}

const tenantId = randomUUID()
const organizationId = randomUUID()
const otherOrgId = randomUUID()

function em() {
  return orm.em.fork()
}

async function clean() {
  await em().nativeDelete(MessageChannelLink, {})
}

async function seedLink(
  options: {
    status?: string
    organization?: string | null
    metadata?: Record<string, unknown>
    direction?: 'inbound' | 'outbound'
  } = {},
): Promise<MessageChannelLink> {
  const manager = em()
  const link = manager.create(MessageChannelLink, {
    messageId: randomUUID(),
    externalConversationId: randomUUID(),
    providerKey: 'whatsapp-business',
    channelType: 'whatsapp',
    direction: options.direction ?? 'outbound',
    deliveryStatus: options.status ?? 'unknown',
    channelMetadata: options.metadata ?? { lastAttemptAt: '2026-11-12T09:00:00Z' },
    tenantId,
    organizationId: options.organization === undefined ? organizationId : options.organization,
    createdAt: new Date('2026-11-12T09:00:00Z'),
  } as never)
  // MikroORM 6 dropped `persistAndFlush`; persist + flush is the same contract.
  manager.persist(link)
  await manager.flush()
  return link
}

try {
  // 1) append keeps delivery_status unknown and preserves sibling metadata keys
  await clean()
  const seeded = await seedLink()
  await recordReconciliation(em(), {
    tenantId,
    organizationId,
    linkId: seeded.id,
    outcome: 'confirmed-sent',
    note: '平台后台能查到该消息，按已发送处理',
    operatorUserId: randomUUID(),
  })
  const reader = em()
  reader.clear()
  const reloaded = await reader.findOne(MessageChannelLink, { id: seeded.id } as never)
  assert.equal(reloaded?.deliveryStatus, 'unknown', 'delivery_status must not change')
  const metadata = (reloaded?.channelMetadata ?? {}) as Record<string, unknown>
  const record = metadata.reconciliation as Record<string, unknown>
  assert.equal(record.outcome, 'confirmed-sent')
  assert.equal(record.note, '平台后台能查到该消息，按已发送处理')
  assert.equal(metadata.lastAttemptAt, '2026-11-12T09:00:00Z', 'sibling metadata must survive')
  console.log('PASS append keeps delivery_status unknown and preserves sibling metadata')

  // 2) a second verdict is refused from the real row
  await assert.rejects(
    recordReconciliation(em(), {
      tenantId,
      organizationId,
      linkId: seeded.id,
      outcome: 'confirmed-not-sent',
      note: '平台查无此消息，按未发送处理',
      operatorUserId: randomUUID(),
    }),
    (error: { code?: string }) => error.code === 'RECONCILIATION_ALREADY_RECORDED',
  )
  console.log('PASS a second verdict is refused')

  // 3) a delivered link is refused before any write
  const delivered = await seedLink({ status: 'delivered' })
  await assert.rejects(
    recordReconciliation(em(), {
      tenantId,
      organizationId,
      linkId: delivered.id,
      outcome: 'confirmed-sent',
      note: '平台后台能查到该消息',
      operatorUserId: randomUUID(),
    }),
    (error: { code?: string }) => error.code === 'RECONCILIATION_NOT_UNKNOWN',
  )
  console.log('PASS a non-unknown link is refused')

  // 4) listing filters on unknown/direction AND the NULL-inclusive org scope
  await clean()
  const ownOrg = await seedLink()
  const tenantWide = await seedLink({ organization: null })
  const foreign = await seedLink({ organization: otherOrgId })
  const reconciled = await seedLink({
    metadata: {
      reconciliation: { outcome: 'confirmed-sent', note: 'already handled', operatorUserId: randomUUID(), at: '2026-11-12T10:00:00Z' },
    },
  })
  const inbound = await seedLink({ status: 'unknown', direction: 'inbound' })

  const rows = await listUnknownLinks(em(), { tenantId, organizationId })
  const ids = rows.map((row) => row.id)
  assert.ok(ids.includes(ownOrg.id), 'own org row must be listed')
  assert.ok(ids.includes(tenantWide.id), 'tenant-wide (NULL org) row must be listed')
  assert.ok(!ids.includes(foreign.id), 'another organization row must not be listed')
  assert.ok(!ids.includes(reconciled.id), 'already reconciled row must not be listed')
  assert.ok(!ids.includes(inbound.id), 'inbound rows must not be listed')
  console.log('PASS listing filters unknown + outbound + NULL-inclusive organization scope')
} finally {
  await clean().catch(() => undefined)
  await orm.close(true)
}

console.log('product reconciliation realdb: all scenarios passed')
