import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import type { BindingState, RunStatus } from '../../../lib/dsh/run'

/**
 * One employee's DSH assistant binding.
 *
 * The unique tuple is the product rule "one assistant per employee inside a
 * tenant/organization". It is also the scope every run is checked against:
 * `submit()` refuses to create a run when the caller's identity does not match
 * the binding row, so a request cannot borrow another employee's assistant.
 *
 * `status` is the authoritative revocation switch (see `src/lib/dsh/run.ts`).
 * `revision` is bumped on every policy/status change so a runtime that cached
 * the binding can detect that it must re-read before the next tool call.
 */
@Entity({ tableName: 'dsh_assistant_bindings' })
@Unique({
  name: 'dsh_assistant_bindings_tenant_org_user_uq',
  properties: ['tenantId', 'organizationId', 'userId'],
})
@Index({
  name: 'dsh_assistant_bindings_scope_status_idx',
  properties: ['tenantId', 'organizationId', 'status'],
})
export class DshAssistantBinding {
  [OptionalProps]?: 'status' | 'revision' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  /** DSH runs are organization-scoped; an employee's binding never spans orgs. */
  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'user_id', type: 'uuid' })
  userId!: string

  /** Assistant/agent key from the installed assistant registry; text, not a FK. */
  @Property({ name: 'assistant_id', type: 'text' })
  assistantId!: string

  @Property({ name: 'status', type: 'text' })
  status: BindingState = 'active'

  @Property({ name: 'revision', type: 'int' })
  revision: number = 1

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

/**
 * One assistant turn request (a "run").
 *
 * `(binding_id, idempotency_key)` is the replay boundary. The key alone is not
 * enough: `request_hash` binds it to the request content, so a client retrying
 * with an edited prompt is refused (`idempotency-conflict`) instead of being
 * told it already ran the new prompt.
 *
 * `cursor` is the highest event seq durably stored for this run. It is what a
 * reconnecting browser sends as `Last-Event-ID` (via `eventsAfter`) and what
 * restart recovery reads to decide how much of the stream is already safe.
 *
 * The partial unique index is the concurrency guard that the in-memory check in
 * `submit()` cannot provide across processes: at most one queued/running/
 * awaiting-approval run may exist per binding. Applying this migration to a
 * database that already contains two in-flight runs for one binding will fail,
 * which is the correct behaviour for a draft migration under review.
 */
@Entity({ tableName: 'dsh_runs' })
@Unique({
  name: 'dsh_runs_binding_idempotency_uq',
  properties: ['bindingId', 'idempotencyKey'],
})
@Index({
  name: 'dsh_runs_binding_status_idx',
  properties: ['bindingId', 'status'],
})
@Index({
  name: 'dsh_runs_status_created_idx',
  properties: ['status', 'createdAt'],
})
@Index({
  name: 'dsh_runs_scope_created_idx',
  properties: ['tenantId', 'organizationId', 'userId', 'createdAt'],
})
@Index({
  name: 'dsh_runs_one_in_flight_per_binding_uq',
  expression:
    'create unique index "dsh_runs_one_in_flight_per_binding_uq" on "dsh_runs" ("binding_id") where "status" in (\'queued\', \'running\', \'awaiting_approval\')',
})
export class DshRun {
  [OptionalProps]?:
    | 'sessionId'
    | 'status'
    | 'cursor'
    | 'resultJson'
    | 'error'
    | 'startedAt'
    | 'finishedAt'
    | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'binding_id', type: 'uuid' })
  bindingId!: string

  @Property({ name: 'user_id', type: 'uuid' })
  userId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  /** Null until the runtime has opened a DSH session for this run. */
  @Property({ name: 'session_id', type: 'text', nullable: true })
  sessionId?: string | null

  @Property({ name: 'status', type: 'text' })
  status: RunStatus = 'queued'

  @Property({ name: 'idempotency_key', type: 'text' })
  idempotencyKey!: string

  /** SHA-256 of the canonicalized request body; never the body itself. */
  @Property({ name: 'request_hash', type: 'text' })
  requestHash!: string

  /** Highest stored event seq; `eventsAfter(runId, cursor)` returns seq > cursor. */
  @Property({ name: 'cursor', type: 'int' })
  cursor: number = 0

  /** Final response envelope. MikroORM `json` maps to `jsonb` on PostgreSQL. */
  @Property({ name: 'result_json', type: 'json', nullable: true })
  resultJson?: unknown | null

  @Property({ name: 'error', type: 'text', nullable: true })
  error?: string | null

  @Property({ name: 'started_at', type: Date, nullable: true })
  startedAt?: Date | null

  @Property({ name: 'finished_at', type: Date, nullable: true })
  finishedAt?: Date | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

/**
 * Append-only event stream for a run.
 *
 * `(run_id, seq)` is unique and seq is allocated contiguously from 1 by
 * `appendEvent()`. The unique constraint is the cross-process duplicate guard;
 * the service also checks `cursor + 1` so a gap is rejected before it is stored
 * and a reconnecting client can never observe a hole.
 */
@Entity({ tableName: 'dsh_run_events' })
@Unique({
  name: 'dsh_run_events_run_seq_uq',
  properties: ['runId', 'seq'],
})
@Index({
  name: 'dsh_run_events_run_created_idx',
  properties: ['runId', 'createdAt'],
})
export class DshRunEvent {
  [OptionalProps]?: 'payloadJson' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'run_id', type: 'uuid' })
  runId!: string

  /** Contiguous 1-based stream position within one run. */
  @Property({ name: 'seq', type: 'int' })
  seq!: number

  /** DSH protocol event name (`session.event`, `session.status`, ...). */
  @Property({ name: 'type', type: 'text' })
  type!: string

  @Property({ name: 'payload_json', type: 'json', nullable: true })
  payloadJson?: unknown | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}
