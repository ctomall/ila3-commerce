import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'

/**
 * Idempotency ledger for employee replies sent through the mobile facade.
 *
 * A caller retrying after a network timeout must not create a second outbound
 * message. The row is written BEFORE the hub facade runs, so a concurrent
 * duplicate loses the unique-key race and can be answered with the first
 * attempt's result instead of sending again.
 *
 * Deliberately app-owned: the installed hub has no client-request ledger, and
 * adding columns to its tables would turn a local integration concern into an
 * upstream contract change.
 */
@Entity({ tableName: 'communications_send_requests' })
@Index({ name: 'communications_send_requests_scope_idx', properties: ['tenantId', 'userId', 'createdAt'] })
@Unique({ name: 'communications_send_requests_uq', properties: ['tenantId', 'userId', 'clientRequestId'] })
export class SendRequest {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'messageId' | 'messageThreadId' | 'organizationId'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId?: string | null

  @Property({ name: 'user_id', type: 'uuid' })
  userId!: string

  @Property({ name: 'client_request_id', type: 'text' })
  clientRequestId!: string

  @Property({ name: 'channel_id', type: 'uuid' })
  channelId!: string

  /** `messages.message.id` once the hub accepted the send; null while in flight. */
  @Property({ name: 'message_id', type: 'uuid', nullable: true })
  messageId?: string | null

  @Property({ name: 'message_thread_id', type: 'uuid', nullable: true })
  messageThreadId?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
