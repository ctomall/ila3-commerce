/**
 * Application service that turns the pure run store into the operations the
 * DSH chat route needs (B3).
 *
 * The route owns HTTP and SSE; the store owns state transitions; this service
 * owns the three things that sit between them:
 *
 *   1. binding provisioning (`ensureBinding`) — one active binding per
 *      employee, never resurrecting a revoked/suspended one,
 *   2. the idempotency contract (`submit`) — a stable key derived from the
 *      identity and request hash when the client did not send one,
 *   3. replay (`replay`) — ownership check plus the persisted event cursor,
 *      with `resumable=false` while the run is still in flight.
 *
 * `createRunService` is dependency-injected and ORM-free so the service can be
 * tested with an in-memory store/repository. `createRequestRunService` is the
 * production wiring: request-scoped EntityManager → `OrmDshRunRepository` /
 * `createOrmRunStore`.
 */
import { createHash, randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/core'
import { DshAssistantBinding } from '../data/entities'
import { OrmDshRunRepository, createOrmRunStore } from './orm-repository'
import {
  InvalidRunRequestError,
  RunNotFoundError,
  isInFlightRunStatus,
  type BindingRecord,
  type DshRunRepository,
  type DshRunStore,
  type RunEventRecord,
  type RunRecord,
  type RunStoreDeps,
} from './run-store'

export type RunIdentity = {
  tenantId: string
  organizationId: string
  userId: string
}

export type RunServiceBindingRepository = {
  findBindingByScope(scope: RunIdentity): Promise<BindingRecord | null>
  insertBinding(binding: BindingRecord): Promise<BindingRecord>
}

/**
 * The run store interface plus the two binding operations it does not expose.
 * `OrmRunServiceRepository` implements both halves against one EntityManager.
 */
export type RunServiceRepository = DshRunRepository & RunServiceBindingRepository

export type SubmitServiceInput = {
  identity: RunIdentity
  idempotencyKey?: string
  /** Defaults to sha256(prompt) when omitted. */
  requestHash?: string
  prompt: string
  bindingId?: string
  sessionId?: string | null
}

export type SubmitServiceResult = {
  run: RunRecord
  replay: boolean
}

export type BeginRunInput = {
  sessionId: string
}

export type AppendRunEventInput = {
  type: string
  payload?: unknown
}

export type FinishRunInput = {
  status: 'completed' | 'failed' | 'cancelled'
  result?: unknown
  error?: string | null
}

export type ReplayRunResult = {
  run: RunRecord
  events: RunEventRecord[]
  /** false while queued/running/awaiting_approval: the route answers 409. */
  resumable: boolean
}

export type RunService = {
  ensureBinding(identity: RunIdentity, assistantId?: string): Promise<BindingRecord>
  submit(input: SubmitServiceInput): Promise<SubmitServiceResult>
  begin(runId: string, input: BeginRunInput): Promise<RunRecord>
  appendEvent(runId: string, input: AppendRunEventInput): Promise<RunEventRecord>
  finish(runId: string, input: FinishRunInput): Promise<RunRecord>
  replay(userId: string, runId: string, cursor?: number): Promise<ReplayRunResult>
}

export type RunServiceDeps = {
  store: DshRunStore
  repository: RunServiceRepository
  now?: () => Date
  newId?: () => string
}

/** Ownership failure for replay; the route maps it to 403 without leaking rows. */
export class RunOwnershipError extends Error {
  readonly code = 'run-forbidden'

  constructor(readonly runId: string) {
    super(`run ${runId} belongs to another user`)
    this.name = 'RunOwnershipError'
  }
}

export function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex')
}

export function defaultIdempotencyKey(identity: RunIdentity, requestHash: string): string {
  return createHash('sha256')
    .update([identity.tenantId, identity.organizationId, identity.userId, requestHash].join('\u0000'))
    .digest('hex')
}

