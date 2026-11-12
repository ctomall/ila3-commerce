/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals'
import {
  createLeadgenService,
  type CandidateRow,
  type ClaimRow,
  type LeadgenRepository,
  type RunRow,
  type VerificationRow,
  type DecisionRow,
} from '../services/leadgen-service'

const NOW = '2026-11-12T06:00:00.000Z'

function candidate(overrides: Partial<CandidateRow> = {}): CandidateRow {
  return {
    id: 'cand-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    runId: 'run-1',
    submittedFingerprint: 'fp',
    companyDedupeKey: 'd:acme.example',
    companyName: 'Acme',
    companyDomain: 'acme.example',
    companyCountry: null,
    contactName: null,
    contactTitle: null,
    contactEmail: null,
    contactEmailHash: null,
    sourceUrl: null,
    claimId: null,
    crmEntityId: null,
    crmWrittenAt: null,
    status: 'submitted',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function makeRepo(overrides: Partial<LeadgenRepository> = {}) {
  const state = {
    runs: [] as RunRow[],
    candidates: [] as CandidateRow[],
    decisions: [] as DecisionRow[],
    claims: [] as ClaimRow[],
    verifications: [] as VerificationRow[],
  }
  const base: LeadgenRepository = {
    findRun: jest.fn(async (input: { tenantId: string; organizationId: string; source: string; runKey: string }) =>
      state.runs.find((run) => run.runKey === input.runKey && run.tenantId === input.tenantId) ?? null,
    ),
    findRunById: jest.fn(async (input: { id: string }) => state.runs.find((run) => run.id === input.id) ?? null),
    createRun: jest.fn(async (input: { id: string; tenantId: string; organizationId: string; source: string; runKey: string; now: string }) => {
      const run: RunRow = { id: input.id, tenantId: input.tenantId, organizationId: input.organizationId, source: input.source, runKey: input.runKey, status: 'open' }
      state.runs.push(run)
      return run
    }),
    findCandidateByFingerprint: jest.fn(async (input: { tenantId: string; runId: string; fingerprint: string }) =>
      state.candidates.find((row) => row.runId === input.runId && row.submittedFingerprint === input.fingerprint) ?? null,
    ),
    insertCandidate: jest.fn(async (input: CandidateRow) => {
      state.candidates.push(input)
      return input
    }),
    getCandidate: jest.fn(async (input: { id: string }) => state.candidates.find((row) => row.id === input.id) ?? null),
    listCandidates: jest.fn(async () => state.candidates),
    findDecisionByKey: jest.fn(async (input: { decisionKey: string }) =>
      state.decisions.find((row) => row.decisionKey === input.decisionKey) ?? null,
    ),
    insertDecision: jest.fn(async (input: Omit<DecisionRow, 'id' | 'createdAt'> & { now: string; id: string }) => {
      const row: DecisionRow = { ...input, createdAt: input.now }
      state.decisions.push(row)
      return row
    }),
    transition: jest.fn(async (input: { id: string; from: readonly CandidateRow['status'][]; to: CandidateRow['status'] }) => {
      const row = state.candidates.find((entry) => entry.id === input.id)
      if (!row || !input.from.includes(row.status)) return false
      row.status = input.to
      return true
    }),
    markCrmWritten: jest.fn(async (input: { id: string; crmEntityId: string }) => {
      const row = state.candidates.find((entry) => entry.id === input.id)
      if (!row || row.status !== 'writing_crm') return false
      row.status = 'crm_written'
      row.crmEntityId = input.crmEntityId
      return true
    }),
    findClaim: jest.fn(async (input: { companyDedupeKey: string }) =>
      state.claims.find((row) => row.companyDedupeKey === input.companyDedupeKey) ?? null,
    ),
    createClaim: jest.fn(async (input: { id: string; companyDedupeKey: string; displayName: string; ownerUserId: string }) => {
      const row: ClaimRow = {
        id: input.id,
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        companyDedupeKey: input.companyDedupeKey,
        displayName: input.displayName,
        crmEntityId: null,
        ownerUserId: input.ownerUserId,
        state: 'claimed',
      }
      state.claims.push(row)
      return row
    }),
    findVerification: jest.fn(async (input: { candidateId: string; verifierVersion: string; inputDigest: string }) =>
      state.verifications.find(
        (row) => row.candidateId === input.candidateId && row.verifierVersion === input.verifierVersion && row.inputDigest === input.inputDigest,
      ) ?? null,
    ),
    insertVerification: jest.fn(async (input: VerificationRow) => {
      state.verifications.push(input)
      return input
    }),
    listEvidence: jest.fn(async () => []),
    insertEvidence: jest.fn(async () => undefined),
    listVerifications: jest.fn(async () => state.verifications),
    createCrmCompany: jest.fn(async () => 'crm-company-1'),
    ...overrides,
  }
  return { repo: base, state }
}

const serviceFor = (repo: LeadgenRepository) =>
  createLeadgenService({ repo, now: () => NOW, newId: (() => {
    let n = 0
    return () => `id-${++n}`
  })() })

describe('leadgen service — review and intake', () => {
  it('replays a decision with the same key and refuses a second decision with another key', async () => {
    const { repo, state } = makeRepo()
    state.candidates.push(candidate())
    const service = serviceFor(repo)
    const first = await service.decide({
      tenantId: 'tenant-1', organizationId: 'org-1', candidateId: 'cand-1',
      decision: 'approve', decisionKey: 'decision-key-1', actorUserId: 'user-1',
    })
    expect(first.ok).toBe(true)
    const replay = await service.decide({
      tenantId: 'tenant-1', organizationId: 'org-1', candidateId: 'cand-1',
      decision: 'approve', decisionKey: 'decision-key-1', actorUserId: 'user-1',
    })
    expect(replay.ok && replay.value.replayed).toBe(true)
    const conflicting = await service.decide({
      tenantId: 'tenant-1', organizationId: 'org-1', candidateId: 'cand-1',
      decision: 'reject', decisionKey: 'decision-key-2', actorUserId: 'user-1',
    })
    expect(conflicting).toMatchObject({ ok: false, code: 'already_decided' })
  })

  it('requires a merge target and refuses writes before approval', async () => {
    const { repo, state } = makeRepo()
    state.candidates.push(candidate())
    const service = serviceFor(repo)
    await expect(
      service.decide({ tenantId: 'tenant-1', organizationId: 'org-1', candidateId: 'cand-1', decision: 'merge', decisionKey: 'k-merge', actorUserId: 'user-1' }),
    ).resolves.toMatchObject({ ok: false, code: 'merge_target_required' })
    await expect(
      service.crmWrite({ tenantId: 'tenant-1', organizationId: 'org-1', candidateId: 'cand-1', actorUserId: 'user-1' }),
    ).resolves.toMatchObject({ ok: false, code: 'not_approved' })
  })

  it('writes the CRM company exactly once for an approved candidate', async () => {
    const { repo, state } = makeRepo()
    state.candidates.push(candidate({ status: 'approved' }))
    const service = serviceFor(repo)
    const first = await service.crmWrite({ tenantId: 'tenant-1', organizationId: 'org-1', candidateId: 'cand-1', actorUserId: 'user-1' })
    expect(first).toMatchObject({ ok: true, value: { crmEntityId: 'crm-company-1', created: true } })
    const again = await service.crmWrite({ tenantId: 'tenant-1', organizationId: 'org-1', candidateId: 'cand-1', actorUserId: 'user-1' })
    expect(again).toMatchObject({ ok: true, value: { crmEntityId: 'crm-company-1', created: false } })
    expect(repo.createCrmCompany).toHaveBeenCalledTimes(1)
    expect(state.candidates[0].status).toBe('crm_written')
  })

  it('reports only the foreign claim owner on a conflict', async () => {
    const { repo, state } = makeRepo()
    state.candidates.push(candidate({ status: 'approved' }))
    state.claims.push({
      id: 'claim-1', tenantId: 'tenant-1', organizationId: 'org-1', companyDedupeKey: 'd:acme.example',
      displayName: 'Acme', crmEntityId: null, ownerUserId: 'user-2', state: 'claimed',
    })
    const service = serviceFor(repo)
    await expect(
      service.crmWrite({ tenantId: 'tenant-1', organizationId: 'org-1', candidateId: 'cand-1', actorUserId: 'user-1' }),
    ).resolves.toEqual({ ok: false, code: 'claim_conflict', extra: { ownerUserId: 'user-2' } })
    expect(repo.createCrmCompany).not.toHaveBeenCalled()
  })

  it('returns the candidate to approved when the CRM create fails', async () => {
    const { repo, state } = makeRepo({ createCrmCompany: jest.fn(async () => { throw new Error('crm down') }) })
    state.candidates.push(candidate({ status: 'approved' }))
    const service = serviceFor(repo)
    await expect(
      service.crmWrite({ tenantId: 'tenant-1', organizationId: 'org-1', candidateId: 'cand-1', actorUserId: 'user-1' }),
    ).resolves.toMatchObject({ ok: false, code: 'crm_write_failed' })
    expect(state.candidates[0].status).toBe('approved')
  })

  it('reuses a stored verification for the same candidate, version and MX flag', async () => {
    const { repo, state } = makeRepo()
    state.candidates.push(candidate())
    const service = serviceFor(repo)
    const input = {
      tenantId: 'tenant-1', organizationId: 'org-1', candidateId: 'cand-1',
      verifierVersion: 'verifier-v1', rulesetHash: 'rules-1', mxChecked: false,
      verdict: 'pass', checks: [],
    }
    const first = await service.verify(input)
    const second = await service.verify(input)
    expect(first.ok && first.value.cached).toBe(false)
    expect(second.ok && second.value.cached).toBe(true)
    expect(repo.insertVerification).toHaveBeenCalledTimes(1)
  })

  it('dedupes candidate intake by fingerprint inside a run', async () => {
    const { repo, state } = makeRepo()
    state.runs.push({ id: 'run-1', tenantId: 'tenant-1', organizationId: 'org-1', source: 'dsh', runKey: 'run-key-123', status: 'open' })
    const service = serviceFor(repo)
    const input = { tenantId: 'tenant-1', organizationId: 'org-1', runId: 'run-1', companyName: 'Acme', domain: 'acme.example' }
    const first = await service.submitCandidate(input)
    const second = await service.submitCandidate(input)
    expect(first.ok && first.value.created).toBe(true)
    expect(second.ok && second.value.created).toBe(false)
    expect(state.candidates).toHaveLength(1)
  })
})
