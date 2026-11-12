/**
 * M5 candidate service: intake, review decision and idempotent CRM write.
 *
 * The service owns the sequence; the repository owns SQL. Every dependency is
 * injected (repository, clock, ids, company creator), so the contract rules —
 * replay, already-decided, claim conflict, one CRM write — are tested against a
 * fake repository without a database.
 */
import {
  candidateDedupeKey,
  candidateFingerprint,
  planCrmWrite,
  planDecision,
  verificationInputDigest,
  type CandidateDecision,
  type CandidateStatus,
} from './candidate-rules'

export type RunRow = {
  id: string
  tenantId: string
  organizationId: string
  source: string
  runKey: string
  status: string
}

export type CandidateRow = {
  id: string
  tenantId: string
  organizationId: string
  runId: string
  submittedFingerprint: string
  companyDedupeKey: string
  companyName: string
  companyDomain: string | null
  companyCountry: string | null
  contactName: string | null
  contactTitle: string | null
  contactEmail: string | null
  contactEmailHash: string | null
  sourceUrl: string | null
  claimId: string | null
  crmEntityId: string | null
  crmWrittenAt: string | null
  status: CandidateStatus
  createdAt: string
  updatedAt: string
}

export type ClaimRow = {
  id: string
  tenantId: string
  organizationId: string
  companyDedupeKey: string
  displayName: string
  crmEntityId: string | null
  ownerUserId: string | null
  state: string
}

export type DecisionRow = {
  id: string
  tenantId: string
  organizationId: string
  decisionKey: string
  candidateId: string
  decision: CandidateDecision
  actorUserId: string
  reasonCode: string | null
  mergeTargetClaimId: string | null
  createdAt: string
}

export type VerificationRow = {
  id: string
  candidateId: string
  verifierVersion: string
  inputDigest: string
  verdict: string
  rulesetHash: string
  checks: unknown
  startedAt: string
  completedAt: string | null
}

export type LeadgenRepository = {
  findRun(input: {
    tenantId: string
    organizationId: string
    source: string
    runKey: string
  }): Promise<RunRow | null>
  createRun(input: {
    tenantId: string
    organizationId: string
    source: string
    runKey: string
    agentKey?: string | null
    productMarket?: string | null
    now: string
    id: string
  }): Promise<RunRow>
  findCandidateByFingerprint(input: {
    tenantId: string
    organizationId: string
    runId: string
    fingerprint: string
  }): Promise<CandidateRow | null>
  insertCandidate(input: CandidateRow): Promise<CandidateRow>
  getCandidate(input: {
    tenantId: string
    organizationId: string
    id: string
  }): Promise<CandidateRow | null>
  listCandidates(input: {
    tenantId: string
    organizationId: string
    status?: CandidateStatus
    cursor?: string | null
    limit: number
  }): Promise<CandidateRow[]>
  findDecisionByKey(input: {
    tenantId: string
    organizationId: string
    decisionKey: string
  }): Promise<DecisionRow | null>
  insertDecision(input: Omit<DecisionRow, 'id' | 'createdAt'> & { now: string; id: string }): Promise<DecisionRow>
  /** Compare-and-set on the candidate status; false means another writer won. */
  transition(input: {
    tenantId: string
    organizationId: string
    id: string
    from: readonly CandidateStatus[]
    to: CandidateStatus
    now: string
    claimId?: string | null
  }): Promise<boolean>
  markCrmWritten(input: {
    tenantId: string
    organizationId: string
    id: string
    crmEntityId: string
    now: string
  }): Promise<boolean>
  findClaim(input: {
    tenantId: string
    organizationId: string
    companyDedupeKey: string
  }): Promise<ClaimRow | null>
  createClaim(input: {
    tenantId: string
    organizationId: string
    companyDedupeKey: string
    displayName: string
    ownerUserId: string
    now: string
    id: string
  }): Promise<ClaimRow>
  findVerification(input: {
    candidateId: string
    verifierVersion: string
    inputDigest: string
  }): Promise<VerificationRow | null>
  insertVerification(input: {
    id: string
    candidateId: string
    verifierVersion: string
    rulesetHash: string
    inputDigest: string
    verdict: string
    checks: unknown
    startedAt: string
    completedAt: string
  }): Promise<VerificationRow>
  listEvidence(candidateId: string): Promise<unknown[]>
  listVerifications(candidateId: string): Promise<VerificationRow[]>
  /** Creates the CRM company through the existing command bus and returns its id. */
  createCrmCompany(input: {
    tenantId: string
    organizationId: string
    actorUserId: string
    companyName: string
    domain: string | null
  }): Promise<string>
}

export type ServiceDeps = {
  repo: LeadgenRepository
  now: () => string
  newId: () => string
}

