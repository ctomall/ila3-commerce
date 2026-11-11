import { beforeEach, describe, expect, it } from '@jest/globals'
import {
  applyPrincipalRevoked,
  withinRevocationDeadline,
  type Run as StateMachineRun,
} from '../../../lib/dsh/run'
import {
  BindingIdentityMismatchError,
  BindingNotActiveError,
  ConcurrentRunError,
  DuplicateSequenceError,
  IdempotencyConflictError,
  InvalidCursorError,
  InvalidTransitionError,
  RunNotFoundError,
  SequenceGapError,
  TerminalRunError,
  createRunStore,
  isInFlightRunStatus,
  type BindingRecord,
  type DshRunRepository,
  type RunEventRecord,
  type RunRecord,
  type RunStoreDeps,
  type SubmitRunInput,
} from '../services/run-store'

const TENANT_ID = 'tenant-1'
const ORG_ID = 'org-1'
const USER_ID = 'user-1'
const BINDING_ID = 'binding-1'
const T0 = '2026-11-11T07:00:00.000Z'

class FakeRepository implements DshRunRepository {
  readonly bindings = new Map<string, BindingRecord>()
  readonly runs = new Map<string, RunRecord>()
  readonly events = new Map<string, RunEventRecord>()

  private eventKey(runId: string, seq: number): string {
    return `${runId}:${seq}`
  }

  async getBinding(bindingId: string): Promise<BindingRecord | null> {
    const binding = this.bindings.get(bindingId)
    return binding ? { ...binding } : null
  }

  async saveBinding(binding: BindingRecord): Promise<BindingRecord> {
    this.bindings.set(binding.id, { ...binding })
    return { ...binding }
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    const run = this.runs.get(runId)
    return run ? { ...run } : null
  }

  async getRunByIdempotencyKey(bindingId: string, idempotencyKey: string): Promise<RunRecord | null> {
    for (const run of this.runs.values()) {
      if (run.bindingId === bindingId && run.idempotencyKey === idempotencyKey) return { ...run }
    }
    return null
  }

  async listRunsByBinding(bindingId: string): Promise<RunRecord[]> {
    return [...this.runs.values()]
      .filter((run) => run.bindingId === bindingId)
      .map((run) => ({ ...run }))
  }

  async listRunsByStatuses(statuses: readonly RunRecord['status'][]): Promise<RunRecord[]> {
    const wanted = new Set(statuses)
    return [...this.runs.values()].filter((run) => wanted.has(run.status)).map((run) => ({ ...run }))
  }

  async insertRun(run: RunRecord): Promise<RunRecord> {
    for (const existing of this.runs.values()) {
      if (existing.bindingId !== run.bindingId) continue
      if (existing.idempotencyKey === run.idempotencyKey) {
        throw new Error(`duplicate idempotency key ${run.idempotencyKey}`)
      }
      // Mirrors the partial unique index in the draft migration.
      if (isInFlightRunStatus(existing.status) && isInFlightRunStatus(run.status)) {
        throw new Error(`binding ${run.bindingId} already has an in-flight run`)
      }
    }
    this.runs.set(run.id, { ...run })
    return { ...run }
  }

  async updateRun(run: RunRecord): Promise<RunRecord> {
    if (!this.runs.has(run.id)) throw new Error(`run ${run.id} does not exist`)
    this.runs.set(run.id, { ...run })
    return { ...run }
  }

  async insertEvent(event: RunEventRecord): Promise<RunEventRecord> {
    const key = this.eventKey(event.runId, event.seq)
    if (this.events.has(key)) throw new Error(`duplicate seq ${event.seq} for run ${event.runId}`)
    this.events.set(key, { ...event })
    return { ...event }
  }

  async getEvent(runId: string, seq: number): Promise<RunEventRecord | null> {
    const event = this.events.get(this.eventKey(runId, seq))
    return event ? { ...event } : null
  }

  async listEventsAfter(runId: string, cursor: number): Promise<RunEventRecord[]> {
    return [...this.events.values()]
      .filter((event) => event.runId === runId && event.seq > cursor)
      .sort((a, b) => a.seq - b.seq)
      .map((event) => ({ ...event }))
  }
}

