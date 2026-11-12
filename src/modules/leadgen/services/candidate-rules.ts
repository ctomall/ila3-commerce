/**
 * M5 candidate state machine and idempotency keys, as pure functions.
 *
 * The rules layer (`src/lib/leadgen/*`) already decides whether a candidate is
 * verifiable; this module decides what a *human* decision does to a stored row
 * and when a CRM write is allowed. Keeping it pure means the route can be a thin
 * adapter and the interesting cases (replay, already-decided, merge without a
 * target, double write) are unit tested without a database.
 *
 * Status vocabulary:
 *   submitted  -> accepted for review (a verification may have passed or not run)
 *   needs_review -> verification asked for a human
 *   approved   -> a human approved; CRM write allowed exactly once
 *   rejected   -> a human rejected; terminal
 *   merged     -> a human merged it into an existing claim; terminal for this row
 *   writing_crm -> one request claimed the CRM write
 *   crm_written -> the CRM company exists and crm_entity_id is set
 */
import { createHash } from 'node:crypto'
import { companyDedupeKey } from '@/lib/leadgen/verification'

export type CandidateStatus =
  | 'submitted'
  | 'needs_review'
  | 'approved'
  | 'rejected'
  | 'merged'
  | 'writing_crm'
  | 'crm_written'
  | 'failed'

export type CandidateDecision = 'approve' | 'reject' | 'merge'

/** Statuses a human may still decide on. */
export const DECIDABLE: readonly CandidateStatus[] = ['submitted', 'needs_review']

export type DecisionPlan =
  | { ok: true; next: 'approved' | 'rejected' | 'merged' }
  | { ok: false; code: 'already_decided' | 'merge_target_required' | 'unknown_status' }

export function planDecision(input: {
  status: CandidateStatus
  decision: CandidateDecision
  mergeTargetClaimId?: string | null
}): DecisionPlan {
  if (!DECIDABLE.includes(input.status)) return { ok: false, code: 'already_decided' }
  if (input.decision === 'merge' && !input.mergeTargetClaimId) {
    return { ok: false, code: 'merge_target_required' }
  }
  if (input.decision === 'approve') return { ok: true, next: 'approved' }
  if (input.decision === 'reject') return { ok: true, next: 'rejected' }
  return { ok: true, next: 'merged' }
}

/** Same input in, same id: a retried submission must not create a second candidate. */
export function candidateFingerprint(input: {
  companyName: string
  domain?: string | null
  contactEmail?: string | null
  sourceUrl?: string | null
}): string {
  const canonical = [
    String(input.companyName ?? '').trim().toLowerCase().replace(/\s+/g, ' '),
    String(input.domain ?? '').trim().toLowerCase(),
    String(input.contactEmail ?? '').trim().toLowerCase(),
    String(input.sourceUrl ?? '').trim(),
  ].join('\u0000')
  return createHash('sha256').update(canonical).digest('hex')
}

/** Company-level dedupe key; null means the input cannot be deduped and is refused. */
export function candidateDedupeKey(input: {
  companyName: string
  domain?: string | null
  country?: string | null
  taxId?: string | null
}): string | null {
  return companyDedupeKey({
    name: input.companyName,
    domain: input.domain,
    country: input.country,
    taxId: input.taxId,
  })
}

export type CrmWritePlan =
  | { action: 'create' }
  | { action: 'already_written'; crmEntityId: string }
  | { action: 'not_approved'; status: CandidateStatus }
  | { action: 'claim_conflict'; ownerUserId: string }
  | { action: 'in_progress' }

/**
 * Decide what one crm-write request may do.
 *
 * `claimOwnerUserId` is the owner of the company claim row (or null when no
 * claim exists yet). A claim owned by someone else is a conflict and the
 * response may name that owner — the contract asks for exactly that and nothing
 * else about the other employee.
 */
export function planCrmWrite(input: {
  status: CandidateStatus
  crmEntityId?: string | null
  callerUserId: string
  claimOwnerUserId?: string | null
}): CrmWritePlan {
  if (input.crmEntityId) return { action: 'already_written', crmEntityId: input.crmEntityId }
  if (input.status === 'writing_crm') return { action: 'in_progress' }
  if (input.status !== 'approved') return { action: 'not_approved', status: input.status }
  if (input.claimOwnerUserId && input.claimOwnerUserId !== input.callerUserId) {
    return { action: 'claim_conflict', ownerUserId: input.claimOwnerUserId }
  }
  return { action: 'create' }
}

/**
 * Deterministic verification input digest: same candidate + verifier version + MX
 * flag means the stored verdict is reused instead of recomputed.
 */
export function verificationInputDigest(input: {
  candidateId: string
  verifierVersion: string
  mxChecked: boolean
  fields: Record<string, string | null | undefined>
}): string {
  const canonical = JSON.stringify({
    candidateId: input.candidateId,
    verifierVersion: input.verifierVersion,
    mxChecked: input.mxChecked,
    fields: Object.fromEntries(
      Object.keys(input.fields)
        .sort()
        .map((key) => [key, input.fields[key] ?? null]),
    ),
  })
  return createHash('sha256').update(canonical).digest('hex')
}
