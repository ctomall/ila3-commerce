import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'

/** One layout document per organization; additive and fully replaceable. */
@Entity({ tableName: 'workspace_layouts' })
@Index({ name: 'workspace_layouts_org_uq', properties: ['tenantId', 'organizationId'], options: { unique: true } })
export class WorkspaceLayout {
  [OptionalProps]?: 'revision' | 'createdAt' | 'updatedAt' | 'updatedBy' | 'config'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'config', type: 'json', defaultRaw: `'{}'::jsonb` })
  config: Record<string, unknown> = {}

  @Property({ name: 'revision', type: 'integer', default: 1 })
  revision: number = 1

  @Property({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null = null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

/** Per-user navigation preference, scoped to tenant + organization. */
@Entity({ tableName: 'navigation_preferences' })
@Index({
  name: 'navigation_preferences_user_uq',
  properties: ['tenantId', 'organizationId', 'userId'],
  options: { unique: true },
})
export class NavigationPreference {
  [OptionalProps]?: 'favorites' | 'recentWorkspace' | 'selectedPreset' | 'revision' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'user_id', type: 'uuid' })
  userId!: string

  @Property({ name: 'favorites', type: 'json', defaultRaw: `'[]'::jsonb` })
  favorites: string[] = []

  @Property({ name: 'recent_workspace', type: 'text', nullable: true })
  recentWorkspace: string | null = null

  @Property({ name: 'selected_preset', type: 'text', nullable: true })
  selectedPreset: string | null = null

  @Property({ name: 'revision', type: 'integer', default: 1 })
  revision: number = 1

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
