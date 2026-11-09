import { describe, expect, it } from '@jest/globals'
import {
  applyPrincipalRevoked,
  canWriteToCrm,
  isInFlight,
  REVOCATION_DEADLINE_MS,
  withinRevocationDeadline,
  type Run,
} from '../run'

const NOW = '2026-11-09T10:00:00.000Z'

const run = (overrides: Partial<Run> = {}): Run => ({
  id: 'run-1',
  bindingId: 'binding-1',
  employeeUserId: 'user-employee',
  status: 'running',
  startedAt: '2026-11-09T09:59:00.000Z',
  ...overrides,
})

describe('canWriteToCrm', () => {
  it('allows a running run on an active binding', () => {
    expect(canWriteToCrm({ run: run(), bindingState: 'active', now: NOW })).toEqual({ allowed: true })
  })

  it('refuses when there is no run at all', () => {
    expect(canWriteToCrm({ run: null, bindingState: 'active', now: NOW })).toEqual({
      allowed: false,
      reason: 'no_run',
    })
  })

  it('refuses a queued run: it is in flight but not executing', () => {
    expect(canWriteToCrm({ run: run({ status: 'queued' }), bindingState: 'active', now: NOW })).toEqual({
      allowed: false,
      reason: 'run_not_running',
    })
  })

  it('refuses a run parked in awaiting_approval', () => {
    expect(
      canWriteToCrm({ run: run({ status: 'awaiting_approval' }), bindingState: 'active', now: NOW }),
    ).toEqual({ allowed: false, reason: 'run_not_running' })
  })

  it('refuses a cancelled run by name, so the audit says why', () => {
    expect(canWriteToCrm({ run: run({ status: 'cancelled' }), bindingState: 'active', now: NOW })).toEqual({
      allowed: false,
      reason: 'run_cancelled',
    })
  })

  it('refuses every terminal state', () => {
    for (const status of ['completed', 'failed', 'budget_exhausted'] as const) {
      expect(canWriteToCrm({ run: run({ status }), bindingState: 'active', now: NOW })).toEqual({
        allowed: false,
        reason: 'run_terminal',
      })
    }
  })

  it('refuses when the binding is revoked even though the run still says running', () => {
    // The cancellation broadcast may not have reached this object yet; that gap is the
    // window a revoked employee's in-flight task would otherwise use.
    expect(canWriteToCrm({ run: run(), bindingState: 'revoked', now: NOW })).toEqual({
      allowed: false,
      reason: 'binding_not_active',
    })
  })

  it('refuses a suspended binding too', () => {
    expect(canWriteToCrm({ run: run(), bindingState: 'suspended', now: NOW })).toEqual({
      allowed: false,
      reason: 'binding_not_active',
    })
  })

  it('refuses when the clock cannot be parsed instead of assuming it is fine', () => {
    expect(canWriteToCrm({ run: run(), bindingState: 'active', now: 'not-a-time' })).toEqual({
      allowed: false,
      reason: 'time_unparseable',
    })
  })
})

describe('applyPrincipalRevoked', () => {
  it('cancels every in-flight run of that binding, including parked approvals', () => {
    const runs = [
      run({ id: 'r-running', status: 'running' }),
      run({ id: 'r-queued', status: 'queued' }),
      run({ id: 'r-approval', status: 'awaiting_approval' }),
    ]
    const outcome = applyPrincipalRevoked(runs, { bindingId: 'binding-1', at: NOW })
    expect(outcome.cancelled.map((r) => r.id)).toEqual(['r-running', 'r-queued', 'r-approval'])
    expect(outcome.cancelled.every((r) => r.status === 'cancelled' && r.cancelledAt === NOW)).toBe(true)
    expect(outcome.cancelled.every((r) => r.cancelReason === 'principal_revoked')).toBe(true)
  })

  it('leaves settled runs alone instead of rewriting history', () => {
    const runs = [
      run({ id: 'r-done', status: 'completed' }),
      run({ id: 'r-failed', status: 'failed' }),
      run({ id: 'r-budget', status: 'budget_exhausted' }),
    ]
    const outcome = applyPrincipalRevoked(runs, { bindingId: 'binding-1', at: NOW })
    expect(outcome.cancelled).toEqual([])
    expect(outcome.untouched.map((r) => r.id)).toEqual(['r-done', 'r-failed', 'r-budget'])
  })

  it('does not touch another binding\'s runs and counts them', () => {
    const runs = [run({ id: 'r-mine' }), run({ id: 'r-theirs', bindingId: 'binding-2' })]
    const outcome = applyPrincipalRevoked(runs, { bindingId: 'binding-1', at: NOW })
    expect(outcome.cancelled.map((r) => r.id)).toEqual(['r-mine'])
    expect(outcome.otherBindings).toBe(1)
  })

  it('keeps a caller-supplied reason', () => {
    const outcome = applyPrincipalRevoked([run()], { bindingId: 'binding-1', at: NOW, reason: 'offboarded' })
    expect(outcome.cancelled[0].cancelReason).toBe('offboarded')
  })
})

describe('withinRevocationDeadline', () => {
  it('accepts a cancellation inside ten seconds', () => {
    expect(
      withinRevocationDeadline({
        revokedAt: NOW,
        cancelledAt: new Date(Date.parse(NOW) + REVOCATION_DEADLINE_MS - 100).toISOString(),
      }),
    ).toBe(true)
  })

  it('rejects a cancellation past ten seconds', () => {
    expect(
      withinRevocationDeadline({
        revokedAt: NOW,
        cancelledAt: new Date(Date.parse(NOW) + REVOCATION_DEADLINE_MS + 1).toISOString(),
      }),
    ).toBe(false)
  })

  it('rejects a cancellation timestamped before the revocation, and missing timestamps', () => {
    expect(
      withinRevocationDeadline({ revokedAt: NOW, cancelledAt: '2026-11-09T09:59:00.000Z' }),
    ).toBe(false)
    expect(withinRevocationDeadline({ revokedAt: null, cancelledAt: NOW })).toBe(false)
    expect(withinRevocationDeadline({ revokedAt: NOW, cancelledAt: undefined })).toBe(false)
  })
})

describe('isInFlight', () => {
  it('treats parked approvals as in flight and settled runs as not', () => {
    expect(isInFlight(run({ status: 'awaiting_approval' }))).toBe(true)
    expect(isInFlight(run({ status: 'queued' }))).toBe(true)
    expect(isInFlight(run({ status: 'cancelled' }))).toBe(false)
    expect(isInFlight(run({ status: 'completed' }))).toBe(false)
  })
})
