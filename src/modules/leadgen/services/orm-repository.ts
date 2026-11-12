/**
 * MikroORM adapter for the M5 leadgen service.
 *
 * Thin on purpose: every rule lives in `leadgen-service.ts`/`candidate-rules.ts`.
 * The two load-bearing details here are the atomic status transitions
 * (`update ... where status in (...)`) that make concurrent decisions and CRM
 * writes safe, and the command-bus call that creates the CRM company with the
 * reviewer's identity instead of an ad-hoc insert.
 */
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import {
  LeadgenCandidate,
  LeadgenCandidateDecision,
  LeadgenCandidateEvidence,
  LeadgenCompanyClaim,
  LeadgenResearchRun,
  LeadgenVerification,
} from '../data/entities'
import type {
  CandidateRow,
  ClaimRow,
  DecisionRow,
  LeadgenRepository,
  RunRow,
  VerificationRow,
} from './leadgen-service'
import type { CandidateStatus } from './candidate-rules'

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function runRow(row: LeadgenResearchRun): RunRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    source: row.source,
    runKey: row.runKey,
    status: row.status,
  }
}

function candidateRow(row: LeadgenCandidate): CandidateRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    runId: row.runId,
    submittedFingerprint: row.submittedFingerprint,
    companyDedupeKey: row.companyDedupeKey,
    companyName: row.companyName,
    companyDomain: row.companyDomain ?? null,
    companyCountry: row.companyCountry ?? null,
    contactName: row.contactName ?? null,
    contactTitle: row.contactTitle ?? null,
    contactEmail: row.contactEmail ?? null,
    contactEmailHash: row.contactEmailHash ?? null,
    sourceUrl: row.sourceUrl ?? null,
    claimId: row.claimId ?? null,
    crmEntityId: row.crmEntityId ?? null,
    crmWrittenAt: iso(row.crmWrittenAt),
    status: row.status as CandidateStatus,
    createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: iso(row.updatedAt) ?? new Date(0).toISOString(),
  }
}

function claimRow(row: LeadgenCompanyClaim): ClaimRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    companyDedupeKey: row.companyDedupeKey,
    displayName: row.displayName,
    crmEntityId: row.crmEntityId ?? null,
    ownerUserId: row.ownerUserId ?? null,
    state: row.state,
  }
}

function decisionRow(row: LeadgenCandidateDecision): DecisionRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    decisionKey: row.decisionKey,
    candidateId: row.candidateId,
    decision: row.decision,
    actorUserId: row.actorUserId,
    reasonCode: row.reasonCode ?? null,
    mergeTargetClaimId: row.mergeTargetClaimId ?? null,
    createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
  }
}

function verificationRow(row: LeadgenVerification): VerificationRow {
  return {
    id: row.id,
    candidateId: row.candidateId,
    verifierVersion: row.verifierVersion,
    inputDigest: row.inputDigest,
    verdict: row.verdict,
    rulesetHash: row.rulesetHash,
    checks: row.checks ?? null,
    startedAt: iso(row.startedAt) ?? new Date(0).toISOString(),
    completedAt: iso(row.completedAt),
  }
}

/**
 * The command bus returns the handler's value directly, or wraps it in `{ result }`
 * depending on the caller. Reading only `outcome.entityId` made every CRM write
 * fail with "returned no entityId" after the company had actually been created.
 */
export function commandResultEntityId(outcome: unknown): string | null {
  if (!outcome || typeof outcome !== 'object') return null
  const record = outcome as { result?: unknown; entityId?: unknown }
  const value = (record.result ?? record) as { entityId?: unknown }
  return typeof value?.entityId === 'string' && value.entityId.length > 0 ? value.entityId : null
}

