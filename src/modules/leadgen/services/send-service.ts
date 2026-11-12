/**
 * M6 dispatch boundary — one approval, at most one dispatch, and no external effect.
 *
 * The external effect (a provider actually accepting a message) is deliberately NOT
 * implemented: the only transport records the intent in `leadgen_sends` and reports
 * `externalEffect: false`, so nothing can leave this host. What this layer proves is
 * the approval token's single-use contract at the send boundary:
 *
 *  - a dispatch requires an `approved` draft whose body still matches the approval;
 *  - an expired or revoked approval is refused;
 *  - the idempotency key is derived on the server from (draft, body hash, approval),
 *    so a client retry replays the same send row instead of dispatching twice;
 *  - the draft is claimed with a compare-and-set (`approved` -> `sent`), so exactly
 *    one caller can ever turn one approval into a dispatch;
 *  - a transport failure releases the claim and marks the row `failed`, so the
 *    approval is not silently burned.
 */
import type { ApprovalRow, DraftRow } from './outreach-service'

export type SendState =
  | 'queued'
  | 'dispatching'
  | 'simulated'
  | 'accepted'
  | 'delivered'
  | 'replied'
  | 'unknown'
  | 'bounced'
  | 'complained'
  | 'failed'
  | 'suppressed'

export type SendRow = {
  id: string
  tenantId: string
  organizationId: string
  draftId: string
  approvalId: string
  draftHash: string
  idempotencyKey: string
  providerKey: string | null
  channel: string
  providerMessageId: string | null
  state: SendState
  attempt: number
  leaseExpiresAt: string | null
  enqueuedAt: string
  sentAt: string | null
  errorCode: string | null
  updatedAt: string
}

export type DispatchErrorCode =
  | 'draft_not_found'
  | 'approval_not_found'
  | 'approval_not_approved'
  | 'approval_expired'
  | 'approval_revoked'
  | 'body_hash_mismatch'
  | 'draft_not_approved'
  | 'already_sent'
  | 'send_in_progress'
  | 'suppressed'
  | 'quota_lease_required'
  | 'quota_lease_invalid'
  | 'transport_failed'

/**
 * The one transport this codebase ships. It performs no I/O: it only proves the
 * dispatch pipeline. A provider adapter is a separate, separately authorized change.
 */
export type OutboundTransport = {
  readonly key: string
  readonly externalEffect: boolean
  deliver(input: {
    tenantId: string
    organizationId: string
    draftId: string
    recipientEmail: string
    recipientHash: string
    subject: string
    bodyMarkdown: string
    channel: string
  }): Promise<{ providerMessageId: string | null }>
}

export function createSimulatedTransport(): OutboundTransport {
  return {
    key: 'simulated',
    externalEffect: false,
    async deliver() {
      return { providerMessageId: null }
    },
  }
}

/**
 * The controls a dispatch must satisfy besides the approval token: a suppression
 * hit keeps the recipient out, and a funded `send` quota reservation is consumed
 * exactly once. Both are backed by existing tables; neither contacts a provider.
 */
export type SendGuards = {
  isSuppressed(input: {
    tenantId: string
    organizationId: string
    emailHash: string
  }): Promise<boolean>
  consumeLease(input: { tenantId: string; organizationId: string; leaseToken: string }): Promise<
    | { ok: true; reservationId: string; units: number }
    | { ok: false; code: 'lease_not_found' | 'lease_not_send' | 'lease_expired' | 'lease_already_used' }
  >
  refundLease(input: { tenantId: string; organizationId: string; leaseToken: string }): Promise<void>
}

export type SendRepository = {
  getDraft(input: { tenantId: string; organizationId: string; id: string }): Promise<DraftRow | null>
  getApproval(input: { tenantId: string; organizationId: string; id: string }): Promise<ApprovalRow | null>
  claimDraftForSend(input: {
    tenantId: string
    organizationId: string
    id: string
    now: string
  }): Promise<boolean>
  releaseDraftClaim(input: {
    tenantId: string
    organizationId: string
    id: string
    now: string
  }): Promise<boolean>
  findSendByKey(input: {
    tenantId: string
    organizationId: string
    idempotencyKey: string
  }): Promise<SendRow | null>
  insertSend(input: {
    id: string
    tenantId: string
    organizationId: string
    draftId: string
    approvalId: string
    draftHash: string
    idempotencyKey: string
    providerKey: string | null
    channel: string
    state: SendState
    attempt: number
    leaseExpiresAt: string | null
    now: string
  }): Promise<SendRow>
  markSendDispatching(input: {
    id: string
    attempt: number
    leaseExpiresAt: string
    now: string
  }): Promise<boolean>
  markSendSettled(input: {
    id: string
    state: 'simulated' | 'accepted'
    providerMessageId: string | null
    sentAt: string
    now: string
  }): Promise<void>
  markSendFailed(input: { id: string; errorCode: string; now: string }): Promise<void>
}

export type DispatchResult =
  | {
      ok: true
      send: SendRow
      replayed: boolean
      transport: { key: string; externalEffect: boolean }
    }
  | { ok: false; code: DispatchErrorCode }

export const SEND_LEASE_MS = 60_000

/** Server-derived: the client never chooses the key, so it cannot fake a replay. */
export function sendIdempotencyKey(input: {
  draftId: string
  draftHash: string
  approvalId: string
}): string {
  return `send:${input.draftId}:${input.draftHash}:${input.approvalId}`
}

