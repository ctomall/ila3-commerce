/**
 * Human-approval gate for bridge writes (C phase).
 *
 * Sits between `authorizeToolCall()` (may this run write at all?) and the tool
 * handler (do it). The sequence for one write call is:
 *
 *   1. fingerprint the arguments;
 *   2. look up the employee's latest proposal for (binding, tool, fingerprint);
 *   3. approved + unexpired → atomically consume → execute exactly once;
 *   4. otherwise ensure a pending proposal exists and refuse with
 *      `approval_required`, so the model tells the employee to approve it.
 *
 * The approval is binding-scoped rather than run-scoped because a DSH run is
 * one turn: the model asks, the turn ends, the employee approves, and the
 * retry happens in a new run of the same binding. `runId` is stored on the
 * proposal for audit.
 */
import {
  gateDecision,
  hashToolArgs,
  type WriteApproval,
} from '@/modules/dsh_approvals/services/approval-store'
import type { ApprovalStore } from '@/modules/dsh_approvals/services/orm-repository'

export type WriteGateOutcome =
  | { action: 'execute'; approval: WriteApproval }
  | {
      action: 'approval_required'
      approvalId: string
      expiresAt: string
      summary: Record<string, unknown>
    }
  | { action: 'approval_rejected'; approvalId: string }
  | { action: 'approval_expired'; approvalId: string }
  | { action: 'approval_consumed'; approvalId: string }

export async function runWriteGate(input: {
  store: ApprovalStore
  tenantId: string
  organizationId: string
  userId: string
  bindingId: string
  runId: string
  tool: string
  args: unknown
  preview: Record<string, unknown>
  now: string
}): Promise<WriteGateOutcome> {
  const argsHash = hashToolArgs(input.args)
  const approval = await input.store.loadForGate({
    bindingId: input.bindingId,
    tool: input.tool,
    argsHash,
    now: input.now,
  })

  const outcome = await gateDecision({
    approval,
    now: input.now,
    consume: (approvalId) => input.store.consume({ id: approvalId, now: input.now }),
  })

  if (outcome.action === 'execute') return { action: 'execute', approval: outcome.approval }
  if (outcome.action === 'pending') {
    return {
      action: 'approval_required',
      approvalId: outcome.approval.id,
      expiresAt: outcome.approval.expiresAt,
      summary: outcome.approval.argsPreview,
    }
  }
  if (outcome.action === 'rejected') {
    return { action: 'approval_rejected', approvalId: outcome.approval.id }
  }
  if (outcome.action === 'consumed') {
    return { action: 'approval_consumed', approvalId: outcome.approval.id }
  }

  // No live proposal, or the previous one expired: open a fresh request. The
  // partial unique index makes a concurrent duplicate collapse onto one row.
  const created = await input.store.createPending({
    tenantId: input.tenantId,
    organizationId: input.organizationId,
    userId: input.userId,
    bindingId: input.bindingId,
    runId: input.runId,
    tool: input.tool,
    argsHash,
    argsPreview: input.preview,
    now: input.now,
  })
  return {
    action: 'approval_required',
    approvalId: created.id,
    expiresAt: created.expiresAt,
    summary: created.argsPreview,
  }
}