export function createOrmLeadgenRepository(
  em: EntityManager,
  container: AwilixContainer,
): LeadgenRepository {
  const fork = () => em.fork()
  return {
    async findRun(input) {
      const row = await fork().findOne(LeadgenResearchRun, {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        source: input.source,
        runKey: input.runKey,
      })
      return row ? runRow(row) : null
    },

    async findRunById(input) {
      const row = await fork().findOne(LeadgenResearchRun, {
        id: input.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      })
      return row ? runRow(row) : null
    },

    async createRun(input) {
      const manager = fork()
      const row = manager.create(LeadgenResearchRun, {
        id: input.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        source: input.source,
        runKey: input.runKey,
        agentKey: input.agentKey ?? null,
        candidateCount: 0,
        status: 'open',
        createdAt: new Date(input.now),
        updatedAt: new Date(input.now),
      })
      manager.persist(row)
      await manager.flush()
      return runRow(row)
    },

    async findCandidateByFingerprint(input) {
      const row = await fork().findOne(LeadgenCandidate, {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        runId: input.runId,
        submittedFingerprint: input.fingerprint,
      })
      return row ? candidateRow(row) : null
    },

    async insertCandidate(input) {
      const manager = fork()
      const row = manager.create(LeadgenCandidate, {
        id: input.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        runId: input.runId,
        submittedFingerprint: input.submittedFingerprint,
        companyDedupeKey: input.companyDedupeKey,
        companyName: input.companyName,
        companyDomain: input.companyDomain,
        companyCountry: input.companyCountry,
        contactName: input.contactName,
        contactTitle: input.contactTitle,
        contactEmail: input.contactEmail,
        contactEmailHash: input.contactEmailHash,
        sourceUrl: input.sourceUrl,
        claimId: input.claimId,
        crmEntityId: input.crmEntityId,
        crmWrittenAt: input.crmWrittenAt ? new Date(input.crmWrittenAt) : null,
        status: input.status as LeadgenCandidate['status'],
        createdAt: new Date(input.createdAt),
        updatedAt: new Date(input.updatedAt),
      })
      manager.persist(row)
      await manager.flush()
      return candidateRow(row)
    },

    async getCandidate(input) {
      const row = await fork().findOne(LeadgenCandidate, {
        id: input.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        deletedAt: null,
      })
      return row ? candidateRow(row) : null
    },

    async listCandidates(input) {
      const where: Record<string, unknown> = {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        deletedAt: null,
      }
      if (input.status) where.status = input.status
      if (input.cursor) where.createdAt = { $lt: new Date(input.cursor) }
      const rows = await fork().find(LeadgenCandidate, where, {
        orderBy: { createdAt: 'desc' },
        limit: input.limit,
      })
      return rows.map(candidateRow)
    },

    async findDecisionByKey(input) {
      const row = await fork().findOne(LeadgenCandidateDecision, {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        decisionKey: input.decisionKey,
      })
      return row ? decisionRow(row) : null
    },

    async insertDecision(input) {
      const manager = fork()
      const row = manager.create(LeadgenCandidateDecision, {
        id: input.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        candidateId: input.candidateId,
        decision: input.decision,
        decisionKey: input.decisionKey,
        actorUserId: input.actorUserId,
        reasonCode: input.reasonCode ?? null,
        mergeTargetClaimId: input.mergeTargetClaimId ?? null,
        createdAt: new Date(input.now),
      })
      manager.persist(row)
      await manager.flush()
      return decisionRow(row)
    },

    async transition(input) {
      const manager = fork()
      const changed = await manager.nativeUpdate(
        LeadgenCandidate,
        {
          id: input.id,
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          status: { $in: [...input.from] } as never,
        },
        {
          status: input.to,
          updatedAt: new Date(input.now),
          ...(input.claimId === undefined ? {} : { claimId: input.claimId }),
        },
      )
      return changed === 1
    },

    async markCrmWritten(input) {
      const manager = fork()
      const changed = await manager.nativeUpdate(
        LeadgenCandidate,
        {
          id: input.id,
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          status: 'writing_crm',
        },
        { status: 'crm_written', crmEntityId: input.crmEntityId, crmWrittenAt: new Date(input.now), updatedAt: new Date(input.now) },
      )
      return changed === 1
    },

    async findClaim(input) {
      const row = await fork().findOne(LeadgenCompanyClaim, {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        companyDedupeKey: input.companyDedupeKey,
      })
      return row ? claimRow(row) : null
    },

    async createClaim(input) {
      const manager = fork()
      const row = manager.create(LeadgenCompanyClaim, {
        id: input.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        companyDedupeKey: input.companyDedupeKey,
        displayName: input.displayName,
        ownerUserId: input.ownerUserId,
        state: 'claimed',
        version: 1,
        createdAt: new Date(input.now),
        updatedAt: new Date(input.now),
      })
      manager.persist(row)
      await manager.flush()
      return claimRow(row)
    },

    async findVerification(input) {
      const row = await fork().findOne(LeadgenVerification, {
        candidateId: input.candidateId,
        verifierVersion: input.verifierVersion,
        inputDigest: input.inputDigest,
      })
      return row ? verificationRow(row) : null
    },

    async insertVerification(input) {
      const manager = fork()
      const row = manager.create(LeadgenVerification, {
        id: input.id,
        candidateId: input.candidateId,
        verifierVersion: input.verifierVersion,
        rulesetHash: input.rulesetHash,
        inputDigest: input.inputDigest,
        verdict: input.verdict as LeadgenVerification['verdict'],
        checks: input.checks as LeadgenVerification['checks'],
        startedAt: new Date(input.startedAt),
        completedAt: new Date(input.completedAt),
      })
      manager.persist(row)
      await manager.flush()
      return verificationRow(row)
    },

    async listEvidence(candidateId) {
      const rows = await fork().find(LeadgenCandidateEvidence, { candidateId }, { orderBy: { rank: 'asc' } })
      return rows.map((row) => ({
        url: row.url,
        fetchedAt: iso(row.fetchedAt) ?? new Date(0).toISOString(),
        contentHash: row.contentHash,
        fields: (row.fields as Record<string, string> | null) ?? null,
        kind: row.kind,
        httpStatus: row.httpStatus ?? null,
        excerpt: row.excerpt ?? null,
        method: row.method ?? null,
        adapter: row.adapter ?? null,
        rank: row.rank,
      }))
    },

    async insertEvidence(input) {
      if (input.evidence.length === 0) return
      const manager = fork()
      input.evidence.forEach((item, index) => {
        manager.persist(
          manager.create(LeadgenCandidateEvidence, {
            id: input.newId(),
            candidateId: input.candidateId,
            kind: item.kind ?? 'page',
            url: item.url,
            fetchedAt: new Date(item.fetchedAt),
            httpStatus: item.httpStatus ?? null,
            contentHash: item.contentHash,
            excerpt: item.excerpt ?? null,
            fields: item.fields ?? null,
            method: item.method ?? null,
            adapter: item.adapter ?? null,
            rank: item.rank ?? index,
            createdAt: new Date(input.now),
          }),
        )
      })
      await manager.flush()
    },

    async listVerifications(candidateId) {
      const rows = await fork().find(LeadgenVerification, { candidateId }, { orderBy: { startedAt: 'desc' } })
      return rows.map(verificationRow)
    },

    async createCrmCompany(input) {
      const commandBus = container.resolve('commandBus') as {
        execute: (name: string, payload: { input: Record<string, unknown>; ctx: unknown }) => Promise<unknown>
      }
      const result = (await commandBus.execute('customers.companies.create', {
        input: {
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          displayName: input.companyName,
          ...(input.domain ? { domain: input.domain } : {}),
        },
        ctx: {
          container,
          auth: { sub: input.actorUserId, tenantId: input.tenantId, orgId: input.organizationId },
          organizationScope: {
            selectedId: input.organizationId,
            filterIds: [input.organizationId],
            allowedIds: [input.organizationId],
            tenantId: input.tenantId,
          },
          selectedOrganizationId: input.organizationId,
          organizationIds: [input.organizationId],
        },
      }))
      const entityId = commandResultEntityId(result)
      if (!entityId) throw new Error('customers.companies.create returned no entityId')
      return entityId
    },
  }
}

export async function createRequestLeadgenRepository(): Promise<LeadgenRepository> {
  const { createRequestContainer } = await import('@open-mercato/shared/lib/di/container')
  const container = await createRequestContainer()
  const em = container.resolve<EntityManager>('em').fork()
  return createOrmLeadgenRepository(em, container)
}
