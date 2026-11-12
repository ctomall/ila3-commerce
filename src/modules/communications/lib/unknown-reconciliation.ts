/**
 * Product-side reconciliation for `unknown` outbound results (design rev2 `F8-03`).
 *
 * `unknown` is a terminal state: the platform may or may not have the message, so
 * it is never re-sent automatically. The CLI (`scripts/reconcile-unknown.mjs`) can
 * already record a human finding in `channel_metadata.reconciliation`; this module
 * gives the same operation a product surface without inventing a second rule:
 *
 *  - it never changes `delivery_status` and never sends anything;
 *  - the record is an APPEND {outcome, note, operatorUserId, at} on the link
 *    metadata, mirroring the CLI shape;
 *  - a note shorter than 8 characters is refused (the CLI refuses it too — the
 *    record must explain the finding, not just click a button);
 *  - an already-reconciled link refuses a second record instead of overwriting the
 *    first human judgment (the CLI appends, but the product keeps one decision per
 *    unknown and says so).
 */
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { MessageChannelLink } from '@open-mercato/core/modules/communication_channels/data/entities'
import { channelOrgScopeWhere } from '@open-mercato/core/modules/communication_channels/lib/access-control'

export const RECONCILIATION_OUTCOMES = ['confirmed-sent', 'confirmed-not-sent'] as const
export type ReconciliationOutcome = (typeof RECONCILIATION_OUTCOMES)[number]

export const MIN_NOTE_LENGTH = 8

export type ReconciliationRecord = {
  outcome: ReconciliationOutcome
  note: string
  operatorUserId: string
  at: string
}

export type UnknownLinkRow = {
  id: string
  conversationId: string
  messageId: string
  providerKey: string
  channelType: string
  createdAt: string | null
  lastAttemptAt: string | null
  reconciliation: ReconciliationRecord | null
}

export function readReconciliation(
  metadata: Record<string, unknown> | null | undefined,
): ReconciliationRecord | null {
  const value = metadata?.reconciliation
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const outcome = record.outcome
  if (outcome !== 'confirmed-sent' && outcome !== 'confirmed-not-sent') return null
  return {
    outcome,
    note: typeof record.note === 'string' ? record.note : '',
    operatorUserId: typeof record.operatorUserId === 'string' ? record.operatorUserId : '',
    at: typeof record.at === 'string' ? record.at : '',
  }
}

export class ReconciliationError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ReconciliationError'
    this.status = status
    this.code = code
  }
}

/** Unknown outbound links in the caller's scope, newest first. */
export async function listUnknownLinks(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string | null },
  options: { limit?: number; includeReconciled?: boolean } = {},
): Promise<UnknownLinkRow[]> {
  const links = await em.find(
    MessageChannelLink,
    {
      tenantId: scope.tenantId,
      direction: 'outbound',
      deliveryStatus: 'unknown',
      ...channelOrgScopeWhere(scope.organizationId),
    } as FilterQuery<MessageChannelLink>,
    { orderBy: { createdAt: 'desc' }, limit: Math.min(Math.max(options.limit ?? 50, 1), 200) },
  )
  const rows: UnknownLinkRow[] = []
  for (const link of links) {
    const metadata = (link.channelMetadata as Record<string, unknown> | null | undefined) ?? null
    const reconciliation = readReconciliation(metadata)
    if (reconciliation && options.includeReconciled !== true) continue
    rows.push({
      id: link.id,
      conversationId: link.externalConversationId,
      messageId: link.messageId,
      providerKey: link.providerKey,
      channelType: link.channelType,
      createdAt: link.createdAt?.toISOString?.() ?? null,
      lastAttemptAt:
        (metadata?.lastAttemptAt as string | undefined) ??
        null,
      reconciliation,
    })
  }
  return rows
}

/**
 * Append one human finding. Never touches `deliveryStatus`, never sends.
 * Throws `ReconciliationError` with the HTTP status the route should return.
 */
export async function recordReconciliation(
  em: EntityManager,
  input: {
    tenantId: string
    organizationId: string | null
    linkId: string
    outcome: ReconciliationOutcome
    note: string
    operatorUserId: string
  },
): Promise<{ linkId: string; record: ReconciliationRecord }> {
  if (!RECONCILIATION_OUTCOMES.includes(input.outcome)) {
    throw new ReconciliationError(422, 'RECONCILIATION_OUTCOME_INVALID', 'unknown outcome')
  }
  const note = input.note.trim()
  if (note.length < MIN_NOTE_LENGTH) {
    // The record is what a later auditor reads; "ok" is not an explanation.
    throw new ReconciliationError(
      422,
      'RECONCILIATION_NOTE_TOO_SHORT',
      `note must be at least ${MIN_NOTE_LENGTH} characters`,
    )
  }
  let link: MessageChannelLink | null
  try {
    link = await em.findOne(MessageChannelLink, {
      id: input.linkId,
      tenantId: input.tenantId,
      direction: 'outbound',
      ...channelOrgScopeWhere(input.organizationId),
    } as FilterQuery<MessageChannelLink>)
  } catch (err) {
    if ((err as { code?: string }).code === '22P02') {
      throw new ReconciliationError(404, 'RECONCILIATION_NOT_FOUND', 'link not found')
    }
    throw err
  }
  if (!link) {
    throw new ReconciliationError(404, 'RECONCILIATION_NOT_FOUND', 'link not found')
  }
  if (link.deliveryStatus !== 'unknown') {
    // A delivered/failed link needs no human verdict; writing one here would make
    // the audit trail claim a judgment that was never required.
    throw new ReconciliationError(409, 'RECONCILIATION_NOT_UNKNOWN', 'link is not in the unknown state')
  }
  const metadata = { ...((link.channelMetadata as Record<string, unknown> | null | undefined) ?? {}) }
  const existing = readReconciliation(metadata)
  if (existing) {
    throw new ReconciliationError(409, 'RECONCILIATION_ALREADY_RECORDED', 'unknown already reconciled')
  }
  const record: ReconciliationRecord = {
    outcome: input.outcome,
    note,
    operatorUserId: input.operatorUserId,
    at: new Date().toISOString(),
  }
  link.channelMetadata = { ...metadata, reconciliation: record }
  await em.flush()
  return { linkId: link.id, record }
}
