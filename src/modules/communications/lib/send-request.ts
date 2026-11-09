import type { EntityManager } from '@mikro-orm/postgresql'
import { isUniqueViolation } from '@open-mercato/shared/lib/db/pg-errors'
import { SendRequest } from '../data/entities'

/**
 * A row younger than this without a message id is treated as an attempt that is
 * still running. Older than this, the process that claimed it is presumed dead
 * and the row may be reclaimed — otherwise a crash mid-send would lock the
 * caller's idempotency key forever.
 */
const IN_FLIGHT_TTL_MS = 2 * 60 * 1000

export type ClaimSendRequestInput = {
  tenantId: string
  organizationId: string | null
  userId: string
  clientRequestId: string
  channelId: string
}

export type ClaimSendRequestResult =
  | { state: 'claimed'; id: string }
  | { state: 'replay'; messageId: string; messageThreadId: string | null; channelId: string }
  | { state: 'in_flight' }

function decide(row: SendRequest | null): ClaimSendRequestResult | null {
  if (!row) return null
  if (row.messageId) {
    return {
      state: 'replay',
      messageId: row.messageId,
      messageThreadId: row.messageThreadId ?? null,
      channelId: row.channelId,
    }
  }
  if (Date.now() - row.createdAt.getTime() < IN_FLIGHT_TTL_MS) return { state: 'in_flight' }
  return null
}

async function findByKey(em: EntityManager, input: ClaimSendRequestInput): Promise<SendRequest | null> {
  return em.findOne(SendRequest, {
    tenantId: input.tenantId,
    userId: input.userId,
    clientRequestId: input.clientRequestId,
  })
}

/**
 * Reserve the idempotency key, or report what the first attempt already decided.
 *
 * The insert is what makes this race-safe: two concurrent retries both reach the
 * database, one wins the unique key, the loser re-reads the winner's row instead
 * of sending a second message.
 */
export async function claimSendRequest(
  em: EntityManager,
  input: ClaimSendRequestInput,
): Promise<ClaimSendRequestResult> {
  const existing = await findByKey(em, input)
  const decided = decide(existing)
  if (decided) return decided
  if (existing) {
    // Stale in-flight row from a dead process: drop it before re-claiming.
    em.remove(existing)
    await em.flush()
  }

  const row = em.create(SendRequest, {
    tenantId: input.tenantId,
    organizationId: input.organizationId,
    userId: input.userId,
    clientRequestId: input.clientRequestId,
    channelId: input.channelId,
  })
  try {
    em.persist(row)
    await em.flush()
    return { state: 'claimed', id: row.id }
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    const raced = await findByKey(em, input)
    const outcome = decide(raced)
    if (outcome) return outcome
    throw err
  }
}

/** Record the hub's accepted message on the reserved row. */
export async function completeSendRequest(
  em: EntityManager,
  id: string,
  result: { messageId: string; messageThreadId: string | null },
): Promise<void> {
  const row = await em.findOne(SendRequest, { id })
  if (!row) return
  row.messageId = result.messageId
  row.messageThreadId = result.messageThreadId
  await em.flush()
}

/**
 * Release a reservation after a definite refusal (validation, ownership, channel
 * state). The caller may retry the same key once the cause is fixed. An
 * indeterminate outcome must NOT call this: keeping the row is what lets a retry
 * discover the original result instead of sending twice.
 */
export async function releaseSendRequest(em: EntityManager, id: string): Promise<void> {
  const row = await em.findOne(SendRequest, { id })
  if (!row) return
  em.remove(row)
  await em.flush()
}
