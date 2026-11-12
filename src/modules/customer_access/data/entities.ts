import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'

export type CustomerAccessLevel = 'view' | 'edit'

/**
 * One explicit employee → customer grant (`customer_access`).
 *
 * Ownership (`customer_entities.owner_user_id`) stays the primary relationship;
 * a grant widens a single employee's read or write set to customers they do not
 * own. `revoked_at` is soft deletion so an audit can still see who had access.
 * The partial unique index keeps at most one live grant per
 * (tenant, organization, employee, customer).
 */
@Entity({ tableName: 'customer_access_grants' })
@Index({
  name: 'customer_access_grants_live_uq',
  expression:
    'create unique index "customer_access_grants_live_uq" on "customer_access_grants" ("tenant_id", "organization_id", "user_id", "customer_entity_id") where "revoked_at" is null',
})
@Index({
  name: 'customer_access_grants_user_idx',
  properties: ['tenantId', 'organizationId', 'userId', 'revokedAt'],
})
@Index({
  name: 'customer_access_grants_entity_idx',
  properties: ['tenantId', 'organizationId', 'customerEntityId'],
})
export class CustomerAccessGrant {
  [OptionalProps]?: 'accessLevel' | 'createdAt' | 'revokedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'user_id', type: 'uuid' })
  userId!: string

  @Property({ name: 'customer_entity_id', type: 'uuid' })
  customerEntityId!: string

  @Property({ name: 'access_level', type: 'text' })
  accessLevel: CustomerAccessLevel = 'view'

  @Property({ name: 'granted_by', type: 'uuid', nullable: true })
  grantedBy: string | null = null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'revoked_at', type: Date, nullable: true })
  revokedAt: Date | null = null
}
