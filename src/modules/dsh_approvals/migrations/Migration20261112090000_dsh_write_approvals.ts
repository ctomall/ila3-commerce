/**
 * Human-approval ledger for DSH CRM writes (C phase).
 *
 * Expand-only DDL: one new table plus indexes. The partial unique index is the
 * cross-process guard for "one live proposal per (binding, tool, arguments)";
 * `rejected`/`consumed`/`expired` rows are kept as history and may repeat.
 *
 * Not applied by the deploy pipeline — the deploy executor never runs
 * migrations (see `scripts/auto-deploy/migration-preflight.mjs`). Apply with
 * `yarn mercato db:migrate` in an approved maintenance step.
 */
import { Migration } from '@mikro-orm/migrations'

export class Migration20261112090000_dsh_write_approvals extends Migration {
  override name = 'Migration20261112090000'

  override up(): void | Promise<void> {
    this.addSql(`create table "dsh_write_approvals" (
  "id" uuid not null default gen_random_uuid(),
  "tenant_id" uuid not null,
  "organization_id" uuid not null,
  "user_id" uuid not null,
  "binding_id" uuid not null,
  "run_id" uuid not null,
  "tool" text not null,
  "args_hash" text not null,
  "args_preview" jsonb not null default '{}',
  "status" text not null default 'pending',
  "requested_at" timestamptz not null,
  "expires_at" timestamptz not null,
  "decided_at" timestamptz null,
  "decided_by" uuid null,
  "consumed_at" timestamptz null,
  constraint "dsh_write_approvals_pkey" primary key ("id")
);`)
    this.addSql(
      `create index "dsh_write_approvals_binding_tool_args_idx" on "dsh_write_approvals" ("binding_id", "tool", "args_hash");`,
    )
    this.addSql(
      `create unique index "dsh_write_approvals_one_live_uq" on "dsh_write_approvals" ("binding_id", "tool", "args_hash") where "status" in ('pending', 'approved');`,
    )
    this.addSql(
      `create index "dsh_write_approvals_user_status_idx" on "dsh_write_approvals" ("user_id", "status", "requested_at");`,
    )
    this.addSql(
      `create index "dsh_write_approvals_run_idx" on "dsh_write_approvals" ("run_id");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "dsh_write_approvals";`)
  }
}
