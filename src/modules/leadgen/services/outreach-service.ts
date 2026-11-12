/**
 * M6 internal draft/approval layer — no sending.
 *
 * The external effect (actually mailing) stays behind a separate authorization.
 * What is implemented here is the part M4 needs to test: an approval is bound to
 * the exact draft body hash, so changing the body, or reusing an approval for a
 * different draft, is refused. Creating a draft and approving it never contacts a
 * provider.
 */
import { createHash } from 'node:crypto'

export type DraftRow = {
  id: string
  tenantId: string
  organizationId: string
  candidateId: string
  recipientEmail: string
  recipientHash: string
  channel: string
  subject: string
  bodyMarkdown: string
  bodyHash: string
  status: 'editing' | 'ready' | 'approved' | 'sent' | 'superseded' | 'blocked'
  version: number
  createdAt: string
  updatedAt: string
}

export type ApprovalRow = {
  id: string
  tenantId: string
  organizationId: string
  draftId: string
  draftHash: string
  decision: 'approved' | 'rejected'
  approverUserId: string
  idempotencyKey: string
  expiresAt: string
  createdAt: string
}

export type OutreachRepository = {
  findDraftByCandidateAndHash(input: {
    tenantId: string
    organizationId: string
    candidateId: string
    bodyHash: string
  }): Promise<DraftRow | null>
  insertDraft(input: Omit<DraftRow, 'createdAt' | 'updatedAt'> & { now: string }): Promise<DraftRow>
  getDraft(input: { tenantId: string; organizationId: string; id: string }): Promise<DraftRow | null>
  markDraftApproved(input: { tenantId: string; organizationId: string; id: string; now: string }): Promise<boolean>
  findApprovalByKey(input: {
    tenantId: string
    organizationId: string
    idempotencyKey: string
  }): Promise<ApprovalRow | null>
  insertApproval(input: Omit<ApprovalRow, 'createdAt'> & { now: string; id: string }): Promise<ApprovalRow>
  getCandidateScope(input: {
    tenantId: string
    organizationId: string
    candidateId: string
  }): Promise<{ id: string; status: string } | null>
}

export type OutreachResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'candidate_not_found' | 'draft_not_found' | 'invalid_input' | 'body_hash_mismatch' | 'not_approved_candidate' | 'already_decided' }

export function bodyHashOf(subject: string, bodyMarkdown: string): string {
  return createHash('sha256').update(`${subject.trim()}\u0000${bodyMarkdown}`).digest('hex')
}

export function recipientHashOf(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

export function createOutreachService(deps: {
  repo: OutreachRepository
  now: () => string
  newId: () => string
  approvalTtlMs: number
}) {
  const { repo, now, newId, approvalTtlMs } = deps

  async function createDraft(input: {
    tenantId: string
    organizationId: string
    candidateId: string
    recipientEmail: string
    subject: string
    bodyMarkdown: string
    templateKey?: string | null
    templateVersion?: string | null
  }): Promise<OutreachResult<{ draft: DraftRow; created: boolean }>> {
    const candidate = await repo.getCandidateScope(input)
    if (!candidate) return { ok: false, code: 'candidate_not_found' }
    if (candidate.status !== 'approved' && candidate.status !== 'crm_written') {
      return { ok: false, code: 'not_approved_candidate' }
    }
    if (!input.recipientEmail.includes('@') || !input.subject.trim() || !input.bodyMarkdown.trim()) {
      return { ok: false, code: 'invalid_input' }
    }
    const bodyHash = bodyHashOf(input.subject, input.bodyMarkdown)
    const existing = await repo.findDraftByCandidateAndHash({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      bodyHash,
    })
    if (existing) return { ok: true, value: { draft: existing, created: false } }
    const at = now()
    const draft = await repo.insertDraft({
      id: newId(),
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      recipientEmail: input.recipientEmail.trim(),
      recipientHash: recipientHashOf(input.recipientEmail),
      channel: 'email',
      subject: input.subject.trim(),
      bodyMarkdown: input.bodyMarkdown,
      bodyHash,
      status: 'ready',
      version: 1,
      now: at,
    })
    return { ok: true, value: { draft, created: true } }
  }

  async function approveDraft(input: {
    tenantId: string
    organizationId: string
    draftId: string
    draftHash: string
    approverUserId: string
    idempotencyKey: string
    decision: 'approved' | 'rejected'
  }): Promise<OutreachResult<{ approval: ApprovalRow; replayed: boolean }>> {
    if (!input.idempotencyKey || input.idempotencyKey.length < 8) return { ok: false, code: 'invalid_input' }
    const replay = await repo.findApprovalByKey(input)
    if (replay) return { ok: true, value: { approval: replay, replayed: true } }
    const draft = await repo.getDraft({ tenantId: input.tenantId, organizationId: input.organizationId, id: input.draftId })
    if (!draft) return { ok: false, code: 'draft_not_found' }
    // The approval is bound to one body: a stale hash cannot ride an old approval.
    if (draft.bodyHash !== input.draftHash) return { ok: false, code: 'body_hash_mismatch' }
    if (input.decision === 'approved' && draft.status === 'approved') {
      return { ok: false, code: 'already_decided' }
    }
    const at = now()
    const approval = await repo.insertApproval({
      id: newId(),
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      draftId: draft.id,
      draftHash: input.draftHash,
      decision: input.decision,
      approverUserId: input.approverUserId,
      idempotencyKey: input.idempotencyKey,
      expiresAt: new Date(Date.parse(at) + approvalTtlMs).toISOString(),
      now: at,
    })
    if (input.decision === 'approved') {
      await repo.markDraftApproved({ tenantId: input.tenantId, organizationId: input.organizationId, id: draft.id, now: at })
    }
    return { ok: true, value: { approval, replayed: false } }
  }

  return { createDraft, approveDraft }
}
