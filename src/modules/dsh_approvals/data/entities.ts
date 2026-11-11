import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import type { ApprovalStatus } from '../services/approval-store'

/**
 * One human approval for one proposed CRM write.
 *
 * The identity of the proposal is `(binding_id, tool, args_hash)`: the same
 * employee asking for the same change to the same record, retried after a
 * `approval_required`, must find this row instead of creating a second request.
 * The partial unique index in the migration enforces that at the database level
 * for `pending`/`approved` rows; `rejected`/`consumed`/`expired` rows are
 * history and may repeat.
 *
 * `args_preview` deliberately stores only what a human needs to judge the
 * change (company id, name, field names and new values). It is never used for
 * authorization: the executed arguments are the ones in the tool call, and the
 * `args_hash` check is what proves they match what was approved.
 */
@Entity({ tableName: 'dsh_write_approvals' })
@Index({
  name: 'dsh_write_approvals_binding_tool_args_idx',
  properties: ['bindingId', 'tool', 'argsHash'],
})
@Index({
  name: 'dsh_write_approvals_one_live_uq',
  expression:
    'create unique index "dsh_write_approvals_one_live_uq" on "dsh_write_approvals" ("binding_id", "tool", "args_hash") where "status" in (\'pending\', \'approved\')',
})
@Index({
  name: 'dsh_write_approvals_user_status_idx',
  properties: ['userId', 'status', 'requestedAt'],
})
@Index({
  name: 'dsh_write_approvals_run_idx',
  properties: ['runId'],
})
export class DshWriteApproval {
  [OptionalProps]?: 'status' | 'decidedAt' | 'decidedBy' | 'consumedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'user_id', type: 'uuid' })
  userId!: string

  @Property({ name: 'binding_id', type: 'uuid' })
  bindingId!: string

  @Property({ name: 'run_id', type: 'uuid' })
  runId!: string

  @Property({ name: 'tool', type: 'text' })
  tool!: string

  @Property({ name: 'args_hash', type: 'text' })
  argsHash!: string

  @Property({ name: 'args_preview', type: 'json' })
  argsPreview: Record<string, unknown> = {}

  @Property({ name: 'status', type: 'text' })
  status: ApprovalStatus = 'pending'

  @Property({ name: 'requested_at', type: Date })
  requestedAt: Date = new Date()

  @Property({ name: 'expires_at', type: Date })
  expiresAt: Date = new Date()

  @Property({ name: 'decided_at', type: Date, nullable: true })
  decidedAt: Date | null = null

  @Property({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy: string | null = null

  @Property({ name: 'consumed_at', type: Date, nullable: true })
  consumedAt: Date | null = null
}
