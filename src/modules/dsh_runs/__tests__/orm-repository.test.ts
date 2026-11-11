import { beforeEach, describe, expect, it } from '@jest/globals'
import { LockMode, type EntityManager } from '@mikro-orm/core'
import { DshAssistantBinding, DshRun, DshRunEvent } from '../data/entities'
import { OrmDshRunRepository, createOrmRunStore } from '../services/orm-repository'
import {
  ConcurrentRunError,
  DuplicateSequenceError,
  IdempotencyConflictError,
  RunNotFoundError,
  TerminalRunError,
  type DshRunStore,
  type RunRecord,
} from '../services/run-store'

const TENANT_ID = 'tenant-1'
const ORG_ID = 'org-1'
const USER_ID = 'user-1'
const BINDING_ID = 'binding-1'
const T0 = '2026-11-11T08:00:00.000Z'

type Row = Record<string, unknown>
type RowMap = Map<unknown, Row[]>

const IN_FLIGHT = new Set(['queued', 'running', 'awaiting_approval'])
const isInFlight = (status: unknown): boolean => typeof status === 'string' && IN_FLIGHT.has(status)

const isOperatorObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)

function matches(row: Row, where: Row): boolean {
  for (const [key, expected] of Object.entries(where)) {
    if (key === '$or') {
      if (!(expected as Row[]).some((branch) => matches(row, branch))) return false
      continue
    }
    const actual = row[key]
    if (isOperatorObject(expected)) {
      if ('$in' in expected && !(expected.$in as unknown[]).includes(actual)) return false
      if ('$in' in expected) continue
      if ('$gt' in expected && !((actual as number) > (expected.$gt as number))) return false
      if ('$gt' in expected) continue
      if ('$gte' in expected && !((actual as number) >= (expected.$gte as number))) return false
      if ('$gte' in expected) continue
      if ('$lt' in expected && !((actual as number) < (expected.$lt as number))) return false
      if ('$lt' in expected) continue
      if ('$ne' in expected && actual === expected.$ne) return false
      if ('$ne' in expected) continue
      return false
    }
    if (actual !== expected) return false
  }
  return true
}

function sortRows(rows: Row[], orderBy: Record<string, 'asc' | 'desc'>): Row[] {
  return [...rows].sort((a, b) => {
    for (const [field, direction] of Object.entries(orderBy)) {
      const left = a[field]
      const right = b[field]
      if (left === right) continue
      const comparison =
        left instanceof Date && right instanceof Date
          ? left.getTime() - right.getTime()
          : String(left).localeCompare(String(right))
      return direction === 'desc' ? -comparison : comparison
    }
    return 0
  })
}

function uniqueViolation(constraint: string): Error {
  return Object.assign(new Error(`duplicate key value violates unique constraint "${constraint}"`), {
    code: '23505',
    constraint,
  })
}

/**
 * Minimal EntityManager double: just the methods the adapter actually uses.
 * `transactional()` snapshots tables/pending rows so a savepoint rollback is
 * observable in tests; it never opens a connection.
 */
class FakeEntityManager {
  readonly tables: RowMap = new Map()
  private pending = new Set<Row>()
  private readonly entityByRow = new WeakMap<object, unknown>()
  private depth = 0

  transactionalCalls = 0
  maxTransactionDepth = 0
  readonly lockModes: Array<{ entity: unknown; lockMode: number }> = []
  hideIdempotencyLookupOnce = false
  hideBindingRunsOnce = false
  onBeforeNativeUpdate?: (entity: unknown, where: Row, patch: Row) => void
  failNativeUpdate?: (entity: unknown, where: Row, patch: Row) => boolean | undefined

  rows(entity: unknown): Row[] {
    let rows = this.tables.get(entity)
    if (!rows) {
      rows = []
      this.tables.set(entity, rows)
    }
    return rows
  }

  seed(entity: unknown, row: Row): Row {
    this.rows(entity).push(row)
    return row
  }

  async findOne(entity: unknown, where: Row, options?: { lockMode?: number }): Promise<Row | null> {
    if (options?.lockMode !== undefined) this.lockModes.push({ entity, lockMode: options.lockMode })
    const name = (entity as { name?: string }).name
    if (name === 'DshRun' && this.hideIdempotencyLookupOnce && 'idempotencyKey' in where) {
      // Simulate the race where another worker's row becomes visible only after
      // this request's pre-check.
      this.hideIdempotencyLookupOnce = false
      return null
    }
    const found = this.rows(entity).find((row) => matches(row, where))
    return found ? { ...found } : null
  }

