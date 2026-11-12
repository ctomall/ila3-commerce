/** @jest-environment node */

import { describe, expect, it } from '@jest/globals'
import {
  candidateDedupeKey,
  candidateFingerprint,
  planCrmWrite,
  planDecision,
  verificationInputDigest,
} from '../services/candidate-rules'

describe('planDecision', () => {
  it('approves, rejects and merges only from a decidable status', () => {
    expect(planDecision({ status: 'submitted', decision: 'approve' })).toEqual({ ok: true, next: 'approved' })
    expect(planDecision({ status: 'submitted', decision: 'reject' })).toEqual({ ok: true, next: 'rejected' })
    expect(
      planDecision({ status: 'needs_review', decision: 'merge', mergeTargetClaimId: 'claim-1' }),
    ).toEqual({ ok: true, next: 'merged' })
  })

  it('refuses a merge without a target', () => {
    expect(planDecision({ status: 'submitted', decision: 'merge' })).toEqual({
      ok: false,
      code: 'merge_target_required',
    })
  })

  it('refuses to decide twice', () => {
    for (const status of ['approved', 'rejected', 'merged', 'crm_written'] as const) {
      expect(planDecision({ status, decision: 'approve' })).toEqual({ ok: false, code: 'already_decided' })
    }
  })
})

describe('candidate fingerprints', () => {
  it('is stable across whitespace and case', () => {
    const a = candidateFingerprint({ companyName: ' Acme  GmbH ', domain: 'ACME.example' })
    const b = candidateFingerprint({ companyName: 'acme gmbh', domain: 'acme.example' })
    expect(a).toBe(b)
  })

  it('changes when the contact or source changes', () => {
    const base = { companyName: 'Acme', domain: 'acme.example' }
    expect(candidateFingerprint({ ...base, contactEmail: 'a@acme.example' })).not.toBe(
      candidateFingerprint({ ...base, contactEmail: 'b@acme.example' }),
    )
  })

  it('uses the shared company dedupe key (domain before name)', () => {
    expect(candidateDedupeKey({ companyName: 'Acme', domain: 'https://www.acme.example/x' })).toBe(
      'd:acme.example',
    )
    expect(candidateDedupeKey({ companyName: 'Acme', taxId: 'DE 123 456', country: 'de' })).toBe(
      't:DE:de123456',
    )
    expect(candidateDedupeKey({ companyName: '' })).toBeNull()
  })
})

describe('planCrmWrite', () => {
  const base = { callerUserId: 'user-1' }

  it('allows one write for an approved candidate', () => {
    expect(planCrmWrite({ ...base, status: 'approved' })).toEqual({ action: 'create' })
  })

  it('replays the existing company instead of writing twice', () => {
    expect(planCrmWrite({ ...base, status: 'crm_written', crmEntityId: 'c-1' })).toEqual({
      action: 'already_written',
      crmEntityId: 'c-1',
    })
  })

  it('refuses before approval and while another request is writing', () => {
    expect(planCrmWrite({ ...base, status: 'submitted' })).toEqual({ action: 'not_approved', status: 'submitted' })
    expect(planCrmWrite({ ...base, status: 'writing_crm' })).toEqual({ action: 'in_progress' })
  })

  it('reports only the owner on a claim conflict', () => {
    expect(planCrmWrite({ ...base, status: 'approved', claimOwnerUserId: 'user-2' })).toEqual({
      action: 'claim_conflict',
      ownerUserId: 'user-2',
    })
  })
})

describe('verificationInputDigest', () => {
  it('ignores field order and changes with the MX flag', () => {
    const a = verificationInputDigest({
      candidateId: 'c-1',
      verifierVersion: 'v1',
      mxChecked: false,
      fields: { companyName: 'Acme', domain: 'acme.example' },
    })
    const b = verificationInputDigest({
      candidateId: 'c-1',
      verifierVersion: 'v1',
      mxChecked: false,
      fields: { domain: 'acme.example', companyName: 'Acme' },
    })
    const c = verificationInputDigest({
      candidateId: 'c-1',
      verifierVersion: 'v1',
      mxChecked: true,
      fields: { companyName: 'Acme', domain: 'acme.example' },
    })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})
