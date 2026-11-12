/** @jest-environment node */

/**
 * The M5 hand-offs, in order: a candidate that fails verification needs a human,
 * and the CRM write stays closed until that human approves. These are the two
 * places where an agent could otherwise skip the review gate.
 */

import { describe, expect, it, jest } from '@jest/globals'
import { createLeadgenService, type CandidateRow, type LeadgenRepository } from '../services/leadgen-service'

const NOW = '2026-11-12T06:00:00.000Z'

function candidate(overrides: Partial<CandidateRow> = {}): CandidateRow {
  return {
    id: 'cand-1', tenantId: 'tenant-1', organizationId: 'org-1', runId: 'run-1',
    submittedFingerprint: 'fp', companyDedupeKey: 'd:acme.example', companyName: 'Acme',
    companyDomain: 'acme.example', companyCountry: null, contactName: null, contactTitle: null,
    contactEmail: null, contactEmailHash: null, sourceUrl: null, claimId: null, crmEntityId: null,
    crmWrittenAt: null, status: 'submitted', createdAt: NOW, updatedAt: NOW, ...overrides,
  }
}

function repoFor(state: { candidates: CandidateRow[]; verifications: unknown[]; decisions: unknown[] }) {
  const repo: LeadgenRepository = {
    findRun: jest.fn(async () => null),
    findRunById: jest.fn(async () => null),
    createRun: jest.fn(async () => { throw new Error('unused') }),
    findCandidateByFingerprint: jest.fn(async () => null),
    insertCandidate: jest.fn(async (input: CandidateRow) => { state.candidates.push(input); return input }),
    getCandidate: jest.fn(async (input: { id: string }) => state.candidates.find((row) => row.id === input.id) ?? null),
    listCandidates: jest.fn(async () => state.candidates),
    findDecisionByKey: jest.fn(async () => null),
    insertDecision: jest.fn(async (input: { now: string }) => { state.decisions.push(input); return { ...input, createdAt: input.now } as never }),
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
    findClaim: jest.fn(async () => null),
    createClaim: jest.fn(async (input: { id: string; displayName: string; ownerUserId: string }) => ({
      id: input.id, tenantId: 'tenant-1', organizationId: 'org-1', companyDedupeKey: 'd:acme.example',
      displayName: input.displayName, crmEntityId: null, ownerUserId: input.ownerUserId, state: 'claimed',
    })),
    findVerification: jest.fn(async () => null),
    insertVerification: jest.fn(async (input: unknown) => { state.verifications.push(input); return input as never }),
    listEvidence: jest.fn(async () => []),
    insertEvidence: jest.fn(async () => undefined),
    listVerifications: jest.fn(async () => []),
    createCrmCompany: jest.fn(async () => 'crm-1'),
  }
  return repo
}

describe('M5 review gate', () => {
  it('a failing verification moves the candidate to needs_review and CRM write stays closed', async () => {
    const state = { candidates: [candidate()], verifications: [], decisions: [] }
    const service = createLeadgenService({ repo: repoFor(state), now: () => NOW, newId: () => 'id-1' })
    const verified = await service.verify({
      tenantId: 'tenant-1', organizationId: 'org-1', candidateId: 'cand-1',
      verifierVersion: 'v1', rulesetHash: 'rules', mxChecked: false, verdict: 'fail', checks: [],
    })
    expect(verified.ok).toBe(true)
    expect(state.candidates[0].status).toBe('needs_review')
    await expect(
      service.crmWrite({ tenantId: 'tenant-1', organizationId: 'org-1', candidateId: 'cand-1', actorUserId: 'user-1' }),
    ).resolves.toMatchObject({ ok: false, code: 'not_approved' })
  })

  it('a passing verification still waits for a human before the write', async () => {
    const state = { candidates: [candidate()], verifications: [], decisions: [] }
    const service = createLeadgenService({ repo: repoFor(state), now: () => NOW, newId: () => 'id-1' })
    await service.verify({
      tenantId: 'tenant-1', organizationId: 'org-1', candidateId: 'cand-1',
      verifierVersion: 'v1', rulesetHash: 'rules', mxChecked: false, verdict: 'pass', checks: [],
    })
    expect(state.candidates[0].status).toBe('submitted')
    await expect(
      service.crmWrite({ tenantId: 'tenant-1', organizationId: 'org-1', candidateId: 'cand-1', actorUserId: 'user-1' }),
    ).resolves.toMatchObject({ ok: false, code: 'not_approved' })
    const decided = await service.decide({
      tenantId: 'tenant-1', organizationId: 'org-1', candidateId: 'cand-1',
      decision: 'approve', decisionKey: 'decision-key-9', actorUserId: 'user-1',
    })
    expect(decided.ok).toBe(true)
    const written = await service.crmWrite({ tenantId: 'tenant-1', organizationId: 'org-1', candidateId: 'cand-1', actorUserId: 'user-1' })
    expect(written.ok && written.value.crmEntityId).toBe('crm-1')
  })
})