  async find(
    entity: unknown,
    where: Row,
    options: { orderBy?: Record<string, 'asc' | 'desc'>; lockMode?: number } = {},
  ): Promise<Row[]> {
    if (options.lockMode !== undefined) this.lockModes.push({ entity, lockMode: options.lockMode })
    const name = (entity as { name?: string }).name
    if (name === 'DshRun' && this.hideBindingRunsOnce && 'bindingId' in where && !('status' in where)) {
      this.hideBindingRunsOnce = false
      return []
    }
    let rows = this.rows(entity)
      .filter((row) => matches(row, where))
      .map((row) => ({ ...row }))
    if (options.orderBy) rows = sortRows(rows, options.orderBy)
    return rows
  }

  create(entity: unknown, data: Row): Row {
    const row = { ...data }
    this.entityByRow.set(row, entity)
    return row
  }

  persist(entity: Row): void {
    this.pending.add(entity)
  }

  async flush(): Promise<void> {
    const batch = [...this.pending]
    // Validate the whole batch before writing so a failed flush behaves like a
    // rolled-back savepoint rather than a partial insert.
    for (const row of batch) {
      const entity = this.entityByRow.get(row)
      const name = (entity as { name?: string }).name
      const existing = this.rows(entity)
      if (name === 'DshRun') {
        if (
          existing.some(
            (candidate) =>
              candidate.bindingId === row.bindingId && candidate.idempotencyKey === row.idempotencyKey,
          )
        ) {
          throw uniqueViolation('dsh_runs_binding_idempotency_uq')
        }
        if (
          isInFlight(row.status) &&
          existing.some((candidate) => candidate.bindingId === row.bindingId && isInFlight(candidate.status))
        ) {
          throw uniqueViolation('dsh_runs_one_in_flight_per_binding_uq')
        }
      } else if (name === 'DshRunEvent') {
        if (existing.some((candidate) => candidate.runId === row.runId && candidate.seq === row.seq)) {
          throw uniqueViolation('dsh_run_events_run_seq_uq')
        }
      } else if (name === 'DshAssistantBinding') {
        if (
          existing.some(
            (candidate) =>
              candidate.tenantId === row.tenantId &&
              candidate.organizationId === row.organizationId &&
              candidate.userId === row.userId,
          )
        ) {
          throw uniqueViolation('dsh_assistant_bindings_tenant_org_user_uq')
        }
      }
    }
    for (const row of batch) this.rows(this.entityByRow.get(row)).push(row)
    this.pending.clear()
  }

  async nativeUpdate(entity: unknown, where: Row, patch: Row): Promise<number> {
    this.onBeforeNativeUpdate?.(entity, where, patch)
    if (this.failNativeUpdate?.(entity, where, patch)) {
      throw new Error('forced nativeUpdate failure')
    }
    let affected = 0
    for (const row of this.rows(entity)) {
      if (!matches(row, where)) continue
      Object.assign(row, patch)
      affected += 1
    }
    return affected
  }

  async transactional<T>(callback: (em: this) => T | Promise<T>): Promise<T> {
    this.transactionalCalls += 1
    this.depth += 1
    this.maxTransactionDepth = Math.max(this.maxTransactionDepth, this.depth)
    const snapshot = this.snapshot()
    try {
      return await callback(this)
    } catch (error) {
      this.restore(snapshot)
      throw error
    } finally {
      this.depth -= 1
    }
  }

  private snapshot(): { tables: RowMap; pending: Row[] } {
    const tables: RowMap = new Map()
    for (const [entity, rows] of this.tables) tables.set(entity, rows.map((row) => ({ ...row })))
    return { tables, pending: [...this.pending] }
  }

  private restore(snapshot: { tables: RowMap; pending: Row[] }): void {
    this.tables.clear()
    for (const [entity, rows] of snapshot.tables) this.tables.set(entity, rows)
    this.pending = new Set(snapshot.pending)
  }
}

function bindingRow(overrides: Row = {}): Row {
  return {
    id: BINDING_ID,
    tenantId: TENANT_ID,
    organizationId: ORG_ID,
    userId: USER_ID,
    assistantId: 'assistant-1',
    status: 'active',
    revision: 1,
    createdAt: new Date(T0),
    updatedAt: new Date(T0),
    ...overrides,
  }
}

