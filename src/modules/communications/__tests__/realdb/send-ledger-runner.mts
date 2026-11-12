/**
 * Real-Postgres runner for the send idempotency ledger (S97 / design rev2 F3-08).
 *
 * The unit tests drive the ledger through a fake EM, so the things that only a
 * database can prove were unverified: the `(tenant,user,clientRequestId)` unique
 * constraint winning a genuine race, the TTL reclaim actually removing the stale
 * row, `complete`/`release` transitions, and the `42P01` degradation when the
 * table is missing.
 *
 * Launched by `send-ledger-realdb.test.ts` through `tsx`; skipped without
 * P6_REALDB_URL.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { MikroORM } from '@mikro-orm/postgresql'
import { SendRequest } from '../../data/entities'
import {
  SendLedgerUnavailableError,
  claimSendRequest,
  completeSendRequest,
  releaseSendRequest,
} from '../../lib/send-request'

const url = process.env.P6_REALDB_URL
assert.ok(url, 'P6_REALDB_URL is required')

const orm = await MikroORM.init({ clientUrl: url, entities: [SendRequest], debug: false })
try {
  await orm.schema.create({ wrap: false })
} catch (error) {
  if ((error as { code?: string }).code !== '42P07') throw error
}

const tenantId = randomUUID()
const userId = randomUUID()
const organizationId = randomUUID()
const channelId = randomUUID()

function em() {
  return orm.em.fork()
}

async function clean() {
  await em().nativeDelete(SendRequest, {})
}

function claim(clientRequestId: string, payloadHash: string) {
  return claimSendRequest(em(), {
    tenantId,
    organizationId,
    userId,
    clientRequestId,
    channelId,
    payloadHash,
  })
}

try {
  // 1) first claim wins and records the hash
  await clean()
  const key = 'req-1'
  const first = await claim(key, 'hash-a')
  assert.equal(first.state, 'claimed')
  const stored = await em().findOne(SendRequest, { clientRequestId: key } as never)
  assert.equal(stored?.payloadHash, 'hash-a')
  assert.equal(stored?.messageId ?? null, null)
  console.log('PASS first claim reserves the key with its payload hash')

  // 2) a second claim while in flight is refused, not duplicated
  const second = await claim(key, 'hash-a')
  assert.equal(second.state, 'in_flight')
  assert.equal(await em().count(SendRequest, { clientRequestId: key } as never), 1)
  console.log('PASS an in-flight retry reports in_flight without a second row')

  // 3) completion makes a same-hash retry replay, a different-hash retry conflict
  const messageId = randomUUID()
  await completeSendRequest(em(), (first as { id: string }).id, { messageId, messageThreadId: null })
  const replay = await claim(key, 'hash-a')
  assert.deepEqual(replay, { state: 'replay', messageId, messageThreadId: null, channelId })
  const conflict = await claim(key, 'hash-b')
  assert.equal(conflict.state, 'conflict')
  console.log('PASS completed keys replay on the same hash and conflict on a different one')

  // 4) a stale in-flight row (past TTL) is reclaimed: one row remains
  const staleKey = 'req-stale'
  const stale = await claim(staleKey, 'hash-a')
  assert.equal(stale.state, 'claimed')
  await em().nativeUpdate(
    SendRequest,
    { id: (stale as { id: string }).id },
    { createdAt: new Date(Date.now() - 3 * 60 * 1000) } as never,
  )
  const reclaimed = await claim(staleKey, 'hash-a')
  assert.equal(reclaimed.state, 'claimed')
  assert.notEqual((reclaimed as { id: string }).id, (stale as { id: string }).id)
  assert.equal(await em().count(SendRequest, { clientRequestId: staleKey } as never), 1)
  console.log('PASS a stale in-flight row is reclaimed and the old row is gone')

  // 5) release lets the caller retry the same key
  const releasedKey = 'req-release'
  const released = await claim(releasedKey, 'hash-a')
  assert.equal(released.state, 'claimed')
  await releaseSendRequest(em(), (released as { id: string }).id)
  assert.equal(await em().count(SendRequest, { clientRequestId: releasedKey } as never), 0)
  const retried = await claim(releasedKey, 'hash-a')
  assert.equal(retried.state, 'claimed')
  console.log('PASS release removes the row so the key is usable again')

  // 6) a genuine race: concurrent claims of one key yield exactly one reservation
  await clean()
  const raceKey = 'req-race'
  const results = await Promise.all([claim(raceKey, 'hash-a'), claim(raceKey, 'hash-a'), claim(raceKey, 'hash-a')])
  const claimed = results.filter((result) => result.state === 'claimed')
  assert.equal(claimed.length, 1, 'exactly one caller may claim the key')
  assert.equal(await em().count(SendRequest, { clientRequestId: raceKey } as never), 1)
  for (const result of results) {
    assert.ok(['claimed', 'in_flight', 'replay'].includes(result.state), `unexpected state ${result.state}`)
  }
  console.log('PASS concurrent claims produce exactly one reservation')

  // 7) a missing table degrades to SendLedgerUnavailableError instead of a 500
  await clean()
  await em().getConnection().execute('drop table if exists communications_send_requests')
  await assert.rejects(claim('req-missing-table', 'hash-a'), (error: unknown) => error instanceof SendLedgerUnavailableError)
  console.log('PASS a missing ledger table surfaces SendLedgerUnavailableError')
} finally {
  await clean().catch(() => undefined)
  await orm.close(true)
}

console.log('send ledger realdb: all scenarios passed')
