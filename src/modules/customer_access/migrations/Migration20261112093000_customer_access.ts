/**
 * customer_access grants (expand-only).
 *
 * One new table; the partial unique index keeps at most one live grant per
 * (tenant, organization, employee, customer). Revoked rows stay for audit.
 */
import { Migration } from '@mikro-orm/migrations'

export class Migration20261112093000_customer_access extends Migration {
  override name = 'Migration20261112093000'

  override up(): void | Promise<void> {
    this.addSql(`create table "customer_access_grants" (
  "id" uuid not null default gen_random_uuid(),
  "tenant_id" uuid not null,
  "organization_id" uuid not null,
  "user_id" uuid not null,
  "customer_entity_id" uuid not null,
  "access_level" text not null default 'view',
  "granted_by" uuid null,
  "created_at" timestamptz not null,
  "revoked_at" timestamptz null,
  constraint "customer_access_grants_pkey" primary key ("id")
);`)
    this.addSql(
      `create unique index "customer_access_grants_live_uq" on "customer_access_grants" ("tenant_id", "organization_id", "user_id", "customer_entity_id") where "revoked_at" is null;`,
    )
    this.addSql(
      `create index "customer_access_grants_user_idx" on "customer_access_grants" ("tenant_id", "organization_id", "user_id", "revoked_at");`,
    )
    this.addSql(
      `create index "customer_access_grants_entity_idx" on "customer_access_grants" ("tenant_id", "organization_id", "customer_entity_id");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "customer_access_grants";`)
  }
}