function runRow(overrides: Row = {}): Row {
  const id = String(overrides.id ?? 'run-1')
  return {
    id,
    bindingId: BINDING_ID,
    userId: USER_ID,
    tenantId: TENANT_ID,
    organizationId: ORG_ID,
    sessionId: 'session-1',
    status: 'running',
    idempotencyKey: `key-${id}`,
    requestHash: `hash-${id}`,
    cursor: 0,
    resultJson: null,
    error: null,
    startedAt: new Date(T0),
    finishedAt: null,
    createdAt: new Date(T0),
    ...overrides,
  }
}

function eventRow(overrides: Row = {}): Row {
  const id = String(overrides.id ?? 'event-1')
  return {
    id,
    runId: 'run-1',
    seq: 1,
    type: 'session.event',
    payloadJson: null,
    createdAt: new Date(T0),
    ...overrides,
  }
}

function runRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  const id = overrides.id ?? 'run-new'
  return {
    id,
    bindingId: 'binding-2',
    userId: 'user-2',
    tenantId: TENANT_ID,
    organizationId: ORG_ID,
    sessionId: null,
    status: 'queued',
    idempotencyKey: `key-${id}`,
    requestHash: `hash-${id}`,
    cursor: 0,
    resultJson: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: T0,
    ...overrides,
  }
}