function makeBinding(overrides: Partial<BindingRecord> = {}): BindingRecord {
  return {
    id: BINDING_ID,
    tenantId: TENANT_ID,
    organizationId: ORG_ID,
    userId: USER_ID,
    assistantId: 'assistant-1',
    status: 'active',
    revision: 1,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  }
}

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  const id = overrides.id ?? 'run-seed'
  return {
    id,
    bindingId: BINDING_ID,
    userId: USER_ID,
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

describe('dsh_runs run store', () => {
  let repo: FakeRepository
  let store: ReturnType<typeof createRunStore>
  let nowMs: number
  let idSeq: number
  let deps: RunStoreDeps

  const advance = (ms = 1_000): string => {
    nowMs += ms
    return new Date(nowMs).toISOString()
  }
  const current = (): string => new Date(nowMs).toISOString()

  const submitRun = (overrides: Partial<SubmitRunInput> = {}) =>
    store.submit({
      bindingId: BINDING_ID,
      userId: USER_ID,
      tenantId: TENANT_ID,
      organizationId: ORG_ID,
      idempotencyKey: 'key-1',
      requestHash: 'hash-1',
      ...overrides,
    })

  const startRun = async (runId: string, sessionId = 'session-1'): Promise<RunRecord> =>
    store.start(runId, { sessionId })

  beforeEach(() => {
    repo = new FakeRepository()
    nowMs = Date.parse(T0)
    idSeq = 0
    deps = {
      now: () => new Date(nowMs),
      newId: () => `id-${++idSeq}`,
    }
    store = createRunStore(repo, deps)
    repo.bindings.set(BINDING_ID, makeBinding())
  })

  describe('submit', () => {
    it('creates a queued run with cursor 0 and the request facts attached', async () => {
      const { run, replayed } = await submitRun()

      expect(replayed).toBe(false)
      expect(run.status).toBe('queued')
      expect(run.cursor).toBe(0)
      expect(run.startedAt).toBeNull()
      expect(run.finishedAt).toBeNull()
      expect(run.sessionId).toBeNull()
      expect(run.requestHash).toBe('hash-1')
      expect(repo.runs.size).toBe(1)
    })

    it('replays the existing run for the same key and request hash', async () => {
      const first = await submitRun()
      advance()
      const second = await submitRun()

      expect(second.replayed).toBe(true)
      expect(second.run.id).toBe(first.run.id)
      expect(second.run.createdAt).toBe(first.run.createdAt)
      expect(repo.runs.size).toBe(1)
    })

    it('rejects the same key with a different request hash', async () => {
      await submitRun()

      await expect(submitRun({ requestHash: 'hash-2' })).rejects.toBeInstanceOf(IdempotencyConflictError)
      await expect(submitRun({ requestHash: 'hash-2' })).rejects.toMatchObject({
        code: 'idempotency-conflict',
      })
      expect(repo.runs.size).toBe(1)
    })

    it('rejects a second in-flight run for the same binding', async () => {
      const first = await submitRun()

      await expect(submitRun({ idempotencyKey: 'key-2' })).rejects.toBeInstanceOf(ConcurrentRunError)
      await expect(submitRun({ idempotencyKey: 'key-2' })).rejects.toMatchObject({
        code: 'concurrent-run',
        message: expect.stringContaining(first.run.id),
      })
    })

    it('allows a new run once the previous one is terminal', async () => {
      const first = await submitRun()
      await store.finish({ runId: first.run.id, status: 'cancelled' })

      const second = await submitRun({ idempotencyKey: 'key-2' })
      expect(second.replayed).toBe(false)
      expect(second.run.id).not.toBe(first.run.id)
    })

    it('refuses suspended and revoked bindings', async () => {
      repo.bindings.set(BINDING_ID, makeBinding({ status: 'suspended' }))
      await expect(submitRun()).rejects.toBeInstanceOf(BindingNotActiveError)

      repo.bindings.set(BINDING_ID, makeBinding({ status: 'revoked' }))
      await expect(submitRun()).rejects.toMatchObject({ code: 'binding-not-active' })
    })

    it('refuses a binding that belongs to another employee or scope', async () => {
      await expect(submitRun({ userId: 'user-2' })).rejects.toBeInstanceOf(BindingIdentityMismatchError)
      await expect(submitRun({ tenantId: 'tenant-2' })).rejects.toMatchObject({
        code: 'binding-identity-mismatch',
      })
      await expect(submitRun({ organizationId: 'org-2' })).rejects.toMatchObject({
        code: 'binding-identity-mismatch',
      })
      expect(repo.runs.size).toBe(0)
    })

    it('surfaces a missing binding instead of creating an orphan run', async () => {
      await expect(submitRun({ bindingId: 'missing' })).rejects.toMatchObject({
        code: 'binding-not-found',
      })
    })
  })

  describe('start', () => {
    it('moves queued to running and persists the DSH session id', async () => {
      const { run } = await submitRun()
      advance(500)
      const started = await startRun(run.id)

      expect(started.status).toBe('running')
      expect(started.sessionId).toBe('session-1')
      expect(started.startedAt).toBe(current())
    })

    it('is idempotent for the same session and refuses a different one', async () => {
      const { run } = await submitRun()
      await startRun(run.id)

      await expect(startRun(run.id)).resolves.toMatchObject({ sessionId: 'session-1' })
      await expect(startRun(run.id, 'session-2')).rejects.toBeInstanceOf(InvalidTransitionError)
    })
  })

  describe('appendEvent', () => {
    it('appends contiguous events and advances the run cursor', async () => {
      const { run } = await submitRun()
      await startRun(run.id)

      const first = await store.appendEvent({
        runId: run.id,
        seq: 1,
        type: 'session.event',
        payload: { text: 'hello' },
      })
      advance()
      const second = await store.appendEvent({
        runId: run.id,
        seq: 2,
        type: 'session.status',
      })

      expect(first.event.seq).toBe(1)
      expect(first.run.cursor).toBe(1)
      expect(second.run.cursor).toBe(2)
      expect(second.event.payloadJson).toBeNull()
      expect(repo.events.size).toBe(2)
    })

    it('rejects a duplicate seq', async () => {
      const { run } = await submitRun()
      await startRun(run.id)
      await store.appendEvent({ runId: run.id, seq: 1, type: 'session.event' })
      await store.appendEvent({ runId: run.id, seq: 2, type: 'session.event' })

      await expect(
        store.appendEvent({ runId: run.id, seq: 2, type: 'session.event' }),
      ).rejects.toBeInstanceOf(DuplicateSequenceError)
      await expect(
        store.appendEvent({ runId: run.id, seq: 2, type: 'session.event' }),
      ).rejects.toMatchObject({ code: 'duplicate-sequence' })
    })

    it('rejects a gap instead of leaving a hole in the stream', async () => {
      const { run } = await submitRun()
      await startRun(run.id)
      await store.appendEvent({ runId: run.id, seq: 1, type: 'session.event' })

      await expect(
        store.appendEvent({ runId: run.id, seq: 3, type: 'session.event' }),
      ).rejects.toBeInstanceOf(SequenceGapError)
      await expect(
        store.appendEvent({ runId: run.id, seq: 3, type: 'session.event' }),
      ).rejects.toMatchObject({ code: 'sequence-gap' })
    })

    it('refuses events before the run is running or after it is terminal', async () => {
      const { run } = await submitRun()
      await expect(
        store.appendEvent({ runId: run.id, seq: 1, type: 'session.event' }),
      ).rejects.toMatchObject({ code: 'run-not-running' })

      await startRun(run.id)
      await store.appendEvent({ runId: run.id, seq: 1, type: 'session.event' })
      await store.finish({ runId: run.id, status: 'completed', result: { finalResponse: 'done' } })

      await expect(
        store.appendEvent({ runId: run.id, seq: 2, type: 'session.event' }),
      ).rejects.toBeInstanceOf(TerminalRunError)
    })

    it('validates seq before touching the repository', async () => {
      const { run } = await submitRun()
      await startRun(run.id)

      await expect(
        store.appendEvent({ runId: run.id, seq: 0, type: 'session.event' }),
      ).rejects.toMatchObject({ code: 'invalid-request' })
      await expect(
        store.appendEvent({ runId: run.id, seq: 1.5, type: 'session.event' }),
      ).rejects.toMatchObject({ code: 'invalid-request' })
    })
  })

  describe('finish', () => {
    it('moves an in-flight run to a terminal state once', async () => {
      const { run } = await submitRun()
      await startRun(run.id)
      advance(750)

      const finished = await store.finish({
        runId: run.id,
        status: 'completed',
        result: { finalResponse: 'ok' },
      })

      expect(finished.status).toBe('completed')
      expect(finished.resultJson).toEqual({ finalResponse: 'ok' })
      expect(finished.error).toBeNull()
      expect(finished.finishedAt).toBe(current())
    })

    it('never rewrites a terminal run', async () => {
      const { run } = await submitRun()
      await store.finish({ runId: run.id, status: 'cancelled' })

      await expect(store.finish({ runId: run.id, status: 'completed' })).rejects.toBeInstanceOf(
        TerminalRunError,
      )
      await expect(store.finish({ runId: run.id, status: 'failed' })).rejects.toMatchObject({
        code: 'run-terminal',
      })
      expect(repo.runs.get(run.id)?.status).toBe('cancelled')
    })

    it('records a cancel reason and leaves startedAt null for a queued run', async () => {
      const { run } = await submitRun()
      const finished = await store.finish({ runId: run.id, status: 'cancelled' })

      expect(finished.status).toBe('cancelled')
      expect(finished.error).toBe('cancelled')
      expect(finished.startedAt).toBeNull()
      expect(finished.finishedAt).toBe(current())
    })

    it('refuses a non-terminal target status', async () => {
      const { run } = await submitRun()
      await expect(
        store.finish({ runId: run.id, status: 'running' as never }),
      ).rejects.toBeInstanceOf(InvalidTransitionError)
    })
  })

  describe('recoverInFlight', () => {
    it('returns queued, running and awaiting-approval runs with session and cursor', async () => {
      repo.runs.set(
        'run-running',
        makeRun({
          id: 'run-running',
          status: 'running',
          sessionId: 'session-running',
          cursor: 3,
          startedAt: T0,
          createdAt: '2026-11-11T07:00:01.000Z',
        }),
      )
      repo.runs.set(
        'run-queued',
        makeRun({ id: 'run-queued', status: 'queued', createdAt: '2026-11-11T07:00:00.000Z' }),
      )
      repo.runs.set(
        'run-approval',
        makeRun({
          id: 'run-approval',
          status: 'awaiting_approval',
          sessionId: 'session-approval',
          cursor: 2,
          createdAt: '2026-11-11T07:00:02.000Z',
        }),
      )
      repo.runs.set(
        'run-done',
        makeRun({ id: 'run-done', status: 'completed', createdAt: '2026-11-11T07:00:03.000Z' }),
      )

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
      expect(recovered[2]).toMatchObject({ sessionId: 'session-approval', cursor: 2 })
    })
  })

  describe('eventsAfter', () => {
    it('returns only events strictly after the cursor and ordered by seq', async () => {
      const { run } = await submitRun()
      await startRun(run.id)
      await store.appendEvent({ runId: run.id, seq: 1, type: 'session.event' })
      await store.appendEvent({ runId: run.id, seq: 2, type: 'session.event' })
      await store.appendEvent({ runId: run.id, seq: 3, type: 'session.event' })

      expect((await store.eventsAfter(run.id, 0)).map((event) => event.seq)).toEqual([1, 2, 3])
      expect((await store.eventsAfter(run.id, 1)).map((event) => event.seq)).toEqual([2, 3])
      expect(await store.eventsAfter(run.id, 3)).toEqual([])
    })

    it('rejects an unknown run and an invalid cursor', async () => {
      await expect(store.eventsAfter('missing', 0)).rejects.toBeInstanceOf(RunNotFoundError)
      await expect(store.eventsAfter('missing', 0)).rejects.toMatchObject({ code: 'run-not-found' })

      const { run } = await submitRun()
      await expect(store.eventsAfter(run.id, -1)).rejects.toBeInstanceOf(InvalidCursorError)
      await expect(store.eventsAfter(run.id, 1.5)).rejects.toMatchObject({ code: 'invalid-cursor' })
    })
  })

  describe('revokeBinding', () => {
    it('revokes the binding, cancels in-flight runs and leaves settled/other bindings alone', async () => {
      const { run: running } = await submitRun()
      await startRun(running.id, 'session-1')
      await store.appendEvent({ runId: running.id, seq: 1, type: 'session.event' })

      repo.runs.set(
        'run-completed',
        makeRun({
          id: 'run-completed',
          status: 'completed',
          idempotencyKey: 'key-completed',
          resultJson: { finalResponse: 'old' },
          startedAt: T0,
          finishedAt: T0,
        }),
      )

      repo.bindings.set('binding-2', makeBinding({ id: 'binding-2', userId: 'user-2' }))
      const other = await store.submit({
        bindingId: 'binding-2',
        userId: 'user-2',
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        idempotencyKey: 'key-other',
        requestHash: 'hash-other',
      })
      await startRun(other.run.id, 'session-other')

      advance(10_000)
      const revokedAt = current()
      const result = await store.revokeBinding(BINDING_ID)

      expect(result.binding.status).toBe('revoked')
      expect(result.binding.revision).toBe(2)
      expect(result.binding.updatedAt).toBe(revokedAt)
      expect(result.revokedAt).toBe(revokedAt)

      expect(result.cancelled.map((run) => run.id)).toEqual([running.id])
      expect(result.cancelled[0]).toMatchObject({
        status: 'cancelled',
        finishedAt: revokedAt,
        error: 'principal_revoked',
      })

      expect(repo.runs.get('run-completed')?.status).toBe('completed')
      expect(repo.runs.get(other.run.id)?.status).toBe('running')
      expect(repo.bindings.get('binding-2')?.status).toBe('active')
    })

    it('produces the same cancellation decision as run.ts and keeps the 10s audit computable', async () => {
      const { run } = await submitRun()
      await startRun(run.id)

      advance(2_000)
      const revokedAt = current()
      const result = await store.revokeBinding(BINDING_ID, { reason: 'admin_revoke' })

      const beforeRevocation: StateMachineRun = {
        id: run.id,
        bindingId: BINDING_ID,
        employeeUserId: USER_ID,
        status: 'running',
        startedAt: run.startedAt,
      }
      const outcome = applyPrincipalRevoked([beforeRevocation], {
        bindingId: BINDING_ID,
        at: revokedAt,
        reason: 'admin_revoke',
      })

      expect(outcome.cancelled).toHaveLength(1)
      expect(result.cancelled[0].finishedAt).toBe(outcome.cancelled[0].cancelledAt)
      expect(result.cancelled[0].error).toBe(outcome.cancelled[0].cancelReason)
      expect(
        withinRevocationDeadline({
          revokedAt: result.revokedAt,
          cancelledAt: result.cancelled[0].finishedAt,
        }),
      ).toBe(true)
    })

    it('is idempotent on the binding row and refuses later submits', async () => {
      const { run } = await submitRun()
      await startRun(run.id)
      const first = await store.revokeBinding(BINDING_ID)
      advance(5_000)

      const second = await store.revokeBinding(BINDING_ID)
      expect(second.binding.revision).toBe(first.binding.revision)
      expect(second.binding.updatedAt).toBe(first.binding.updatedAt)
      expect(second.revokedAt).toBe(first.revokedAt)
      expect(second.cancelled).toEqual([])

      await expect(submitRun({ idempotencyKey: 'key-2' })).rejects.toMatchObject({
        code: 'binding-not-active',
      })
    })

    it('surfaces a missing binding', async () => {
      await expect(store.revokeBinding('missing')).rejects.toMatchObject({
        code: 'binding-not-found',
      })
    })
  })
})