export function createSendService(deps: {
  repo: SendRepository
  guards: SendGuards
  transport: OutboundTransport
  now: () => string
  newId: () => string
}) {
  const { repo, guards, transport, now, newId } = deps

  async function dispatch(input: {
    tenantId: string
    organizationId: string
    draftId: string
    approvalId: string
    /** Lease of a `send` quota reservation; one lease funds one dispatch. */
    leaseToken?: string
  }): Promise<DispatchResult> {
    const draft = await repo.getDraft({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      id: input.draftId,
    })
    if (!draft) return { ok: false, code: 'draft_not_found' }
    // A suppression hit outranks any approval: the recipient asked not to be mailed.
    if (await guards.isSuppressed({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      emailHash: draft.recipientHash,
    })) {
      return { ok: false, code: 'suppressed' }
    }

    const approval = await repo.getApproval({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      id: input.approvalId,
    })
    if (!approval || approval.draftId !== draft.id) return { ok: false, code: 'approval_not_found' }
    if (approval.decision !== 'approved') return { ok: false, code: 'approval_not_approved' }
    if (approval.revokedAt) return { ok: false, code: 'approval_revoked' }
    const at = now()
    if (Date.parse(approval.expiresAt) <= Date.parse(at)) return { ok: false, code: 'approval_expired' }
    // The token is worth exactly the body that was reviewed.
    if (approval.draftHash !== draft.bodyHash) return { ok: false, code: 'body_hash_mismatch' }

    const idempotencyKey = sendIdempotencyKey({
      draftId: draft.id,
      draftHash: draft.bodyHash,
      approvalId: approval.id,
    })
    const existing = await repo.findSendByKey({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      idempotencyKey,
    })
    if (existing && existing.state !== 'failed') {
      // A retry of the same intent, or a still-live dispatch: never a second delivery.
      if (existing.state === 'dispatching') {
        const leaseLive = existing.leaseExpiresAt && Date.parse(existing.leaseExpiresAt) > Date.parse(at)
        if (leaseLive) return { ok: false, code: 'send_in_progress' }
      } else {
        return { ok: true, send: existing, replayed: true, transport: transportInfo() }
      }
    }

    if (draft.status === 'sent') return { ok: false, code: 'already_sent' }
    if (draft.status !== 'approved') return { ok: false, code: 'draft_not_approved' }

    const claimed = await repo.claimDraftForSend({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      id: draft.id,
      now: at,
    })
    if (!claimed) {
      // Someone else won the compare-and-set between our read and our write.
      const raced = await repo.findSendByKey({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        idempotencyKey,
      })
      if (raced) return { ok: true, send: raced, replayed: true, transport: transportInfo() }
      return { ok: false, code: 'already_sent' }
    }

    // A dispatch must be funded: one `send` reservation funds exactly one send.
    if (!input.leaseToken) {
      await repo.releaseDraftClaim({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        id: draft.id,
        now: at,
      })
      return { ok: false, code: 'quota_lease_required' }
    }
    const consumed = await guards.consumeLease({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      leaseToken: input.leaseToken,
    })
    if (!consumed.ok) {
      await repo.releaseDraftClaim({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        id: draft.id,
        now: at,
      })
      return { ok: false, code: 'quota_lease_invalid' }
    }

    const leaseExpiresAt = new Date(Date.parse(at) + SEND_LEASE_MS).toISOString()
    let send: SendRow
    try {
      if (existing) {
        const attempt = existing.attempt + 1
        await repo.markSendDispatching({ id: existing.id, attempt, leaseExpiresAt, now: at })
        send = { ...existing, state: 'dispatching', attempt, leaseExpiresAt, updatedAt: at }
      } else {
        send = await repo.insertSend({
          id: newId(),
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          draftId: draft.id,
          approvalId: approval.id,
          draftHash: draft.bodyHash,
          idempotencyKey,
          providerKey: transport.key,
          channel: draft.channel,
          state: 'dispatching',
          attempt: 1,
          leaseExpiresAt,
          now: at,
        })
      }
    } catch (error) {
      // The row could not be recorded: give the quota back rather than spend it on nothing.
      await guards.refundLease({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        leaseToken: input.leaseToken,
      })
      await repo.releaseDraftClaim({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        id: draft.id,
        now: now(),
      })
      throw error
    }

    try {
      const delivered = await transport.deliver({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        draftId: draft.id,
        recipientEmail: draft.recipientEmail,
        recipientHash: draft.recipientHash,
        subject: draft.subject,
        bodyMarkdown: draft.bodyMarkdown,
        channel: draft.channel,
      })
      const at2 = now()
      const state = transport.externalEffect ? 'accepted' : 'simulated'
      await repo.markSendSettled({
        id: send.id,
        state,
        providerMessageId: delivered.providerMessageId,
        sentAt: at2,
        now: at2,
      })
      return {
        ok: true,
        send: { ...send, state, providerMessageId: delivered.providerMessageId, sentAt: at2, leaseExpiresAt: null, updatedAt: at2 },
        replayed: false,
        transport: transportInfo(),
      }
    } catch {
      const at2 = now()
      await repo.markSendFailed({ id: send.id, errorCode: 'transport_failed', now: at2 })
      // The reservation goes back, so a failed attempt does not spend quota.
      await guards.refundLease({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        leaseToken: input.leaseToken,
      })
      // The approval is not burned: the draft goes back to `approved`.
      await repo.releaseDraftClaim({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        id: draft.id,
        now: at2,
      })
      return { ok: false, code: 'transport_failed' }
    }
  }

  function transportInfo() {
    return { key: transport.key, externalEffect: transport.externalEffect }
  }

  return { dispatch }
}
