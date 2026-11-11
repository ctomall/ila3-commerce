/**
 * Run persistence contract for the DSH engine (B1).
 *
 * The store is pure orchestration: it owns the invariants, the caller injects
 * the repository (PostgreSQL in production, an in-memory fake in tests) plus a
 * clock and id generator. Nothing here imports MikroORM, opens a connection or
 * schedules work, so the state machine can be tested without a database.
 *
 * The rules implemented here are the ones a route must not be able to bypass:
 *
 *   - `submit` is idempotent on `(bindingId, idempotencyKey)` and binds the key
 *     to `requestHash`. Same key + different body is a conflict, not a replay.
 *   - At most one in-flight run per binding. The in-memory check gives a clear
 *     error; the migration's partial unique index closes the cross-process race.
 *   - Events are contiguous from seq 1. A duplicate or a gap is refused before
 *     it can create a hole a reconnecting browser would never fill.
 *   - `finish` only moves an in-flight run to a terminal state, exactly once.
 *   - `revokeBinding` uses `applyPrincipalRevoked` from `src/lib/dsh/run.ts` so
 *     revocation means the same thing here as in the state machine: in-flight
 *     runs become `cancelled`, settled runs are left alone, and the binding's
 *     `revoked` status makes every later write-time check fail closed.
 *
 * A real repository must run `submit` and `revokeBinding` inside a transaction
 * (or rely on the unique indexes and retry) because the pre-checks here are
 * advisory between processes. `updateRun` should use compare-and-set on
 * status/cursor; the pure checks are not a substitute for optimistic locking.
 */
import { randomUUID } from 'node:crypto'
import {
  applyPrincipalRevoked,
  type BindingState,
  type Run as StateMachineRun,
  type RunStatus,
} from '../../../lib/dsh/run'

export const TERMINAL_RUN_STATUSES = [
  'completed',
  'failed',
  'cancelled',
  'budget_exhausted',
  'expired',
] as const

export type TerminalRunStatus = (typeof TERMINAL_RUN_STATUSES)[number]

const TERMINAL_STATUS_SET: ReadonlySet<RunStatus> = new Set(TERMINAL_RUN_STATUSES)
const IN_FLIGHT_STATUSES: readonly RunStatus[] = ['queued', 'running', 'awaiting_approval']

export function isTerminalRunStatus(status: RunStatus): status is TerminalRunStatus {
  return TERMINAL_STATUS_SET.has(status)
}

/** True for queued/running/awaiting_approval, matching `isInFlight()` in run.ts. */
export function isInFlightRunStatus(status: RunStatus): boolean {
  return !isTerminalRunStatus(status)
}

export type BindingRecord = {
  id: string
  tenantId: string
  organizationId: string
  userId: string
  assistantId: string
  status: BindingState
  revision: number
  createdAt: string
  updatedAt: string
}

export type RunRecord = {
  id: string
  bindingId: string
  userId: string
  tenantId: string
  organizationId: string
  sessionId: string | null
  status: RunStatus
  idempotencyKey: string
  requestHash: string
  /** Highest durably stored event seq; 0 means no event has been written. */
  cursor: number
  resultJson: unknown | null
  error: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
}

export type RunEventRecord = {
  id: string
  runId: string
  seq: number
  type: string
  payloadJson: unknown | null
  createdAt: string
}

/**
 * Storage port. Implementations must honour the unique constraints declared in
 * `data/entities.ts`; `insertRun` / `insertEvent` may throw on a duplicate.
 */
export interface DshRunRepository {
  getBinding(bindingId: string): Promise<BindingRecord | null>
  saveBinding(binding: BindingRecord): Promise<BindingRecord>
  getRun(runId: string): Promise<RunRecord | null>
  getRunByIdempotencyKey(bindingId: string, idempotencyKey: string): Promise<RunRecord | null>
  listRunsByBinding(bindingId: string): Promise<RunRecord[]>
  listRunsByStatuses(statuses: readonly RunStatus[]): Promise<RunRecord[]>
  insertRun(run: RunRecord): Promise<RunRecord>
  updateRun(run: RunRecord): Promise<RunRecord>
  insertEvent(event: RunEventRecord): Promise<RunEventRecord>
  getEvent(runId: string, seq: number): Promise<RunEventRecord | null>
  listEventsAfter(runId: string, cursor: number): Promise<RunEventRecord[]>
}

export type RunStoreErrorCode =
  | 'invalid-request'
  | 'idempotency-conflict'
  | 'concurrent-run'
  | 'binding-not-found'
  | 'binding-not-active'
  | 'binding-identity-mismatch'
  | 'run-not-found'
  | 'duplicate-sequence'
  | 'sequence-gap'
  | 'invalid-cursor'
  | 'run-terminal'
  | 'run-not-running'
  | 'invalid-transition'

