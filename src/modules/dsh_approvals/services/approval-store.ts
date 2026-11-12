/**
 * Human approval for DSH CRM writes (C phase).
 *
 * A write tool is only a *proposal*: the bridge records what the model wants to
 * do, the employee approves it in the CRM, and only then does the command bus
 * execute. This module is the pure part of that contract — the state machine,
 * the argument fingerprint and the time rules — so it can be tested without a
 * database. `orm-repository.ts` binds it to `dsh_write_approvals`.
 *
 * Why the approval is keyed by `(binding, tool, args_hash)` and not by run id:
 * a DSH run is one assistant turn. The model asks for a write, gets
 * `approval_required`, and the turn ends; the employee approves afterwards and
 * the model retries in a *new* run. A run-scoped approval could never be
 * consumed, so the key is the employee binding plus the exact arguments. The
 * requesting run id is still stored for audit.
 */
import { createHash } from 'node:crypto'

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  /** Claimed by one call, execution in flight. A crashed claim is treated as expired. */
  | 'executing'
  | 'consumed'
  | 'expired'

export type WriteApproval = {
  id: string
  tenantId: string
  organizationId: string
  userId: string
  bindingId: string
  /** Run that first requested this write; audit only. */
  runId: string
  tool: string
  argsHash: string
  /** Human-readable summary stored at request time; never contains secrets. */
  argsPreview: Record<string, unknown>
  status: ApprovalStatus
  requestedAt: string
  expiresAt: string
  decidedAt: string | null
  decidedBy: string | null
  consumedAt: string | null
}

/** How long a pending request — and later an approval — stays usable. */
export const APPROVAL_TTL_MS = 10 * 60_000

/** Stable, key-sorted JSON so the same logical arguments always hash the same. */
export function canonicalJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize)
    if (input !== null && typeof input === 'object') {
      const source = input as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(source).sort()) {
        const entry = source[key]
        if (entry === undefined) continue
        out[key] = normalize(entry)
      }
      return out
    }
    return input
  }
  return JSON.stringify(normalize(value))
}

/** SHA-256 of the canonical arguments; this is the approval's identity. */
export function hashToolArgs(args: unknown): string {
  return createHash('sha256').update(canonicalJson(args ?? {})).digest('hex')
}

export function isApprovalUsable(approval: WriteApproval, nowIso: string): boolean {
  if (approval.status !== 'approved') return false
  const now = Date.parse(nowIso)
  const expires = Date.parse(approval.expiresAt)
  if (!Number.isFinite(now) || !Number.isFinite(expires)) return false
  return now < expires
}

/** Pending requests expire on their own; the store records that transition. */
export function pendingExpired(approval: WriteApproval, nowIso: string): boolean {
  if (approval.status !== 'pending') return false
  const now = Date.parse(nowIso)
  const expires = Date.parse(approval.expiresAt)
  return Number.isFinite(now) && Number.isFinite(expires) && now >= expires
}

export type ApprovalDecisionInput = {
  decision: 'approve' | 'reject'
  decidedBy: string
  now: string
}

export type ApprovalDecision =
  | { ok: true; status: 'approved' | 'rejected'; expiresAt: string }
  | { ok: false; code: 'not_pending' | 'expired' }

/**
 * Decide one pending approval. Pure: the caller persists the returned status.
 *
 * `expiresAt` is re-armed from the decision moment when approving, so an
 * employee who approves an 9-minute-old request still gets a full window.
 */
export function decideApproval(
  approval: WriteApproval,
  input: ApprovalDecisionInput,
): ApprovalDecision {
  if (approval.status === 'pending' && pendingExpired(approval, input.now)) {
    return { ok: false, code: 'expired' }
  }
  if (approval.status !== 'pending') return { ok: false, code: 'not_pending' }
  if (input.decision === 'reject') {
    return { ok: true, status: 'rejected', expiresAt: approval.expiresAt }
  }
  const now = Date.parse(input.now)
  if (!Number.isFinite(now)) return { ok: false, code: 'not_pending' }
  return { ok: true, status: 'approved', expiresAt: new Date(now + APPROVAL_TTL_MS).toISOString() }
}

export type GateResult =
  | { action: 'execute'; approval: WriteApproval }
  | { action: 'pending'; approval: WriteApproval }
  | { action: 'rejected'; approval: WriteApproval }
  | { action: 'expired'; approval: WriteApproval }
  | { action: 'consumed'; approval: WriteApproval }

/**
 * What the bridge should do for one write call, given the employee's latest
 * approval row for these exact arguments.
 *
 * `consume` is the atomic transition `approved -> consumed`; it returns false
 * when another worker won the race, in which case the call is not executed.
 */
export async function gateDecision(input: {
  approval: WriteApproval | null
  now: string
  consume: (approvalId: string) => Promise<boolean>
}): Promise<GateResult | { action: 'request' }> {
  const { approval, now } = input
  if (!approval) return { action: 'request' }
  if (approval.status === 'pending') {
    return pendingExpired(approval, now)
      ? { action: 'expired', approval }
      : { action: 'pending', approval }
  }
  if (approval.status === 'approved') {
    if (!isApprovalUsable(approval, now)) return { action: 'expired', approval }
    // Claim before executing: approved -> executing, so two concurrent calls can
    // never both write. The claim is settled to `consumed` after the command
    // succeeds and reverted to `approved` when it fails (nothing was written).
    const won = await input.consume(approval.id)
    return won ? { action: 'execute', approval } : { action: 'consumed', approval }
  }
  if (approval.status === 'rejected') return { action: 'rejected', approval }
  // `executing` without this call's claim means a previous process died mid-write.
  // Treat it as expired instead of parking the request forever.
  if (approval.status === 'executing') return { action: 'expired', approval }
  return { action: 'consumed', approval }
}
