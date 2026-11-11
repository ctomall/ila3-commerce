/**
 * MikroORM adapter for the DSH run persistence contract (B2).
 *
 * The pure store in `run-store.ts` owns the invariants and knows nothing about
 * the ORM. This file is the other side of that seam:
 *
 *   - `OrmDshRunRepository` implements `DshRunRepository` against an
 *     `EntityManager`, mapping entities to plain records in both directions.
 *   - `createOrmRunStore` binds the pure store to an ORM-backed repository and
 *     supplies the transaction boundaries the pure layer deliberately omits:
 *     `submit` and `revokeBinding` run in `em.transactional()`, with the
 *     binding row (`FOR UPDATE`) serialising workers that target the same
 *     employee.
 *
 * Concurrency rules that do not depend on the in-memory pre-checks:
 *
 *   - `insertRun` wraps its persist/flush in a nested `em.transactional()`,
 *     which MikroORM turns into a PostgreSQL savepoint when a transaction is
 *     already open. A 23505 therefore rolls back only the insert and leaves the
 *     outer transaction usable for the store's re-read (replay / conflict /
 *     concurrent-run classification). Without the savepoint, PostgreSQL would
 *     abort the whole transaction and the re-read would be impossible.
 *   - `insertEvent` performs the CAS update first
 *     (`where id = ? and status = 'running' and cursor = seq - 1`) and only then
 *     inserts the event, inside its own savepoint. A 0-row update is diagnosed
 *     into `DuplicateSequenceError` / `SequenceGapError` / `TerminalRunError` /
 *     `RunNotRunningError` instead of being swallowed.
 *   - `updateRun` uses CAS too: terminal transitions match
 *     `status in (queued, running, awaiting_approval)`, cursor advances match
 *     the expected cursor, and start matches `status = 'queued'`. A 0-row
 *     update is diagnosed from the current row.
 *
 * The repository does not leak entities past its boundary: every method returns
 * `BindingRecord` / `RunRecord` / `RunEventRecord` with ISO timestamps and
 * plain JSON values.
 */
import {
  LockMode,
  UniqueConstraintViolationException,
  type EntityData,
  type EntityManager,
  type FilterQuery,
  type FindOptions,
  type FindOneOptions,
  type RequiredEntityData,
} from '@mikro-orm/core'
import type { RunStatus } from '../../../lib/dsh/run'
import { DshAssistantBinding, DshRun, DshRunEvent } from '../data/entities'
import {
  BindingNotFoundError,
  DuplicateSequenceError,
  InvalidTransitionError,
  RunNotFoundError,
  RunNotRunningError,
  SequenceGapError,
  TerminalRunError,
  createRunStore,
  isTerminalRunStatus,
  type BindingRecord,
  type DshRunRepository,
  type DshRunStore,
  type RunEventRecord,
  type RunRecord,
  type RunStoreDeps,
} from './run-store'

/** Same set as run.ts's `isInFlight()`, kept local so the adapter owns its SQL predicate. */
const IN_FLIGHT_RUN_STATUSES: readonly RunStatus[] = ['queued', 'running', 'awaiting_approval']

const toIso = (value: Date | null | undefined): string | null => {
  if (value === null || value === undefined) return null
  return value.toISOString()
}

const toDate = (value: string | null): Date | null => (value === null ? null : new Date(value))

const toBindingRecord = (entity: DshAssistantBinding): BindingRecord => ({
  id: entity.id,
  tenantId: entity.tenantId,
  organizationId: entity.organizationId,
  userId: entity.userId,
  assistantId: entity.assistantId,
  status: entity.status,
  revision: entity.revision,
  createdAt: entity.createdAt.toISOString(),
  updatedAt: entity.updatedAt.toISOString(),
})

const toRunRecord = (entity: DshRun): RunRecord => ({
  id: entity.id,
  bindingId: entity.bindingId,
  userId: entity.userId,
  tenantId: entity.tenantId,
  organizationId: entity.organizationId,
  sessionId: entity.sessionId ?? null,
  status: entity.status,
  idempotencyKey: entity.idempotencyKey,
  requestHash: entity.requestHash,
  cursor: entity.cursor,
  resultJson: entity.resultJson ?? null,
  error: entity.error ?? null,
  startedAt: toIso(entity.startedAt),
  finishedAt: toIso(entity.finishedAt),
  createdAt: entity.createdAt.toISOString(),
})