export class RunStoreError extends Error {
  constructor(
    readonly code: RunStoreErrorCode,
    message: string,
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class InvalidRunRequestError extends RunStoreError {
  constructor(message: string) {
    super('invalid-request', message)
  }
}

export class IdempotencyConflictError extends RunStoreError {
  constructor(runId: string, key: string) {
    super(
      'idempotency-conflict',
      `idempotency key ${JSON.stringify(key)} was already used for run ${runId} with a different request hash`,
    )
  }
}

export class ConcurrentRunError extends RunStoreError {
  constructor(bindingId: string, existingRunId: string) {
    super(
      'concurrent-run',
      `binding ${bindingId} already has an in-flight run (${existingRunId}); finish or cancel it before submitting another`,
    )
  }
}

export class BindingNotFoundError extends RunStoreError {
  constructor(bindingId: string) {
    super('binding-not-found', `assistant binding ${bindingId} does not exist`)
  }
}

export class BindingNotActiveError extends RunStoreError {
  constructor(bindingId: string, status: BindingState) {
    super('binding-not-active', `assistant binding ${bindingId} is ${status}; only an active binding may submit a run`)
  }
}

export class BindingIdentityMismatchError extends RunStoreError {
  constructor(bindingId: string) {
    super(
      'binding-identity-mismatch',
      `run identity does not match assistant binding ${bindingId} (tenant/organization/user must be the binding's own)`,
    )
  }
}

export class RunNotFoundError extends RunStoreError {
  constructor(runId: string) {
    super('run-not-found', `run ${runId} does not exist`)
  }
}

export class DuplicateSequenceError extends RunStoreError {
  constructor(runId: string, seq: number) {
    super('duplicate-sequence', `run ${runId} already has an event at seq ${seq}`)
  }
}

export class SequenceGapError extends RunStoreError {
  constructor(runId: string, cursor: number, seq: number) {
    super('sequence-gap', `run ${runId} expects seq ${cursor + 1} after cursor ${cursor}, got ${seq}`)
  }
}

export class InvalidCursorError extends RunStoreError {
  constructor(cursor: unknown) {
    super('invalid-cursor', `cursor must be a non-negative integer, got ${JSON.stringify(cursor)}`)
  }
}

export class TerminalRunError extends RunStoreError {
  constructor(runId: string, status: RunStatus) {
    super('run-terminal', `run ${runId} is already terminal (${status}); terminal runs are immutable`)
  }
}

export class RunNotRunningError extends RunStoreError {
  constructor(runId: string, status: RunStatus) {
    super('run-not-running', `run ${runId} is ${status}; events may only be appended to a running run`)
  }
}

export class InvalidTransitionError extends RunStoreError {
  constructor(from: RunStatus | 'unknown', to: RunStatus) {
    super('invalid-transition', `cannot transition run from ${from} to ${to}`)
  }
}

export type SubmitRunInput = {
  bindingId: string
  userId: string
  tenantId: string
  organizationId: string
  idempotencyKey: string
  requestHash: string
  /** Reuse an existing DSH session on resume; omit for a new conversation. */
  sessionId?: string | null
  /** Optional deterministic timestamp (tests/imports). Defaults to the injected clock. */
  createdAt?: string
}

export type SubmitRunResult = {
  run: RunRecord
  /** true when the same key+hash returned a row that already existed. */
  replayed: boolean
}

export type StartRunInput = {
  sessionId: string
  at?: string
}

export type AppendEventInput = {
  runId: string
  /** Contiguous 1-based position from the runtime; must equal `cursor + 1`. */
  seq: number
  type: string
  payload?: unknown
  at?: string
}

export type AppendEventResult = {
  event: RunEventRecord
  run: RunRecord
}

export type FinishRunInput = {
  runId: string
  status: TerminalRunStatus
  result?: unknown
  error?: string | null
  at?: string
}

export type RevokeBindingOptions = {
  at?: string
  reason?: string
}

export type RevokeBindingResult = {
  binding: BindingRecord
  cancelled: RunRecord[]
  /** Timestamp used for the ten-second revocation audit. */
  revokedAt: string
}

export type InFlightRun = {
  runId: string
  bindingId: string
  userId: string
  tenantId: string
  organizationId: string
  sessionId: string | null
  status: RunStatus
  cursor: number
  createdAt: string
}

export type RunStoreDeps = {
  now?: () => Date
  newId?: () => string
}

export type DshRunStore = {
  submit(input: SubmitRunInput): Promise<SubmitRunResult>
  start(runId: string, input: StartRunInput): Promise<RunRecord>
  appendEvent(input: AppendEventInput): Promise<AppendEventResult>
  finish(input: FinishRunInput): Promise<RunRecord>
  recoverInFlight(): Promise<InFlightRun[]>
  eventsAfter(runId: string, cursor: number): Promise<RunEventRecord[]>
  revokeBinding(bindingId: string, options?: RevokeBindingOptions): Promise<RevokeBindingResult>
}

const requireToken = (field: string, value: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidRunRequestError(`${field} must be a non-empty string`)
  }
  return value
}

const requireSeq = (seq: number): number => {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new InvalidRunRequestError(`event seq must be a positive integer, got ${JSON.stringify(seq)}`)
  }
  return seq
}

