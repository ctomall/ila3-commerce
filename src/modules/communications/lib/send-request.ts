import { createHash } from 'node:crypto'
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

/**
 * The idempotency ledger table does not exist. This is a deployment/state
 * problem (the module migration was not applied), not a caller error, so it is
 * surfaced as its own type instead of a generic 500: the route answers 503 and
 * the caller can retry once the database is initialized.
 */
export class SendLedgerUnavailableError extends Error {
  constructor() {
    super('communications_send_requests is not available')
    this.name = 'SendLedgerUnavailableError'
  }
}

function isUndefinedTable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === '42P01'
  )
}

export type SendPayloadHashInput = {
  channelId: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body: { plain?: string; html?: string }
  template?: { name?: string; language?: string; components?: unknown[] } | null
  media?: {
    kind?: string
    id?: string
    link?: string
    attachmentId?: string
    fileName?: string
    caption?: string
  } | null
  parentMessageId?: string | null
  /** Inbox conversation the reply was composed in; only sent by newer clients. */
  threadId?: string | null
  /**
   * Caller pass-through metadata (already stripped of routing keys). It is
   * forwarded to the hub, where a provider adapter may read provider-specific
   * options from it, so it can change what leaves the CRM. Omitted when empty so
   * hashes recorded for metadata-free requests keep their old value.
   */
  channelMetadata?: Record<string, unknown> | null
}

/**
 * Canonical JSON: object keys sorted at every depth, array order preserved.
 * Recipient/component order is semantically meaningful, so it must not be
 * normalized away; key order from the caller is not, so it must not create a
 * false mismatch.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) {
      const child = canonicalize(source[key])
      if (child !== undefined) out[key] = child
    }
    return out
  }
  return value
}

/**
 * Stable digest of the send request, used to bind a `clientRequestId` to the
 * payload it was issued for. Every field that changes what leaves the CRM is
 * included; caller metadata that does not affect the provider payload is not.
 */
export function computeSendPayloadHash(input: SendPayloadHashInput): string {
  const normalized = {
    channelId: input.channelId,
    to: input.to,
    cc: input.cc ?? [],
    bcc: input.bcc ?? [],
    subject: input.subject,
    body: {
      plain: input.body.plain ?? null,
      html: input.body.html ?? null,
    },
    template: input.template
      ? {
          name: input.template.name ?? null,
          language: input.template.language ?? null,
          components: input.template.components ?? [],
        }
      : null,
    media: input.media
      ? {
          kind: input.media.kind ?? null,
          id: input.media.id ?? null,
          link: input.media.link ?? null,
          attachmentId: input.media.attachmentId ?? null,
          fileName: input.media.fileName ?? null,
          caption: input.media.caption ?? null,
        }
      : null,
    parentMessageId: input.parentMessageId ?? null,
    ...(input.channelMetadata && Object.keys(input.channelMetadata).length
      ? { channelMetadata: canonicalize(input.channelMetadata) }
      : {}),
    // Omitted entirely when absent so hashes recorded by older clients keep
    // matching on retry.
    ...(input.threadId ? { threadId: input.threadId } : {}),
  }
  return createHash('sha256').update(JSON.stringify(canonicalize(normalized))).digest('hex')
}

export type ClaimSendRequestInput = {
  tenantId: string
  organizationId: string | null
  userId: string
  clientRequestId: string
  channelId: string
  /** Digest of the normalized request, bound to the key at claim time. */
  payloadHash: string
}

export type ClaimSendRequestResult =
  | { state: 'claimed'; id: string }
  | { state: 'replay'; messageId: string; messageThreadId: string | null; channelId: string }
  | { state: 'in_flight' }
  /** The key was already completed by a DIFFERENT payload; never send. */
  | { state: 'conflict' }

function decide(row: SendRequest | null, payloadHash: string): ClaimSendRequestResult | null {
  if (!row) return null
  if (row.messageId) {
    // A null stored hash predates the column and cannot prove the payload, so
    // it fails closed rather than replaying a possibly different request.
    if (row.payloadHash !== payloadHash) return { state: 'conflict' }
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
  try {
    return await claimSendRequestUnchecked(em, input)
  } catch (error) {
    if (isUndefinedTable(error)) throw new SendLedgerUnavailableError()
    throw error
  }
}

async function claimSendRequestUnchecked(
  em: EntityManager,
  input: ClaimSendRequestInput,
): Promise<ClaimSendRequestResult> {
  const existing = await findByKey(em, input)
  const decided = decide(existing, input.payloadHash)
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
    payloadHash: input.payloadHash,
  })
  try {
    em.persist(row)
    await em.flush()
    return { state: 'claimed', id: row.id }
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    const raced = await findByKey(em, input)
    const outcome = decide(raced, input.payloadHash)
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