const toEventRecord = (entity: DshRunEvent): RunEventRecord => ({
  id: entity.id,
  runId: entity.runId,
  seq: entity.seq,
  type: entity.type,
  payloadJson: entity.payloadJson ?? null,
  createdAt: entity.createdAt.toISOString(),
})

const bindingPatch = (binding: BindingRecord): EntityData<DshAssistantBinding> => ({
  assistantId: binding.assistantId,
  status: binding.status,
  revision: binding.revision,
  updatedAt: new Date(binding.updatedAt),
})

const runCreateData = (run: RunRecord): RequiredEntityData<DshRun> => ({
  id: run.id,
  bindingId: run.bindingId,
  userId: run.userId,
  tenantId: run.tenantId,
  organizationId: run.organizationId,
  sessionId: run.sessionId,
  status: run.status,
  idempotencyKey: run.idempotencyKey,
  requestHash: run.requestHash,
  cursor: run.cursor,
  resultJson: run.resultJson,
  error: run.error,
  startedAt: toDate(run.startedAt),
  finishedAt: toDate(run.finishedAt),
  createdAt: new Date(run.createdAt),
})

const runPatch = (run: RunRecord): EntityData<DshRun> => ({
  status: run.status,
  sessionId: run.sessionId,
  cursor: run.cursor,
  resultJson: run.resultJson,
  error: run.error,
  startedAt: toDate(run.startedAt),
  finishedAt: toDate(run.finishedAt),
})

const eventCreateData = (event: RunEventRecord): RequiredEntityData<DshRunEvent> => ({
  id: event.id,
  runId: event.runId,
  seq: event.seq,
  type: event.type,
  payloadJson: event.payloadJson,
  createdAt: new Date(event.createdAt),
})

const isUniqueViolation = (error: unknown): boolean => {
  if (error instanceof UniqueConstraintViolationException) return true
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown }).code
  return code === '23505' || code === 23505
}

/** Exposed for tests/diagnostics; the constraint name is what classifies the race. */
export const uniqueConstraintOf = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null
  const constraint = (error as { constraint?: unknown }).constraint
  return typeof constraint === 'string' ? constraint : null
}

export type OrmDshRunRepositoryOptions = {
  /**
   * Take `FOR UPDATE` row locks on the binding and on runs read through this
   * repository. Used by the transaction-bound instance in `createOrmRunStore`;
   * leave false for read-only/recovery calls.
   */
  lock?: boolean
}

export class OrmDshRunRepository implements DshRunRepository {
  constructor(
    private readonly em: EntityManager,
    private readonly options: OrmDshRunRepositoryOptions = {},
  ) {}

  private lockOption(): { lockMode: LockMode.PESSIMISTIC_WRITE } | undefined {
    return this.options.lock ? { lockMode: LockMode.PESSIMISTIC_WRITE } : undefined
  }

  async getBinding(bindingId: string): Promise<BindingRecord | null> {
    const entity = await this.em.findOne(
      DshAssistantBinding,
      { id: bindingId },
      this.lockOption() as FindOneOptions<DshAssistantBinding> | undefined,
    )
    return entity ? toBindingRecord(entity) : null
  }

  async saveBinding(binding: BindingRecord): Promise<BindingRecord> {
    // The binding row is locked by `getBinding()` in the revocation transaction,
    // so an id-keyed update cannot race another revoke. The revision increment is
    // computed by the caller from the locked snapshot.
    const affected = await this.em.nativeUpdate(DshAssistantBinding, { id: binding.id }, bindingPatch(binding))
    if (affected === 0) throw new BindingNotFoundError(binding.id)
    return { ...binding }
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    const entity = await this.em.findOne(
      DshRun,
      { id: runId },
      this.lockOption() as FindOneOptions<DshRun> | undefined,
    )
    return entity ? toRunRecord(entity) : null
  }