const assertIdentity = (identity: RunIdentity): void => {
  for (const field of ['tenantId', 'organizationId', 'userId'] as const) {
    const value = identity[field]
    if (typeof value !== 'string' || value.trim() === '') {
      throw new InvalidRunRequestError(`${field} is required for a persisted DSH run`)
    }
  }
}

const isUniqueViolation = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown }).code
  return code === '23505' || code === 23505
}

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

export function createRunService(deps: RunServiceDeps): RunService {
  const { store, repository } = deps
  const now = deps.now ?? (() => new Date())
  const newId = deps.newId ?? (() => randomUUID())

  const ensureBinding = async (
    identity: RunIdentity,
    assistantId = 'crm-assistant',
  ): Promise<BindingRecord> => {
    assertIdentity(identity)
    if (typeof assistantId !== 'string' || assistantId.trim() === '') {
      throw new InvalidRunRequestError('assistantId must be a non-empty string')
    }

    // The existing row wins even when suspended/revoked: "not resurrected" is
    // the product rule, and re-activating here would bypass the revocation
    // audit. The run store will refuse to submit against it.
    const existing = await repository.findBindingByScope(identity)
    if (existing) return existing

    const timestamp = now().toISOString()
    const binding: BindingRecord = {
      id: newId(),
      tenantId: identity.tenantId,
      organizationId: identity.organizationId,
      userId: identity.userId,
      assistantId,
      status: 'active',
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    try {
      return await repository.insertBinding(binding)
    } catch (error) {
      // Two first requests for the same employee can race the unique tuple.
      // The winner's row is the answer; anything else is a real failure.
      if (isUniqueViolation(error)) {
        const raced = await repository.findBindingByScope(identity)
        if (raced) return raced
      }
      throw error
    }
  }

  const submit = async (input: SubmitServiceInput): Promise<SubmitServiceResult> => {
    assertIdentity(input.identity)
    const requestHash = input.requestHash?.trim() || (input.prompt.trim() ? hashPrompt(input.prompt) : '')
    if (!requestHash) throw new InvalidRunRequestError('prompt or requestHash is required')
    const bindingId = input.bindingId?.trim() || (await ensureBinding(input.identity)).id
    const idempotencyKey =
      input.idempotencyKey?.trim() || defaultIdempotencyKey(input.identity, requestHash)

    const result = await store.submit({
      bindingId,
      userId: input.identity.userId,
      tenantId: input.identity.tenantId,
      organizationId: input.identity.organizationId,
      idempotencyKey,
      requestHash,
      sessionId: input.sessionId ?? null,
    })
    return { run: result.run, replay: result.replayed }
  }

  const begin = async (runId: string, input: BeginRunInput): Promise<RunRecord> => {
    return store.start(runId, { sessionId: input.sessionId })
  }

  const appendEvent = async (runId: string, input: AppendRunEventInput): Promise<RunEventRecord> => {
    const run = await repository.getRun(runId)
    if (!run) throw new RunNotFoundError(runId)
    // The store requires an explicit seq; the service is the single allocator.
    // The route consumes one stream per run, and the store's CAS rejects any
    // duplicate/gap if that assumption is ever violated.
    const seq = run.cursor + 1
    const result = await store.appendEvent({ runId, seq, type: input.type, payload: input.payload })
    return result.event
  }

  const finish = async (runId: string, input: FinishRunInput): Promise<RunRecord> => {
    return store.finish({
      runId,
      status: input.status,
      result: input.result,
      error: input.error,
    })
  }

  const replay = async (userId: string, runId: string, cursor = 0): Promise<ReplayRunResult> => {
    if (typeof userId !== 'string' || userId.trim() === '') {
      throw new InvalidRunRequestError('userId is required')
    }
    const run = await repository.getRun(runId)
    if (!run) throw new RunNotFoundError(runId)
    if (run.userId !== userId) throw new RunOwnershipError(runId)
    const events = await store.eventsAfter(runId, cursor)
    return { run, events, resumable: !isInFlightRunStatus(run.status) }
  }

  return { ensureBinding, submit, begin, appendEvent, finish, replay }
}

/**
 * ORM-backed implementation of the binding half of the service repository.
 * Run operations are delegated to `OrmDshRunRepository`; binding creation is
 * wrapped in a transaction so a unique-tuple race rolls back cleanly and
 * `ensureBinding` can re-read the winner on the same EntityManager.
 */
export class OrmRunServiceRepository implements RunServiceRepository {
  constructor(private readonly em: EntityManager) {}

  /**
   * A long SSE stream keeps this service for minutes. A fresh, cleared fork per
   * operation prevents the identity map from serving a stale run cursor to the
   * next appendEvent call; the store's own transaction fork remains the writer
   * of record.
   */
  private fork(): EntityManager {
    return this.em.fork({ clear: true })
  }

  private runs(): OrmDshRunRepository {
    return new OrmDshRunRepository(this.fork())
  }

  getBinding(bindingId: string): Promise<BindingRecord | null> {
    return this.runs().getBinding(bindingId)
  }

  saveBinding(binding: BindingRecord): Promise<BindingRecord> {
    return this.runs().saveBinding(binding)
  }

  getRun(runId: string): Promise<RunRecord | null> {
    return this.runs().getRun(runId)
  }

  getRunByIdempotencyKey(bindingId: string, idempotencyKey: string): Promise<RunRecord | null> {
    return this.runs().getRunByIdempotencyKey(bindingId, idempotencyKey)
  }

  listRunsByBinding(bindingId: string): Promise<RunRecord[]> {
    return this.runs().listRunsByBinding(bindingId)
  }

  listRunsByStatuses(statuses: Parameters<DshRunRepository['listRunsByStatuses']>[0]): Promise<RunRecord[]> {
    return this.runs().listRunsByStatuses(statuses)
  }

  insertRun(run: RunRecord): Promise<RunRecord> {
    return this.runs().insertRun(run)
  }

  updateRun(run: RunRecord): Promise<RunRecord> {
    return this.runs().updateRun(run)
  }

  insertEvent(event: RunEventRecord): Promise<RunEventRecord> {
    return this.runs().insertEvent(event)
  }

  getEvent(runId: string, seq: number): Promise<RunEventRecord | null> {
    return this.runs().getEvent(runId, seq)
  }

  listEventsAfter(runId: string, cursor: number): Promise<RunEventRecord[]> {
    return this.runs().listEventsAfter(runId, cursor)
  }

  async findBindingByScope(scope: RunIdentity): Promise<BindingRecord | null> {
    const em = this.fork()
    const entity = await em.findOne(DshAssistantBinding, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      userId: scope.userId,
    })
    return entity ? toBindingRecord(entity) : null
  }

  async insertBinding(binding: BindingRecord): Promise<BindingRecord> {
    return this.fork().transactional(async (tx) => {
      const entity = tx.create(DshAssistantBinding, {
        id: binding.id,
        tenantId: binding.tenantId,
        organizationId: binding.organizationId,
        userId: binding.userId,
        assistantId: binding.assistantId,
        status: binding.status,
        revision: binding.revision,
        createdAt: new Date(binding.createdAt),
        updatedAt: new Date(binding.updatedAt),
      })
      tx.persist(entity)
      await tx.flush()
      return toBindingRecord(entity)
    })
  }
}

/**
 * Production wiring for the chat route. The route dynamically imports this
 * function only when OM_DSH_PERSIST=orm, so the default OpenCode path never
 * touches the ORM, the container or the dsh_runs tables.
 */
export async function createRequestRunService(): Promise<RunService> {
  const { createRequestContainer } = await import('@open-mercato/shared/lib/di/container')
  const container = await createRequestContainer()
  // Fork so the long-lived SSE stream does not share the request EM identity map.
  const em = container.resolve<EntityManager>('em').fork()
  const now = () => new Date()
  const newId = () => randomUUID()
  const storeDeps: RunStoreDeps = { now, newId }
  const store = createOrmRunStore(em, storeDeps)
  const repository = new OrmRunServiceRepository(em)
  return createRunService({ store, repository, now, newId })
}
