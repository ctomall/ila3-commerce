/**
 * Run state machine (M4 case 5) — what "revocation reaches an in-flight run" means in code.
 *
 * 03-dsh-contract §3.1 fixes the states and §6 the deadline: a revoked principal must stop
 * scheduling within 10 s, and §6's last line is the one that matters for data integrity:
 * "在途 Run 被撤销后不得完成 CRM 写入：写入前校验 run.status === 'running' 且绑定仍 active".
 *
 * Two separate properties, deliberately kept apart:
 *
 *   1. Broadcasting `principal.revoked` transitions in-flight runs to `cancelled`. This is
 *      bookkeeping: it says what *should* stop.
 *   2. `canWriteToCrm` is checked at the moment of the write, against the run status AND
 *      the binding state as read then. A run that still says `running` because the
 *      cancellation has not landed yet must not be able to write — the binding check is
 *      what closes that window.
 *
 * Nothing here schedules or cancels anything; it decides and reports. The runtime that
 * actually talks to DSH does not exist yet, which is why M4 case 5 stays blocked.
 */

export type RunStatus =
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'budget_exhausted'
  /** 03 §3.1: an approval that timed out. Distinct from `cancelled` so audits can tell. */
  | 'expired'

export type Run = {
  id: string
  bindingId: string
  employeeUserId: string
  status: RunStatus
  startedAt: string | null
  cancelledAt?: string | null
  cancelReason?: string | null
}

export type BindingState = 'active' | 'suspended' | 'revoked'

/** The deadline from 03-dsh-contract §6: revocation stops scheduling within 10 s. */
export const REVOCATION_DEADLINE_MS = 10_000

/** States where the run might still do something. `awaiting_approval` is in flight: it is
 *  parked, not finished, and a revoked principal must not be able to resume it. */
export function isInFlight(run: Run): boolean {
  return run.status === 'queued' || run.status === 'running' || run.status === 'awaiting_approval'
}

export type RevocationOutcome = {
  cancelled: Run[]
  untouched: Run[]
  /** In-flight runs of other bindings are none of this broadcast's business. */
  otherBindings: number
}

/**
 * Apply `principal.revoked` for one binding.
 *
 * Returns the runs it changed so a caller can audit them, and leaves every settled run
 * alone — re-cancelling a completed run would rewrite history.
 */
export function applyPrincipalRevoked(
  runs: readonly Run[],
  input: { bindingId: string; at: string; reason?: string },
): RevocationOutcome {
  const cancelled: Run[] = []
  const untouched: Run[] = []
  let otherBindings = 0
  for (const run of runs) {
    if (run.bindingId !== input.bindingId) {
      otherBindings += 1
      continue
    }
    if (!isInFlight(run)) {
      untouched.push(run)
      continue
    }
    cancelled.push({
      ...run,
      status: 'cancelled',
      cancelledAt: input.at,
      cancelReason: input.reason ?? 'principal_revoked',
    })
  }
  return { cancelled, untouched, otherBindings }
}

/** Whether the 10 s promise was kept for one run. */
export function withinRevocationDeadline(input: {
  revokedAt: string | null | undefined
  cancelledAt: string | null | undefined
}): boolean {
  const revoked = input.revokedAt ? Date.parse(input.revokedAt) : Number.NaN
  const cancelled = input.cancelledAt ? Date.parse(input.cancelledAt) : Number.NaN
  if (!Number.isFinite(revoked) || !Number.isFinite(cancelled)) return false
  return cancelled - revoked <= REVOCATION_DEADLINE_MS && cancelled >= revoked
}

export type WriteRejection =
  | 'no_run'
  | 'binding_mismatch'
  | 'run_not_running'
  | 'run_cancelled'
  | 'run_terminal'
  | 'binding_not_active'
  | 'time_unparseable'

export type WriteDecision = { allowed: true } | { allowed: false; reason: WriteRejection }

/**
 * The last gate before a CRM write, checked at write time.
 *
 * `bindingState` is a parameter rather than something read off the run: the cancellation
 * may not have reached the run object yet, and that gap is exactly the window a revoked
 * employee's in-flight task would use.
 */
export function canWriteToCrm(input: {
  run: Run | null
  /** The binding the caller is acting as; must be the one the run belongs to. */
  bindingId: string
  bindingState: BindingState
  now: string
}): WriteDecision {
  const { run, bindingId, bindingState, now } = input
  if (!run) return { allowed: false, reason: 'no_run' }
  // Reading "the caller's current binding state" and applying it to a run of a different
  // binding lets a revoked run through: the check must be about the same binding.
  if (!bindingId || run.bindingId !== bindingId) return { allowed: false, reason: 'binding_mismatch' }
  if (bindingState !== 'active') return { allowed: false, reason: 'binding_not_active' }
  // Parsed after the binding facts so a bad clock cannot mask a revocation in the audit.
  if (!Number.isFinite(Date.parse(now))) return { allowed: false, reason: 'time_unparseable' }
  if (run.status === 'cancelled') return { allowed: false, reason: 'run_cancelled' }
  if (!isInFlight(run)) return { allowed: false, reason: 'run_terminal' }
  // `queued` and `awaiting_approval` are in flight but not executing: a write from either
  // is out of order, and resuming an approval after revocation must not slip through.
  if (run.status !== 'running') return { allowed: false, reason: 'run_not_running' }
  return { allowed: true }
}