export function createRunStore(repository: DshRunRepository, deps: RunStoreDeps = {}): DshRunStore {
  const now = deps.now ?? (() => new Date())
  const newId = deps.newId ?? (() => randomUUID())

  const nowIso = (): string => now().toISOString()

  const atIso = (value: string | undefined, field: string): string => {
    const candidate = value ?? nowIso()
    const parsed = Date.parse(candidate)
    if (!Number.isFinite(parsed)) {
      throw new InvalidRunRequestError(`${field} must be an ISO-8601 timestamp, got ${JSON.stringify(candidate)}`)
    }
    return new Date(parsed).toISOString()
  }

  const toStateMachineRun = (run: RunRecord): StateMachineRun => ({
    id: run.id,
    bindingId: run.bindingId,
    employeeUserId: run.userId,
    status: run.status,
    startedAt: run.startedAt,
  })

  const requireBinding = async (bindingId: string): Promise<BindingRecord> => {
    requireToken('bindingId', bindingId)
    const binding = await repository.getBinding(bindingId)
    if (!binding) throw new BindingNotFoundError(bindingId)
    return binding
  }

  const requireRun = async (runId: string): Promise<RunRecord> => {
    requireToken('runId', runId)
    const run = await repository.getRun(runId)
    if (!run) throw new RunNotFoundError(runId)
    return run
  }

  const replayOrConflict = (existing: RunRecord, requestHash: string): SubmitRunResult => {
    if (existing.requestHash !== requestHash) {
      throw new IdempotencyConflictError(existing.id, existing.idempotencyKey)
    }
    return { run: existing, replayed: true }
  }

  const findInFlight = async (bindingId: string): Promise<RunRecord[]> => {
    const runs = await repository.listRunsByBinding(bindingId)
    return runs.filter((run) => isInFlightRunStatus(run.status))
  }

  const submit = async (input: SubmitRunInput): Promise<SubmitRunResult> => {
    requireToken('idempotencyKey', input.idempotencyKey)
    requireToken('requestHash', input.requestHash)
    const binding = await requireBinding(input.bindingId)

    // Identity comes from the server session in the route. Refusing a mismatch
    // here means a forged employee field cannot spend another binding's quota.
    if (
      binding.userId !== input.userId ||
      binding.tenantId !== input.tenantId ||
      binding.organizationId !== input.organizationId
    ) {
      throw new BindingIdentityMismatchError(binding.id)
    }
    if (binding.status !== 'active') {
      throw new BindingNotActiveError(binding.id, binding.status)
    }

    const existing = await repository.getRunByIdempotencyKey(binding.id, input.idempotencyKey)
    if (existing) return replayOrConflict(existing, input.requestHash)

    const inFlight = await findInFlight(binding.id)
    if (inFlight.length > 0) throw new ConcurrentRunError(binding.id, inFlight[0].id)

    const createdAt = atIso(input.createdAt, 'createdAt')
    const run: RunRecord = {
      id: newId(),
      bindingId: binding.id,
      userId: input.userId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      sessionId: input.sessionId ?? null,
      status: 'queued',
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      cursor: 0,
      resultJson: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      createdAt,
    }

    try {
      const inserted = await repository.insertRun(run)
      return { run: inserted, replayed: false }
    } catch (error) {
      // A concurrent submit may have won the unique-key or in-flight race after
      // our pre-check. Re-read instead of surfacing a driver-specific duplicate
      // error: the retry must observe the same answer a later retry would.
      const raced = await repository.getRunByIdempotencyKey(binding.id, input.idempotencyKey)
      if (raced) return replayOrConflict(raced, input.requestHash)
      const racedInFlight = await findInFlight(binding.id)
      if (racedInFlight.length > 0) throw new ConcurrentRunError(binding.id, racedInFlight[0].id)
      throw error
    }
  }

  const start = async (runId: string, input: StartRunInput): Promise<RunRecord> => {
    const sessionId = requireToken('sessionId', input.sessionId)
    const run = await requireRun(runId)
    if (run.status === 'running') {
      if (run.sessionId === sessionId) return run
      throw new InvalidTransitionError('running', 'running')
    }
    if (isTerminalRunStatus(run.status)) throw new TerminalRunError(run.id, run.status)
    if (run.status !== 'queued') throw new InvalidTransitionError(run.status, 'running')
    return repository.updateRun({
      ...run,
      status: 'running',
      sessionId,
      startedAt: atIso(input.at, 'startedAt'),
    })
  }

  const appendEvent = async (input: AppendEventInput): Promise<AppendEventResult> => {
    const type = requireToken('type', input.type)
    const seq = requireSeq(input.seq)
    const run = await requireRun(input.runId)
    if (isTerminalRunStatus(run.status)) throw new TerminalRunError(run.id, run.status)
    if (run.status !== 'running') throw new RunNotRunningError(run.id, run.status)
    if (seq <= run.cursor) throw new DuplicateSequenceError(run.id, seq)
    if (seq !== run.cursor + 1) throw new SequenceGapError(run.id, run.cursor, seq)
    // Defensive against a cursor that drifted behind stored rows; the unique
    // constraint would also reject this, but a typed error is more useful.
    if (await repository.getEvent(run.id, seq)) throw new DuplicateSequenceError(run.id, seq)

    const event: RunEventRecord = {
      id: newId(),
      runId: run.id,
      seq,
      type,
      payloadJson: input.payload ?? null,
      createdAt: atIso(input.at, 'createdAt'),
    }
    await repository.insertEvent(event)
    const updated = await repository.updateRun({ ...run, cursor: seq })
    return { event, run: updated }
  }

  const finish = async (input: FinishRunInput): Promise<RunRecord> => {
    const run = await requireRun(input.runId)
    if (isTerminalRunStatus(run.status)) throw new TerminalRunError(run.id, run.status)
    if (!isTerminalRunStatus(input.status)) throw new InvalidTransitionError(run.status, input.status)
    if (!isInFlightRunStatus(run.status)) throw new InvalidTransitionError(run.status, input.status)

    return repository.updateRun({
      ...run,
      status: input.status,
      // `undefined` means "leave what was there"; `null` is an explicit clear.
      resultJson: input.result === undefined ? run.resultJson : input.result,
      error:
        input.error !== undefined ? input.error : input.status === 'cancelled' ? 'cancelled' : run.error,
      finishedAt: atIso(input.at, 'finishedAt'),
    })
  }

  const recoverInFlight = async (): Promise<InFlightRun[]> => {
    // `awaiting_approval` is parked, not settled: run.ts's isInFlight() includes
    // it, and a restart that ignored it would strand an approval forever.
    const runs = await repository.listRunsByStatuses(IN_FLIGHT_STATUSES)
    return runs
      .filter((run) => isInFlightRunStatus(run.status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map((run) => ({
        runId: run.id,
        bindingId: run.bindingId,
        userId: run.userId,
        tenantId: run.tenantId,
        organizationId: run.organizationId,
        sessionId: run.sessionId,
        status: run.status,
        cursor: run.cursor,
        createdAt: run.createdAt,
      }))
  }

  const eventsAfter = async (runId: string, cursor: number): Promise<RunEventRecord[]> => {
    if (!Number.isInteger(cursor) || cursor < 0) throw new InvalidCursorError(cursor)
    await requireRun(runId)
    const events = await repository.listEventsAfter(runId, cursor)
    return events.filter((event) => event.seq > cursor).sort((a, b) => a.seq - b.seq)
  }

  const revokeBinding = async (
    bindingId: string,
    options: RevokeBindingOptions = {},
  ): Promise<RevokeBindingResult> => {
    const binding = await requireBinding(bindingId)
    const at = atIso(options.at, 'revokedAt')
    const reason = options.reason ?? 'principal_revoked'
    const runs = await repository.listRunsByBinding(binding.id)

    // The same function the state machine uses: it decides which runs are in
    // flight, leaves settled runs untouched, and ignores other bindings.
    const outcome = applyPrincipalRevoked(runs.map(toStateMachineRun), {
      bindingId: binding.id,
      at,
      reason,
    })
    const cancelledIds = new Set(outcome.cancelled.map((run) => run.id))
    const cancelled: RunRecord[] = []
    for (const run of runs) {
      if (!cancelledIds.has(run.id)) continue
      cancelled.push(
        await repository.updateRun({
          ...run,
          status: 'cancelled',
          // The schema has no cancelled_at column; finished_at is the moment
          // the run stopped and `error` carries the cancel reason, which keeps
          // withinRevocationDeadline() computable from persisted columns.
          finishedAt: at,
          error: reason,
        }),
      )
    }

    // Revoking an already-revoked binding is a no-op for the binding row: the
    // original revokedAt is what the ten-second audit must compare against.
    const nextBinding =
      binding.status === 'revoked'
        ? binding
        : await repository.saveBinding({
            ...binding,
            status: 'revoked',
            revision: binding.revision + 1,
            updatedAt: at,
          })

    return { binding: nextBinding, cancelled, revokedAt: nextBinding.updatedAt }
  }

  return { submit, start, appendEvent, finish, recoverInFlight, eventsAfter, revokeBinding }
}