export type LeadgenError =
  | 'candidate_not_found'
  | 'run_not_found'
  | 'already_decided'
  | 'merge_target_required'
  | 'claim_conflict'
  | 'write_in_progress'
  | 'not_approved'
  | 'crm_write_failed'
  | 'invalid_input'
  | 'unknown_status'

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; code: LeadgenError; extra?: Record<string, unknown> }

export type SubmitCandidateInput = {
  tenantId: string
  organizationId: string
  runId: string
  companyName: string
  domain?: string | null
  country?: string | null
  contactName?: string | null
  contactTitle?: string | null
  contactEmail?: string | null
  sourceUrl?: string | null
}

export type DecisionInput = {
  tenantId: string
  organizationId: string
  candidateId: string
  decision: CandidateDecision
  decisionKey: string
  actorUserId: string
  mergeTargetClaimId?: string | null
  reasonCode?: string | null
}

export type CrmWriteInput = {
  tenantId: string
  organizationId: string
  candidateId: string
  actorUserId: string
}

export function createLeadgenService(deps: ServiceDeps) {
  const { repo, now, newId } = deps

  async function createRun(input: {
    tenantId: string
    organizationId: string
    source: 'dsh' | 'manual'
    runKey: string
    agentKey?: string | null
  }): Promise<ServiceResult<{ run: RunRow; created: boolean }>> {
    if (!input.runKey || input.runKey.trim().length < 8) return { ok: false, code: 'invalid_input' }
    const existing = await repo.findRun(input)
    if (existing) return { ok: true, value: { run: existing, created: false } }
    const run = await repo.createRun({
      ...input,
      agentKey: input.agentKey ?? null,
      now: now(),
      id: newId(),
    })
    return { ok: true, value: { run, created: true } }
  }

  async function submitCandidate(input: SubmitCandidateInput): Promise<
    ServiceResult<{ candidate: CandidateRow; created: boolean }>
  > {
    const companyName = input.companyName?.trim()
    if (!companyName) return { ok: false, code: 'invalid_input' }
    const dedupeKey = candidateDedupeKey({
      companyName,
      domain: input.domain,
      country: input.country,
    })
    if (!dedupeKey) return { ok: false, code: 'invalid_input' }
    const run = await repo.findRun({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      source: 'dsh',
      runKey: input.runId,
    })
    if (!run) return { ok: false, code: 'run_not_found' }
    const fingerprint = candidateFingerprint({
      companyName,
      domain: input.domain,
      contactEmail: input.contactEmail,
      sourceUrl: input.sourceUrl,
    })
    const existing = await repo.findCandidateByFingerprint({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      runId: run.id,
      fingerprint,
    })
    if (existing) return { ok: true, value: { candidate: existing, created: false } }
    const at = now()
    const candidate = await repo.insertCandidate({
      id: newId(),
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      runId: run.id,
      submittedFingerprint: fingerprint,
      companyDedupeKey: dedupeKey,
      companyName,
      companyDomain: input.domain ?? null,
      companyCountry: input.country ?? null,
      contactName: input.contactName ?? null,
      contactTitle: input.contactTitle ?? null,
      contactEmail: input.contactEmail ?? null,
      contactEmailHash: null,
      sourceUrl: input.sourceUrl ?? null,
      claimId: null,
      crmEntityId: null,
      crmWrittenAt: null,
      status: 'submitted',
      createdAt: at,
      updatedAt: at,
    })
    return { ok: true, value: { candidate, created: true } }
  }

  async function decide(input: DecisionInput): Promise<
    ServiceResult<{ candidate: CandidateRow; decision: DecisionRow; replayed: boolean }>
  > {
    const replay = await repo.findDecisionByKey(input)
    const lookup = {
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      id: input.candidateId,
    }
    if (replay) {
      const candidate = await repo.getCandidate(lookup)
      if (!candidate) return { ok: false, code: 'candidate_not_found' }
      return { ok: true, value: { candidate, decision: replay, replayed: true } }
    }
    const candidate = await repo.getCandidate(lookup)
    if (!candidate) return { ok: false, code: 'candidate_not_found' }
    const plan = planDecision({
      status: candidate.status,
      decision: input.decision,
      mergeTargetClaimId: input.mergeTargetClaimId,
    })
    if (!plan.ok) return { ok: false, code: plan.code }
    const at = now()
    const moved = await repo.transition({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      id: candidate.id,
      from: ['submitted', 'needs_review'],
      to: plan.next,
      now: at,
      claimId: input.decision === 'merge' ? input.mergeTargetClaimId ?? null : null,
    })
    if (!moved) {
      // Two different decision keys raced: the loser reports 409, the same-key
      // retry was already answered above as a replay.
      return { ok: false, code: 'already_decided' }
    }
    const decision = await repo.insertDecision({
      id: newId(),
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      decisionKey: input.decisionKey,
      candidateId: candidate.id,
      decision: input.decision,
      actorUserId: input.actorUserId,
      reasonCode: input.reasonCode ?? null,
      mergeTargetClaimId: input.mergeTargetClaimId ?? null,
      now: at,
    })
    return {
      ok: true,
      value: { candidate: { ...candidate, status: plan.next, updatedAt: at }, decision, replayed: false },
    }
  }

  async function crmWrite(input: CrmWriteInput): Promise<
    ServiceResult<{ crmEntityId: string; created: boolean; claimId: string | null }>
  > {
    const candidate = await repo.getCandidate({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      id: input.candidateId,
    })
    if (!candidate) return { ok: false, code: 'candidate_not_found' }
    const claim = await repo.findClaim({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      companyDedupeKey: candidate.companyDedupeKey,
    })
    const plan = planCrmWrite({
      status: candidate.status,
      crmEntityId: candidate.crmEntityId,
      callerUserId: input.actorUserId,
      claimOwnerUserId: claim?.ownerUserId ?? null,
    })
    if (plan.action === 'already_written') {
      return { ok: true, value: { crmEntityId: plan.crmEntityId, created: false, claimId: claim?.id ?? null } }
    }
    if (plan.action === 'claim_conflict') {
      return { ok: false, code: 'claim_conflict', extra: { ownerUserId: plan.ownerUserId } }
    }
    if (plan.action === 'in_progress') return { ok: false, code: 'write_in_progress' }
    if (plan.action === 'not_approved') return { ok: false, code: 'not_approved' }

    const at = now()
    // Claim the write before calling the CRM: a crash leaves `writing`, which a
    // reviewer can see, and a second request cannot create a second company.
    const claimed = await repo.transition({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      id: candidate.id,
      from: ['approved'],
      to: 'writing_crm',
      now: at,
    })
    if (!claimed) return { ok: false, code: 'write_in_progress' }

    const ownedClaim =
      claim ??
      (await repo.createClaim({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        companyDedupeKey: candidate.companyDedupeKey,
        displayName: candidate.companyName,
        ownerUserId: input.actorUserId,
        now: at,
        id: newId(),
      }))
    if (ownedClaim.ownerUserId && ownedClaim.ownerUserId !== input.actorUserId) {
      return { ok: false, code: 'claim_conflict', extra: { ownerUserId: ownedClaim.ownerUserId } }
    }

    let crmEntityId: string
    try {
      crmEntityId = await repo.createCrmCompany({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        companyName: candidate.companyName,
        domain: candidate.companyDomain,
      })
    } catch {
      // Hand the candidate back so the reviewer can retry; nothing was written.
      await repo.transition({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        id: candidate.id,
        from: ['writing_crm'],
        to: 'approved',
        now: now(),
      })
      return { ok: false, code: 'crm_write_failed' }
    }
    await repo.markCrmWritten({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      id: candidate.id,
      crmEntityId,
      now: now(),
    })
    return { ok: true, value: { crmEntityId, created: true, claimId: ownedClaim.id } }
  }

  async function verify(input: {
    tenantId: string
    organizationId: string
    candidateId: string
    verifierVersion: string
    rulesetHash: string
    mxChecked: boolean
    verdict: string
    checks: unknown
  }): Promise<ServiceResult<{ verification: VerificationRow; cached: boolean }>> {
    const candidate = await repo.getCandidate({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      id: input.candidateId,
    })
    if (!candidate) return { ok: false, code: 'candidate_not_found' }
    const inputDigest = verificationInputDigest({
      candidateId: candidate.id,
      verifierVersion: input.verifierVersion,
      mxChecked: input.mxChecked,
      fields: {
        companyName: candidate.companyName,
        domain: candidate.companyDomain,
        country: candidate.companyCountry,
        contactEmail: candidate.contactEmail,
        sourceUrl: candidate.sourceUrl,
      },
    })
    const existing = await repo.findVerification({
      candidateId: candidate.id,
      verifierVersion: input.verifierVersion,
      inputDigest,
    })
    if (existing) return { ok: true, value: { verification: existing, cached: true } }
    const at = now()
    const verification = await repo.insertVerification({
      id: newId(),
      candidateId: candidate.id,
      verifierVersion: input.verifierVersion,
      rulesetHash: input.rulesetHash,
      inputDigest,
      verdict: input.verdict,
      checks: input.checks,
      startedAt: at,
      completedAt: at,
    })
    // A passing verification still awaits a human: it must not become approved
    // without a decision, so only a failing verdict changes the status.
    if (input.verdict !== 'pass') {
      await repo.transition({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        id: candidate.id,
        from: ['submitted'],
        to: 'needs_review',
        now: at,
      })
    }
    return { ok: true, value: { verification, cached: false } }
  }

  return { createRun, submitCandidate, decide, crmWrite, verify }
}

export type LeadgenService = ReturnType<typeof createLeadgenService>
