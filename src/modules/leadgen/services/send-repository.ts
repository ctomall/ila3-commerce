/** MikroORM adapter for the dispatch boundary. No provider is contacted here. */
import type { EntityManager } from '@mikro-orm/postgresql'
import { LeadgenApproval, LeadgenDraft, LeadgenSend } from '../data/entities'
import type { ApprovalRow, DraftRow } from './outreach-service'
import type { SendRepository, SendRow, SendState } from './send-service'

const iso = (value: Date | string | null | undefined): string | null =>
  value ? (value instanceof Date ? value.toISOString() : new Date(value).toISOString()) : null

function draftRow(row: LeadgenDraft): DraftRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    candidateId: row.candidateId,
    recipientEmail: row.recipientEmail,
    recipientHash: row.recipientHash,
    channel: row.channel,
    subject: row.subject,
    bodyMarkdown: row.bodyMarkdown,
    bodyHash: row.bodyHash,
    status: row.status,
    version: row.version,
    createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: iso(row.updatedAt) ?? new Date(0).toISOString(),
  }
}

function approvalRow(row: LeadgenApproval): ApprovalRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    draftId: row.draftId,
    draftHash: row.draftHash,
    decision: row.decision,
    approverUserId: row.approverUserId,
    idempotencyKey: row.idempotencyKey,
    expiresAt: iso(row.expiresAt) ?? new Date(0).toISOString(),
    revokedAt: iso(row.revokedAt),
    createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
  }
}

function sendRow(row: LeadgenSend): SendRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    draftId: row.draftId,
    approvalId: row.approvalId,
    draftHash: row.draftHash,
    idempotencyKey: row.idempotencyKey,
    providerKey: row.providerKey ?? null,
    channel: row.channel,
    providerMessageId: row.providerMessageId ?? null,
    state: row.state as SendState,
    attempt: row.attempt,
    leaseExpiresAt: iso(row.leaseExpiresAt),
    enqueuedAt: iso(row.enqueuedAt) ?? new Date(0).toISOString(),
    sentAt: iso(row.sentAt),
    errorCode: row.errorCode ?? null,
    updatedAt: iso(row.updatedAt) ?? new Date(0).toISOString(),
  }
}

export function createOrmSendRepository(em: EntityManager): SendRepository {
  return {
    async getDraft(input) {
      const row = await em.fork().findOne(LeadgenDraft, {
        id: input.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      })
      return row ? draftRow(row) : null
    },

    async getApproval(input) {
      const row = await em.fork().findOne(LeadgenApproval, {
        id: input.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      })
      return row ? approvalRow(row) : null
    },

    async claimDraftForSend(input) {
      // Exactly one caller can move one approved draft to `sent`: that is the
      // single-use consumption of the approval token.
      const changed = await em.fork().nativeUpdate(
        LeadgenDraft,
        {
          id: input.id,
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          status: 'approved',
        },
        { status: 'sent', updatedAt: new Date(input.now) },
      )
      return changed === 1
    },

    async releaseDraftClaim(input) {
      const changed = await em.fork().nativeUpdate(
        LeadgenDraft,
        {
          id: input.id,
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          status: 'sent',
        },
        { status: 'approved', updatedAt: new Date(input.now) },
      )
      return changed === 1
    },

    async findSendByKey(input) {
      const row = await em.fork().findOne(LeadgenSend, {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
      })
      return row ? sendRow(row) : null
    },

    async insertSend(input) {
      const manager = em.fork()
      const row = manager.create(LeadgenSend, {
        id: input.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        draftId: input.draftId,
        approvalId: input.approvalId,
        draftHash: input.draftHash,
        idempotencyKey: input.idempotencyKey,
        providerKey: input.providerKey,
        channel: input.channel,
        state: input.state,
        attempt: input.attempt,
        leaseExpiresAt: input.leaseExpiresAt ? new Date(input.leaseExpiresAt) : null,
        enqueuedAt: new Date(input.now),
        updatedAt: new Date(input.now),
      })
      manager.persist(row)
      await manager.flush()
      return sendRow(row)
    },

    async markSendDispatching(input) {
      const changed = await em.fork().nativeUpdate(
        LeadgenSend,
        { id: input.id },
        {
          state: 'dispatching',
          attempt: input.attempt,
          leaseExpiresAt: new Date(input.leaseExpiresAt),
          updatedAt: new Date(input.now),
        },
      )
      return changed === 1
    },

    async markSendSettled(input) {
      await em.fork().nativeUpdate(
        LeadgenSend,
        { id: input.id },
        {
          state: input.state,
          providerMessageId: input.providerMessageId,
          sentAt: new Date(input.sentAt),
          leaseExpiresAt: null,
          errorCode: null,
          updatedAt: new Date(input.now),
        },
      )
    },

    async markSendFailed(input) {
      await em.fork().nativeUpdate(
        LeadgenSend,
        { id: input.id },
        {
          state: 'failed',
          errorCode: input.errorCode,
          leaseExpiresAt: null,
          updatedAt: new Date(input.now),
        },
      )
    },
  }
}

export async function createRequestSendRepository(): Promise<SendRepository> {
  const { createRequestContainer } = await import('@open-mercato/shared/lib/di/container')
  const container = await createRequestContainer()
  return createOrmSendRepository(container.resolve<EntityManager>('em').fork())
}
