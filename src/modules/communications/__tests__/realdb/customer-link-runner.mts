/**
 * Real-Postgres runner for conversation access + customer link (S95 / design rev2 F4-01).
 *
 * Proves the extracted helpers against real SQL: the NULL-inclusive organization
 * scope on both channels and conversations, the personal-channel mask, the
 * `contact_person_id` write (and its idempotent no-op), the out-of-scope customer
 * refusal, and the candidate search with escaped LIKE metacharacters.
 *
 * Launched by `customer-link-realdb.test.ts` through `tsx` (Jest's CommonJS
 * transform cannot load the ESM MikroORM packages); skipped without P6_REALDB_URL.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { MikroORM } from '@mikro-orm/postgresql'
import {
  CommunicationChannel,
  ExternalConversation,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import { CustomerEntity } from '@open-mercato/core/modules/customers/data/entities'
import { resolveConversationForCaller } from '../../lib/conversation-access'
import {
  CustomerLinkError,
  findCustomerCandidates,
  setConversationCustomer,
} from '../../lib/customer-link'

const url = process.env.P6_REALDB_URL
assert.ok(url, 'P6_REALDB_URL is required')

const orm = await MikroORM.init({
  clientUrl: url,
  entities: [CommunicationChannel, ExternalConversation, CustomerEntity],
  debug: false,
})
try {
  await orm.schema.create({ wrap: false })
} catch (error) {
  if ((error as { code?: string }).code !== '42P07') throw error
}

const tenantId = randomUUID()
const organizationId = randomUUID()
const otherOrgId = randomUUID()
const callerId = randomUUID()

function em() {
  return orm.em.fork()
}

async function clean() {
  const manager = em()
  await manager.nativeDelete(ExternalConversation, {})
  await manager.nativeDelete(CommunicationChannel, {})
  await manager.nativeDelete(CustomerEntity, {})
}

async function seedChannel(options: { ownerId?: string | null; organization?: string | null } = {}) {
  const manager = em()
  const channel = manager.create(CommunicationChannel, {
    providerKey: 'imap',
    channelType: 'email',
    displayName: 'Real DB channel',
    userId: options.ownerId === undefined ? null : options.ownerId,
    visibility: 'private',
    status: 'connected',
    tenantId,
    organizationId: options.organization === undefined ? organizationId : options.organization,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never)
  manager.persist(channel)
  await manager.flush()
  return channel
}

async function seedConversation(channel: CommunicationChannel, externalId: string) {
  const manager = em()
  const conversation = manager.create(ExternalConversation, {
    channelId: channel.id,
    externalConversationId: externalId,
    subject: '订单 #42',
    tenantId,
    organizationId: organizationId,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never)
  manager.persist(conversation)
  await manager.flush()
  return conversation
}

async function seedCustomer(options: { displayName: string; email?: string; organization?: string }) {
  const manager = em()
  const customer = manager.create(CustomerEntity, {
    kind: 'person',
    displayName: options.displayName,
    primaryEmail: options.email ?? `${randomUUID()}@acme.test`,
    tenantId,
    organizationId: options.organization ?? organizationId,
  } as never)
  manager.persist(customer)
  await manager.flush()
  return customer
}

try {
  // 1) personal channel owned by someone else is masked; the owner sees it
  await clean()
  const foreignChannel = await seedChannel({ ownerId: randomUUID() })
  const foreignConversation = await seedConversation(foreignChannel, `masked-${randomUUID()}`)
  const masked = await resolveConversationForCaller(
    em(),
    { tenantId, organizationId, userId: callerId },
    foreignConversation.id,
  )
  assert.equal(masked, null, 'another employee private channel must be invisible')
  console.log('PASS another employee personal channel is masked')

  // 2) own channel resolves; NULL-org (tenant-wide) conversation is included
  const ownChannel = await seedChannel({ ownerId: callerId })
  const ownConversation = await seedConversation(ownChannel, `own-${randomUUID()}`)
  const resolvedOwn = await resolveConversationForCaller(
    em(),
    { tenantId, organizationId, userId: callerId },
    ownConversation.id,
  )
  assert.equal(resolvedOwn?.id, ownConversation.id)

  const tenantWideChannel = await seedChannel({ organization: null })
  const tenantWideConversation = await seedConversation(tenantWideChannel, `tenant-${randomUUID()}`)
  const resolvedTenantWide = await resolveConversationForCaller(
    em(),
    { tenantId, organizationId, userId: callerId },
    tenantWideConversation.id,
  )
  assert.equal(resolvedTenantWide?.id, tenantWideConversation.id, 'NULL-org rows must stay visible')
  console.log('PASS own channel and NULL-organization conversation resolve')

  // 3) another organization's conversation is invisible
  const otherOrgChannel = await seedChannel({ organization: otherOrgId })
  const otherOrgConversation = await seedConversation(otherOrgChannel, `other-${randomUUID()}`)
  const otherResolved = await resolveConversationForCaller(
    em(),
    { tenantId, organizationId, userId: callerId },
    otherOrgConversation.id,
  )
  assert.equal(otherResolved, null)
  console.log('PASS another organization conversation is masked')

  // 4) link persists, then re-linking is a no-op that does not touch updated_at
  const customer = await seedCustomer({ displayName: '客户甲' })
  const first = await setConversationCustomer(em(), {
    tenantId,
    organizationId,
    conversation: resolvedOwn!,
    customerId: customer.id,
  })
  assert.equal(first.changed, true)
  const reader = em()
  reader.clear()
  const afterFirst = await reader.findOne(ExternalConversation, { id: ownConversation.id } as never)
  assert.equal(afterFirst?.contactPersonId, customer.id)
  const stamped = afterFirst?.updatedAt?.getTime()

  const second = await setConversationCustomer(reader, {
    tenantId,
    organizationId,
    conversation: afterFirst!,
    customerId: customer.id,
  })
  assert.equal(second.changed, false, 're-linking the same customer must not claim a change')
  const afterSecond = await em().findOne(ExternalConversation, { id: ownConversation.id } as never)
  assert.equal(afterSecond?.updatedAt?.getTime(), stamped, 'no-op must not bump updated_at')
  console.log('PASS link persists and re-linking is a no-op')

  // 5) unlink clears the column
  const unlinked = await setConversationCustomer(em(), {
    tenantId,
    organizationId,
    conversation: afterSecond!,
    customerId: null,
  })
  assert.equal(unlinked.changed, true)
  const afterUnlink = await em().findOne(ExternalConversation, { id: ownConversation.id } as never)
  assert.equal(afterUnlink?.contactPersonId ?? null, null)
  console.log('PASS unlink clears the column')

  // 6) a customer from another organization is refused, not writable
  const foreignCustomer = await seedCustomer({ displayName: '别人家的客户', organization: otherOrgId })
  await assert.rejects(
    setConversationCustomer(em(), {
      tenantId,
      organizationId,
      conversation: afterUnlink!,
      customerId: foreignCustomer.id,
    }),
    (error: CustomerLinkError) => error instanceof CustomerLinkError && error.status === 404,
  )
  console.log('PASS out-of-scope customer is refused as not found')

  // 7) candidates stay in scope and LIKE metacharacters are literal
  await seedCustomer({ displayName: '100% 折扣客户' })
  await seedCustomer({ displayName: '张三' })
  await seedCustomer({ displayName: '张三（别人家）', organization: otherOrgId })
  const literal = await findCustomerCandidates(em(), {
    tenantId,
    organizationId,
    query: '100%',
  })
  assert.deepEqual(literal.map((row) => row.displayName), ['100% 折扣客户'])
  const scoped = await findCustomerCandidates(em(), { tenantId, organizationId, query: '张三' })
  assert.deepEqual(scoped.map((row) => row.displayName), ['张三'])
  console.log('PASS candidates respect scope and escape LIKE wildcards')
} finally {
  await clean().catch(() => undefined)
  await orm.close(true)
}

console.log('conversation access + customer link realdb: all scenarios passed')
