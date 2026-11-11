/**
 * DRAFT — NOT APPLIED. Needs review before it touches any database.
 *
 * B1 persistence schema for DSH employee runs:
 *   - dsh_assistant_bindings: one assistant binding per (tenant, org, user)
 *   - dsh_runs: idempotent run ledger, one in-flight run per binding
 *   - dsh_run_events: append-only, contiguous per-run event stream
 *
 * Column/type/default/index DDL below is the dsh_* subset of a real
 * `yarn db:generate` run (Migration20261111083458) performed in an isolated
 * worktree on 2026-11-11. That generated file also contained a full-schema
 * re-diff of unrelated tables (production schema vs package metadata), which
 * was discarded: only the three dsh_* tables are kept. No FK/CHECK constraints
 * are declared here because the entities use scalar columns and MikroORM would
 * try to remove constraints it does not own on the next generate.
 *
 * Not applied. The partial unique index fails on a database that already holds
 * two in-flight runs for one binding; that failure is intentional and must be
 * reviewed, not patched over.
 */
import { Migration } from '@mikro-orm/migrations'

export class Migration20261111083458_dsh_runs extends Migration {
  override name = 'Migration20261111083458'

  override up(): void | Promise<void> {
    this.addSql(`create table "dsh_assistant_bindings" (
  "id" uuid not null default gen_random_uuid(),
  "tenant_id" uuid not null,
  "organization_id" uuid not null,
  "user_id" uuid not null,
  "assistant_id" text not null,
  "status" text not null default 'active',
  "revision" int not null default 1,
  "created_at" timestamptz not null,
  "updated_at" timestamptz not null,
  constraint "dsh_assistant_bindings_pkey" primary key ("id"),
  constraint "dsh_assistant_bindings_tenant_org_user_uq" unique ("tenant_id", "organization_id", "user_id")
);`)
    this.addSql(
      `create index "dsh_assistant_bindings_scope_status_idx" on "dsh_assistant_bindings" ("tenant_id", "organization_id", "status");`,
    )

    this.addSql(`create table "dsh_runs" (
  "id" uuid not null default gen_random_uuid(),
  "binding_id" uuid not null,
  "user_id" uuid not null,
  "tenant_id" uuid not null,
  "organization_id" uuid not null,
  "session_id" text null,
  "status" text not null default 'queued',
  "idempotency_key" text not null,
  "request_hash" text not null,
  "cursor" int not null default 0,
  "result_json" jsonb null,
  "error" text null,
  "started_at" timestamptz null,
  "finished_at" timestamptz null,
  "created_at" timestamptz not null,
  constraint "dsh_runs_pkey" primary key ("id"),
  constraint "dsh_runs_binding_idempotency_uq" unique ("binding_id", "idempotency_key")
);`)
    this.addSql(
      `create index "dsh_runs_binding_status_idx" on "dsh_runs" ("binding_id", "status");`,
    )
    this.addSql(
      `create index "dsh_runs_status_created_idx" on "dsh_runs" ("status", "created_at");`,
    )
    this.addSql(
      `create index "dsh_runs_scope_created_idx" on "dsh_runs" ("tenant_id", "organization_id", "user_id", "created_at");`,
    )
    // Cross-process guard for "one in-flight run per employee". `submit()` checks
    // this in memory first for a typed error; this index is what actually holds
    // under two route workers racing on the same binding.
    this.addSql(
      `create unique index "dsh_runs_one_in_flight_per_binding_uq" on "dsh_runs" ("binding_id") where "status" in ('queued', 'running', 'awaiting_approval');`,
    )

    this.addSql(`create table "dsh_run_events" (
  "id" uuid not null default gen_random_uuid(),
  "run_id" uuid not null,
  "seq" int not null,
  "type" text not null,
  "payload_json" jsonb null,
  "created_at" timestamptz not null,
  constraint "dsh_run_events_pkey" primary key ("id"),
  constraint "dsh_run_events_run_seq_uq" unique ("run_id", "seq")
);`)
    this.addSql(
      `create index "dsh_run_events_run_created_idx" on "dsh_run_events" ("run_id", "created_at");`,
    )
  }

  override down(): void | Promise<void> {
    // Children first: dsh_run_events references dsh_runs, and dsh_runs
    // references dsh_assistant_bindings.
    this.addSql(`drop table if exists "dsh_run_events";`)
    this.addSql(`drop table if exists "dsh_runs";`)
    this.addSql(`drop table if exists "dsh_assistant_bindings";`)
  }
}