describe('OrmDshRunRepository / createOrmRunStore', () => {
  let fake: FakeEntityManager
  let store: DshRunStore
  let nowMs: number
  let idSeq: number

  const advance = (ms = 1_000): string => {
    nowMs += ms
    return new Date(nowMs).toISOString()
  }
  const current = (): string => new Date(nowMs).toISOString()

  const submitRun = (overrides: Record<string, unknown> = {}) =>
    store.submit({
      bindingId: BINDING_ID,
      userId: USER_ID,
      tenantId: TENANT_ID,
      organizationId: ORG_ID,
      idempotencyKey: 'key-1',
      requestHash: 'hash-1',
      ...overrides,
    })

  beforeEach(() => {
    fake = new FakeEntityManager()
    nowMs = Date.parse(T0)
    idSeq = 0
    store = createOrmRunStore(fake as unknown as EntityManager, {
      now: () => new Date(nowMs),
      newId: () => `id-${++idSeq}`,
    })
    fake.seed(DshAssistantBinding, bindingRow())
  })

  describe('submit transaction and 23505 handling', () => {
    it('creates a queued run in an outer transaction plus an insert savepoint and maps dates to ISO strings', async () => {
      const { run, replayed } = await submitRun()

      expect(replayed).toBe(false)
      expect(run.status).toBe('queued')
      expect(run.createdAt).toBe(current())
      expect(typeof run.createdAt).toBe('string')
      expect(Object.getPrototypeOf(run)).toBe(Object.prototype)

      const [row] = fake.rows(DshRun)
      expect(row.id).toBe(run.id)
      expect(row.createdAt).toBeInstanceOf(Date)
      expect(row.startedAt).toBeNull()
      expect(fake.transactionalCalls).toBeGreaterThanOrEqual(2)
      expect(fake.maxTransactionDepth).toBeGreaterThanOrEqual(2)
    })

    it('replays an existing run for the same key and hash', async () => {
      const first = await submitRun()
      const second = await submitRun()

      expect(second.replayed).toBe(true)
      expect(second.run.id).toBe(first.run.id)
      expect(fake.rows(DshRun)).toHaveLength(1)
    })

    it('turns a 23505 idempotency-key race into a replay by re-reading the winner', async () => {
      fake.seed(
        DshRun,
        runRow({
          id: 'run-existing',
          status: 'completed',
          idempotencyKey: 'key-1',
          requestHash: 'hash-1',
        }),
      )
      // The pre-check misses the row; the insert then hits the unique index.
      fake.hideIdempotencyLookupOnce = true

      const result = await submitRun()

      expect(result.replayed).toBe(true)
      expect(result.run.id).toBe('run-existing')
      expect(fake.rows(DshRun)).toHaveLength(1)
      expect(fake.maxTransactionDepth).toBeGreaterThanOrEqual(2)
    })

    it('turns a 23505 idempotency-key race with a different hash into IdempotencyConflictError', async () => {
      fake.seed(
        DshRun,
        runRow({
          id: 'run-existing',
          status: 'completed',
          idempotencyKey: 'key-1',
          requestHash: 'hash-original',
        }),
      )
      fake.hideIdempotencyLookupOnce = true

      const error = await submitRun({ requestHash: 'hash-edited' }).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(IdempotencyConflictError)
      expect(error).toMatchObject({ code: 'idempotency-conflict' })
      expect(fake.rows(DshRun)).toHaveLength(1)
    })

    it('turns a 23505 in-flight race into ConcurrentRunError', async () => {
      fake.seed(
        DshRun,
        runRow({
          id: 'run-live',
          status: 'running',
          idempotencyKey: 'key-live',
          requestHash: 'hash-live',
        }),
      )
      // Hide the in-flight row from the pre-check so the insert reaches the
      // partial unique index instead of being rejected by the in-memory check.
      fake.hideBindingRunsOnce = true

      const error = await submitRun({ idempotencyKey: 'key-2', requestHash: 'hash-2' }).catch(
        (caught: unknown) => caught,
      )
      expect(error).toBeInstanceOf(ConcurrentRunError)
      expect(error).toMatchObject({ code: 'concurrent-run' })
      expect(fake.rows(DshRun)).toHaveLength(1)
    })

    it('takes FOR UPDATE locks on the binding and the run set for submit', async () => {
      await submitRun()

      expect(
        fake.lockModes.some(
          (entry) => entry.entity === DshAssistantBinding && entry.lockMode === LockMode.PESSIMISTIC_WRITE,
        ),
      ).toBe(true)
      expect(
        fake.lockModes.some(
          (entry) => entry.entity === DshRun && entry.lockMode === LockMode.PESSIMISTIC_WRITE,
        ),
      ).toBe(true)
    })

    it('rejects a second in-flight run even without a unique-index race', async () => {
      fake.seed(
        DshRun,
        runRow({ id: 'run-live', status: 'running', idempotencyKey: 'key-live' }),
      )

      await expect(
        submitRun({ idempotencyKey: 'key-2', requestHash: 'hash-2' }),
      ).rejects.toBeInstanceOf(ConcurrentRunError)
    })
  })

  describe('start / appendEvent CAS', () => {
    it('starts a queued run with a CAS on status = queued', async () => {
      fake.seed(
        DshRun,
        runRow({ id: 'run-1', status: 'queued', sessionId: null, startedAt: null, cursor: 0 }),
      )
      advance(500)

      const started = await store.start('run-1', { sessionId: 'session-9' })

      expect(started.status).toBe('running')
      expect(started.sessionId).toBe('session-9')
      expect(started.startedAt).toBe(current())
      const [row] = fake.rows(DshRun)
      expect(row.status).toBe('running')
      expect(row.startedAt).toBeInstanceOf(Date)
    })

    it('CAS-updates the cursor before inserting the event', async () => {
      fake.seed(DshRun, runRow({ id: 'run-1', status: 'running', cursor: 0 }))

      const { event, run } = await store.appendEvent({
        runId: 'run-1',
        seq: 1,
        type: 'session.event',
        payload: { text: 'hello' },
      })

      expect(event.seq).toBe(1)
      expect(run.cursor).toBe(1)
      const [row] = fake.rows(DshRun)
      expect(row.cursor).toBe(1)
      const [storedEvent] = fake.rows(DshRunEvent)
      expect(storedEvent.payloadJson).toEqual({ text: 'hello' })
      expect(storedEvent.createdAt).toBeInstanceOf(Date)
      expect(fake.maxTransactionDepth).toBeGreaterThanOrEqual(2)
    })

    it('fails the append when the CAS predicate no longer matches because the run became terminal', async () => {
      fake.seed(DshRun, runRow({ id: 'run-1', status: 'running', cursor: 1 }))
      fake.onBeforeNativeUpdate = (entity, _where, patch) => {
        if (entity === DshRun && patch.cursor === 2) {
          fake.rows(DshRun)[0].status = 'cancelled'
        }
      }

      await expect(
        store.appendEvent({ runId: 'run-1', seq: 2, type: 'session.event' }),
      ).rejects.toBeInstanceOf(TerminalRunError)

      const [row] = fake.rows(DshRun)
      expect(row.status).toBe('running')
      expect(row.cursor).toBe(1)
      expect(fake.rows(DshRunEvent)).toHaveLength(0)
    })

    it('diagnoses a CAS cursor mismatch as a duplicate sequence', async () => {
      fake.seed(DshRun, runRow({ id: 'run-1', status: 'running', cursor: 1 }))
      fake.onBeforeNativeUpdate = (entity, _where, patch) => {
        if (entity === DshRun && patch.cursor === 2) {
          fake.rows(DshRun)[0].cursor = 2
        }
      }

      await expect(
        store.appendEvent({ runId: 'run-1', seq: 2, type: 'session.event' }),
      ).rejects.toBeInstanceOf(DuplicateSequenceError)

      const [row] = fake.rows(DshRun)
      expect(row.cursor).toBe(1)
    })

    it('rolls back the cursor CAS when the event insert hits the unique index', async () => {
      const repo = new OrmDshRunRepository(fake as unknown as EntityManager)
      fake.seed(DshRun, runRow({ id: 'run-1', status: 'running', cursor: 1 }))
      // Inconsistent state: event 2 exists but the cursor is still 1. This is
      // the only way to reach the event unique index without the CAS rejecting
      // first, and it proves the savepoint rolls the CAS back.
      fake.seed(DshRunEvent, eventRow({ id: 'event-2', runId: 'run-1', seq: 2 }))

      await expect(
        repo.insertEvent({
          id: 'event-2b',
          runId: 'run-1',
          seq: 2,
          type: 'session.event',
          payloadJson: null,
          createdAt: T0,
        }),
      ).rejects.toBeInstanceOf(DuplicateSequenceError)

      const [row] = fake.rows(DshRun)
      expect(row.cursor).toBe(1)
      expect(fake.rows(DshRunEvent)).toHaveLength(1)
    })

    it('returns only events after the supplied cursor, ordered by seq', async () => {
      fake.seed(DshRun, runRow({ id: 'run-1', status: 'running', cursor: 3 }))
      fake.seed(DshRunEvent, eventRow({ id: 'e1', seq: 1, type: 'a' }))
      fake.seed(DshRunEvent, eventRow({ id: 'e2', seq: 2, type: 'b' }))
      fake.seed(DshRunEvent, eventRow({ id: 'e3', seq: 3, type: 'c' }))

      const events = await store.eventsAfter('run-1', 1)

      expect(events.map((event) => event.seq)).toEqual([2, 3])
      expect(events[0].createdAt).toBe(T0)
      await expect(store.eventsAfter('missing', 0)).rejects.toBeInstanceOf(RunNotFoundError)
    })
  })

  describe('finish CAS', () => {
    it('moves a running run to a terminal state with a status-in-flight predicate', async () => {
      fake.seed(DshRun, runRow({ id: 'run-1', status: 'running', cursor: 1 }))
      advance(250)

      const finished = await store.finish({
        runId: 'run-1',
        status: 'completed',
        result: { finalResponse: 'ok' },
      })

      expect(finished.status).toBe('completed')
      expect(finished.resultJson).toEqual({ finalResponse: 'ok' })
      expect(finished.finishedAt).toBe(current())
      const [row] = fake.rows(DshRun)
      expect(row.status).toBe('completed')
      expect(row.finishedAt).toBeInstanceOf(Date)
    })

    it('fails with a terminal-run error when the in-flight CAS loses to another finish', async () => {
      fake.seed(DshRun, runRow({ id: 'run-1', status: 'running', cursor: 1 }))
      fake.onBeforeNativeUpdate = (entity, _where, patch) => {
        if (entity === DshRun && patch.status === 'completed') {
          fake.rows(DshRun)[0].status = 'completed'
        }
      }

      await expect(
        store.finish({ runId: 'run-1', status: 'completed', result: { finalResponse: 'ok' } }),
      ).rejects.toBeInstanceOf(TerminalRunError)

      const [row] = fake.rows(DshRun)
      expect(row.status).toBe('running')
    })
  })

  describe('revokeBinding transaction', () => {
    it('revokes the binding and cancels only its in-flight runs in one transaction', async () => {
      fake.seed(
        DshRun,
        runRow({ id: 'run-live', status: 'running', idempotencyKey: 'key-live' }),
      )
      fake.seed(
        DshRun,
        runRow({
          id: 'run-done',
          status: 'completed',
          idempotencyKey: 'key-done',
          finishedAt: new Date(T0),
        }),
      )
      fake.seed(DshAssistantBinding, bindingRow({ id: 'binding-2', userId: 'user-2' }))
      fake.seed(
        DshRun,
        runRow({
          id: 'run-other',
          bindingId: 'binding-2',
          userId: 'user-2',
          status: 'running',
          idempotencyKey: 'key-other',
        }),
      )

      advance(10_000)
      const revokedAt = current()
      const result = await store.revokeBinding(BINDING_ID)

      expect(result.binding.status).toBe('revoked')
      expect(result.binding.revision).toBe(2)
      expect(result.binding.updatedAt).toBe(revokedAt)
      expect(result.revokedAt).toBe(revokedAt)
      expect(result.cancelled.map((run) => run.id)).toEqual(['run-live'])
      expect(result.cancelled[0]).toMatchObject({
        status: 'cancelled',
        finishedAt: revokedAt,
        error: 'principal_revoked',
      })

      const live = fake.rows(DshRun).find((row) => row.id === 'run-live')
      expect(live?.status).toBe('cancelled')
      expect(live?.finishedAt).toBeInstanceOf(Date)
      const done = fake.rows(DshRun).find((row) => row.id === 'run-done')
      expect(done?.status).toBe('completed')
      const other = fake.rows(DshRun).find((row) => row.id === 'run-other')
      expect(other?.status).toBe('running')
      const binding = fake.rows(DshAssistantBinding).find((row) => row.id === BINDING_ID)
      expect(binding?.status).toBe('revoked')
      expect(binding?.revision).toBe(2)
      expect(fake.transactionalCalls).toBeGreaterThanOrEqual(1)
      expect(fake.maxTransactionDepth).toBeGreaterThanOrEqual(1)
    })

    it('rolls the whole revocation back when the binding update fails', async () => {
      fake.seed(
        DshRun,
        runRow({ id: 'run-live', status: 'running', idempotencyKey: 'key-live' }),
      )
      fake.failNativeUpdate = (entity) => entity === DshAssistantBinding

      await expect(store.revokeBinding(BINDING_ID)).rejects.toThrow('forced nativeUpdate failure')

      const live = fake.rows(DshRun).find((row) => row.id === 'run-live')
      expect(live?.status).toBe('running')
      expect(live?.finishedAt).toBeNull()
      const binding = fake.rows(DshAssistantBinding).find((row) => row.id === BINDING_ID)
      expect(binding?.status).toBe('active')
      expect(binding?.revision).toBe(1)
    })
  })

  describe('recoverInFlight and repository surface', () => {
    it('lists queued/running/awaiting-approval runs with session id and cursor', async () => {
      fake.seed(
        DshRun,
        runRow({
          id: 'run-running',
          status: 'running',
          cursor: 3,
          sessionId: 'session-running',
          createdAt: new Date('2026-11-11T08:00:01.000Z'),
        }),
      )
      fake.seed(
        DshRun,
        runRow({
          id: 'run-queued',
          status: 'queued',
          cursor: 0,
          sessionId: null,
          createdAt: new Date('2026-11-11T08:00:00.000Z'),
        }),
      )
      fake.seed(
        DshRun,
        runRow({
          id: 'run-approval',
          status: 'awaiting_approval',
          cursor: 2,
          sessionId: 'session-approval',
          createdAt: new Date('2026-11-11T08:00:02.000Z'),
        }),
      )
      fake.seed(DshRun, runRow({ id: 'run-done', status: 'completed' }))

      const recovered = await store.recoverInFlight()

      expect(recovered.map((entry) => entry.runId)).toEqual([
        'run-queued',
        'run-running',
        'run-approval',
      ])
      expect(recovered[1]).toMatchObject({
        sessionId: 'session-running',
        cursor: 3,
        status: 'running',
      })
    })

    it('exposes getRun/createRun and the rest of the repository interface', async () => {
      const repo = new OrmDshRunRepository(fake as unknown as EntityManager)
      fake.seed(DshRun, runRow({ id: 'run-1', status: 'running', cursor: 2 }))

      const found = await repo.getRun('run-1')
      expect(found?.cursor).toBe(2)
      expect(typeof found?.createdAt).toBe('string')

      const created = await repo.createRun(runRecord({ id: 'run-new', bindingId: 'binding-3' }))
      expect(created.id).toBe('run-new')
      expect(fake.rows(DshRun).some((row) => row.id === 'run-new')).toBe(true)
    })
  })
})

/**
 * Real-database skeleton. It is skipped unless a disposable PostgreSQL URL is
 * supplied; the default test run never opens a connection. Before enabling it,
 * apply the reviewed dsh_runs migration to that database and replace the trivial
 * assertion with a round-trip (binding -> submit -> append -> finish -> revoke).
 */
const describeWithDatabase = process.env.DSH_RUNS_TEST_DATABASE_URL ? describe : describe.skip

describeWithDatabase('OrmDshRunRepository (real PostgreSQL)', () => {
  it('is an env-gated skeleton and must not run without DSH_RUNS_TEST_DATABASE_URL', () => {
    expect(process.env.DSH_RUNS_TEST_DATABASE_URL).toBeTruthy()
  })
})