  async getRunByIdempotencyKey(bindingId: string, idempotencyKey: string): Promise<RunRecord | null> {
    const entity = await this.em.findOne(DshRun, { bindingId, idempotencyKey })
    return entity ? toRunRecord(entity) : null
  }

  async listRunsByBinding(bindingId: string): Promise<RunRecord[]> {
    const entities = await this.em.find(
      DshRun,
      { bindingId },
      this.lockOption() as FindOptions<DshRun> | undefined,
    )
    return entities.map(toRunRecord)
  }

  async listRunsByStatuses(statuses: readonly RunStatus[]): Promise<RunRecord[]> {
    const entities = await this.em.find(
      DshRun,
      { status: { $in: [...statuses] } } as FilterQuery<DshRun>,
      { orderBy: { createdAt: 'asc', id: 'asc' } },
    )
    return entities.map(toRunRecord)
  }

  /**
   * Insert a new run. The nested `transactional()` is a PostgreSQL savepoint
   * when the caller already opened one: a 23505 from either unique constraint
   * rolls back only this insert, so `createRunStore().submit()` can re-read the
   * winner on the still-usable outer transaction.
   */
  async insertRun(run: RunRecord): Promise<RunRecord> {
    return this.em.transactional(async (tx) => {
      const entity = tx.create(DshRun, runCreateData(run))
      tx.persist(entity)
      await tx.flush()
      return toRunRecord(entity)
    })
  }

  /** Explicit name for callers that want "create" without the store vocabulary. */
  async createRun(run: RunRecord): Promise<RunRecord> {
    return this.insertRun(run)
  }

  /**
   * CAS update for every state transition the pure store performs.
   *
   * Terminal targets (completed/failed/cancelled/budget_exhausted/expired) match
   * only rows that are still in flight, which is what makes "a terminal run is
   * never rewritten" true under concurrency. A running target with cursor > 0
   * is an event append and must match the cursor that the insertEvent CAS just
   * wrote; cursor 0 is queued -> running.
   */
  async updateRun(run: RunRecord): Promise<RunRecord> {
    const patch = runPatch(run)

    if (isTerminalRunStatus(run.status)) {
      const affected = await this.em.nativeUpdate(
        DshRun,
        { id: run.id, status: { $in: [...IN_FLIGHT_RUN_STATUSES] } },
        patch,
      )
      if (affected === 0) await this.throwUpdateFailure(run)
      return this.loadRun(run.id)
    }

    if (run.status === 'running') {
      if (run.cursor === 0) {
        // queued -> running; never match an already-running row, or a second
        // start could overwrite the first session id.
        const started = await this.em.nativeUpdate(DshRun, { id: run.id, status: 'queued' }, patch)
        if (started > 0) return this.loadRun(run.id)
      } else {
        // append path: insertEvent already moved cursor to run.cursor.
        const appended = await this.em.nativeUpdate(
          DshRun,
          { id: run.id, status: 'running', cursor: run.cursor },
          patch,
        )
        if (appended > 0) return this.loadRun(run.id)
      }
      await this.throwUpdateFailure(run)
    }

    const affected = await this.em.nativeUpdate(DshRun, { id: run.id, status: run.status }, patch)
    if (affected === 0) await this.throwUpdateFailure(run)
    return this.loadRun(run.id)
  }

  private async loadRun(runId: string): Promise<RunRecord> {
    const entity = await this.em.findOne(DshRun, { id: runId })
    if (!entity) throw new RunNotFoundError(runId)
    return toRunRecord(entity)
  }

  private async throwUpdateFailure(target: RunRecord): Promise<never> {
    const current = await this.em.findOne(DshRun, { id: target.id })
    if (!current) throw new RunNotFoundError(target.id)
    if (isTerminalRunStatus(current.status)) throw new TerminalRunError(target.id, current.status)
    if (target.status === 'running' && target.cursor > 0) {
      if (current.status !== 'running') throw new RunNotRunningError(target.id, current.status)
      if (current.cursor >= target.cursor) throw new DuplicateSequenceError(target.id, target.cursor)
      throw new SequenceGapError(target.id, current.cursor, target.cursor)
    }
    throw new InvalidTransitionError(current.status, target.status)
  }

