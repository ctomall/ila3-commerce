/** MikroORM adapter for the internal draft/approval layer (no provider calls). */
import type { EntityManager } from '@mikro-orm/postgresql'
import { LeadgenApproval, LeadgenCandidate, LeadgenDraft } from '../data/entities'
import type { ApprovalRow, DraftRow, OutreachRepository } from './outreach-service'

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
    createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
  }
}

export function createOrmOutreachRepository(em: EntityManager): OutreachRepository {
  return {
    async findDraftByCandidateAndHash(input) {
      const row = await em.fork().findOne(LeadgenDraft, {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        candidateId: input.candidateId,
        bodyHash: input.bodyHash,
      })
      return row ? draftRow(row) : null
    },

    async insertDraft(input) {
      const manager = em.fork()
      const row = manager.create(LeadgenDraft, {
        id: input.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        candidateId: input.candidateId,
        recipientEmail: input.recipientEmail,
        recipientHash: input.recipientHash,
        channel: input.channel,
        subject: input.subject,
        bodyMarkdown: input.bodyMarkdown,
        bodyHash: input.bodyHash,
        status: input.status,
        version: input.version,
        createdAt: new Date(input.now),
        updatedAt: new Date(input.now),
      })
      manager.persist(row)
      await manager.flush()
      return draftRow(row)
    },

    async getDraft(input) {
      const row = await em.fork().findOne(LeadgenDraft, {
        id: input.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      })
      return row ? draftRow(row) : null
    },

    async markDraftApproved(input) {
      const manager = em.fork()
      const changed = await manager.nativeUpdate(
        LeadgenDraft,
        { id: input.id, tenantId: input.tenantId, organizationId: input.organizationId, status: { $in: ['ready', 'editing'] } },
        { status: 'approved', updatedAt: new Date(input.now) },
      )
      return changed === 1
    },

    async findApprovalByKey(input) {
      const row = await em.fork().findOne(LeadgenApproval, {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
      })
      return row ? approvalRow(row) : null
    },

    async insertApproval(input) {
      const manager = em.fork()
      const row = manager.create(LeadgenApproval, {
        id: input.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        draftId: input.draftId,
        draftHash: input.draftHash,
        decision: input.decision,
        approverUserId: input.approverUserId,
        idempotencyKey: input.idempotencyKey,
        expiresAt: new Date(input.expiresAt),
        createdAt: new Date(input.now),
      })
      manager.persist(row)
      await manager.flush()
      return approvalRow(row)
    },

    async getCandidateScope(input) {
      const row = await em.fork().findOne(LeadgenCandidate, {
        id: input.candidateId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        deletedAt: null,
      })
      return row ? { id: row.id, status: row.status } : null
    },
  }
}

export async function createRequestOutreachRepository(): Promise<OutreachRepository> {
  const { createRequestContainer } = await import('@open-mercato/shared/lib/di/container')
  const container = await createRequestContainer()
  return createOrmOutreachRepository(container.resolve<EntityManager>('em').fork())
}
