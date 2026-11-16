/**
 * Navigation governance tables (expand-only).
 *
 * Two new tables, no changes to existing ones:
 *   - workspace_layouts: one presentation document per organization
 *   - navigation_preferences: one preference document per (tenant, org, user)
 *
 * Rollback is `drop table` for both; nothing references them from existing
 * tables, so removing them restores the previous behaviour (code defaults).
 */
import { Migration } from '@mikro-orm/migrations'

export class Migration20261117070000_workspace_settings extends Migration {
  override name = 'Migration20261117070000'

  override up(): void | Promise<void> {
    this.addSql(`create table "workspace_layouts" (
  "id" uuid not null default gen_random_uuid(),
  "tenant_id" uuid not null,
  "organization_id" uuid not null,
  "config" jsonb not null default '{}'::jsonb,
  "revision" integer not null default 1,
  "updated_by" uuid null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  constraint "workspace_layouts_pkey" primary key ("id")
);`)
    this.addSql(
      `create unique index "workspace_layouts_org_uq" on "workspace_layouts" ("tenant_id", "organization_id");`,
    )
    this.addSql(`create table "navigation_preferences" (
  "id" uuid not null default gen_random_uuid(),
  "tenant_id" uuid not null,
  "organization_id" uuid not null,
  "user_id" uuid not null,
  "favorites" jsonb not null default '[]'::jsonb,
  "recent_workspace" text null,
  "selected_preset" text null,
  "revision" integer not null default 1,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  constraint "navigation_preferences_pkey" primary key ("id")
);`)
    this.addSql(
      `create unique index "navigation_preferences_user_uq" on "navigation_preferences" ("tenant_id", "organization_id", "user_id");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "navigation_preferences";`)
    this.addSql(`drop table if exists "workspace_layouts";`)
  }
}