  /**
   * Append an event with the CAS-before-insert order the B2 contract requires.
   * Both statements live in one savepoint, so a duplicate event cannot leave the
   * run cursor advanced without its event row.
   */
  async insertEvent(event: RunEventRecord): Promise<RunEventRecord> {
    try {
      return await this.em.transactional(async (tx) => {
        const affected = await tx.nativeUpdate(
          DshRun,
          { id: event.runId, status: 'running', cursor: event.seq - 1 },
          { cursor: event.seq },
        )
        if (affected === 0) await this.throwAppendFailure(tx, event.runId, event.seq)

        const entity = tx.create(DshRunEvent, eventCreateData(event))
        tx.persist(entity)
        await tx.flush()
        return toEventRecord(entity)
      })
    } catch (error) {
      const constraint = uniqueConstraintOf(error)
      // Only the (run_id, seq) index means a duplicate stream position. A PK
      // collision (astronomically unlikely with UUIDs) is not a sequence error.
      if (isUniqueViolation(error) && (constraint === null || constraint === 'dsh_run_events_run_seq_uq')) {
        throw new DuplicateSequenceError(event.runId, event.seq)
      }
      throw error
    }
  }

  private async throwAppendFailure(em: EntityManager, runId: string, seq: number): Promise<never> {
    const current = await em.findOne(DshRun, { id: runId })
    if (!current) throw new RunNotFoundError(runId)
    if (isTerminalRunStatus(current.status)) throw new TerminalRunError(runId, current.status)
    if (current.status !== 'running') throw new RunNotRunningError(runId, current.status)
    if (current.cursor >= seq) throw new DuplicateSequenceError(runId, seq)
    if (current.cursor === seq - 1) {
      // The CAS predicate matched but no row changed; this is an unexpected
      // state/locking anomaly, not a client sequence error.
      throw new InvalidTransitionError(current.status, 'running')
    }
    throw new SequenceGapError(runId, current.cursor, seq)
  }

  async getEvent(runId: string, seq: number): Promise<RunEventRecord | null> {
    const entity = await this.em.findOne(DshRunEvent, { runId, seq })
    return entity ? toEventRecord(entity) : null
  }

  async listEventsAfter(runId: string, cursor: number): Promise<RunEventRecord[]> {
    const entities = await this.em.find(
      DshRunEvent,
      { runId, seq: { $gt: cursor } },
      { orderBy: { seq: 'asc' } },
    )
    return entities.map(toEventRecord)
  }
}

/**
 * Build a `DshRunStore` whose multi-row operations have transaction boundaries.
 *
 * `submit` and `revokeBinding` are explicitly required to be transactional;
 * `start`, `appendEvent` and `finish` are wrapped too because their CAS update
 * and event insert must commit or roll back together. Read-only recovery and
 * cursor reads use the caller's EM without opening a transaction.
 */
export function createOrmRunStore(em: EntityManager, deps: RunStoreDeps = {}): DshRunStore {
  const storeFor = (scope: EntityManager, lock: boolean): DshRunStore =>
    createRunStore(new OrmDshRunRepository(scope, { lock }), deps)

  return {
    submit: (input) => em.transactional((tx) => storeFor(tx, true).submit(input)),
    start: (runId, input) => em.transactional((tx) => storeFor(tx, true).start(runId, input)),
    appendEvent: (input) => em.transactional((tx) => storeFor(tx, true).appendEvent(input)),
    finish: (input) => em.transactional((tx) => storeFor(tx, true).finish(input)),
    recoverInFlight: () => storeFor(em, false).recoverInFlight(),
    eventsAfter: (runId, cursor) => storeFor(em, false).eventsAfter(runId, cursor),
    revokeBinding: (bindingId, options) =>
      em.transactional((tx) => storeFor(tx, true).revokeBinding(bindingId, options)),
  }
}
