import { Migration } from '@mikro-orm/migrations';

export class Migration20261108194144_leadgen extends Migration {

  override name = 'Migration20261108194144';

  override up(): void | Promise<void> {
    this.addSql(`create table "leadgen_approvals" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "draft_id" uuid not null, "draft_hash" text not null, "decision" text not null, "approver_user_id" uuid not null, "idempotency_key" text not null, "expires_at" timestamptz not null, "revoked_at" timestamptz null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "leadgen_approvals_draft_id_decision_index" on "leadgen_approvals" ("draft_id", "decision");`);
    this.addSql(`alter table "leadgen_approvals" add constraint "leadgen_approvals_tenant_id_organization_id_idemp_76d92_unique" unique ("tenant_id", "organization_id", "idempotency_key");`);

    this.addSql(`create table "leadgen_bot_bindings" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "channel_id" uuid not null, "channel_type" text not null, "external_identity" text not null, "employee_binding_id" uuid not null, "state" text not null default 'active', "verified_at" timestamptz null, "revoked_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "leadgen_bot_bindings_tenant_id_organization_id_cha_371e8_index" on "leadgen_bot_bindings" ("tenant_id", "organization_id", "channel_id", "external_identity");`);

    this.addSql(`create table "leadgen_capability_policies" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "policy_key" text not null, "version" int not null, "capabilities" jsonb not null, "status" text not null default 'draft', "effective_from" timestamptz null, "effective_to" timestamptz null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "leadgen_capability_policies" add constraint "leadgen_capability_policies_tenant_id_organizatio_a354d_unique" unique ("tenant_id", "organization_id", "policy_key", "version");`);

    this.addSql(`create table "leadgen_drafts" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "candidate_id" uuid not null, "recipient_email" text not null, "recipient_hash" text not null, "channel" text not null default 'email', "subject" text not null, "body_markdown" text not null, "body_html" text null, "body_hash" text not null, "template_key" text null, "template_version" text null, "version" int not null default 1, "status" text not null default 'editing', "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "leadgen_drafts_tenant_id_organization_id_status_index" on "leadgen_drafts" ("tenant_id", "organization_id", "status");`);
    this.addSql(`alter table "leadgen_drafts" add constraint "leadgen_drafts_tenant_id_organization_id_candidat_798c9_unique" unique ("tenant_id", "organization_id", "candidate_id", "body_hash");`);

    this.addSql(`create table "leadgen_employee_bindings" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "employee_id" uuid not null, "user_id" uuid null, "assistant_agent_key" text not null, "capability_policy_id" uuid not null, "capability_policy_version" int not null, "state" text not null default 'active', "bound_at" timestamptz not null, "revoked_at" timestamptz null, "revoke_reason" text null, primary key ("id"));`);
    this.addSql(`create index "leadgen_employee_bindings_tenant_id_organization_i_54a45_index" on "leadgen_employee_bindings" ("tenant_id", "organization_id", "assistant_agent_key");`);
    this.addSql(`alter table "leadgen_employee_bindings" add constraint "leadgen_employee_bindings_tenant_id_organization__3fce6_unique" unique ("tenant_id", "organization_id", "employee_id", "state");`);

    this.addSql(`create table "leadgen_message_receipts" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "send_id" uuid not null, "provider_event_id" text not null, "kind" text not null, "classification" text null, "classifier_version" text null, "occurred_at" timestamptz not null, "payload_hash" text not null, primary key ("id"));`);
    this.addSql(`create index "leadgen_message_receipts_send_id_occurred_at_index" on "leadgen_message_receipts" ("send_id", "occurred_at");`);
    this.addSql(`alter table "leadgen_message_receipts" add constraint "leadgen_message_receipts_tenant_id_provider_event_id_unique" unique ("tenant_id", "provider_event_id");`);

    this.addSql(`create table "leadgen_quota_buckets" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "scope_kind" text not null, "scope_id" uuid null, "quota_kind" text not null, "period_key" text not null, "limit_units" int not null, "reserved_units" int not null default 0, "consumed_units" int not null default 0, "version" int not null default 1, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "leadgen_quota_buckets_tenant_id_organization_id_qu_7cde9_index" on "leadgen_quota_buckets" ("tenant_id", "organization_id", "quota_kind", "period_key");`);
    this.addSql(`alter table "leadgen_quota_buckets" add constraint "leadgen_quota_buckets_tenant_id_organization_id_s_6c46a_unique" unique ("tenant_id", "organization_id", "scope_kind", "scope_id", "quota_kind", "period_key");`);

    this.addSql(`create table "leadgen_quota_ledger" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "bucket_id" uuid not null, "reservation_id" uuid null, "entry_kind" text not null, "delta_units" int not null, "actor_user_id" uuid null, "reason_code" text null, "occurred_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "leadgen_quota_ledger_bucket_id_occurred_at_index" on "leadgen_quota_ledger" ("bucket_id", "occurred_at");`);

    this.addSql(`create table "leadgen_quota_reservations" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "bucket_id" uuid not null, "lease_token" text not null, "idempotency_key" text not null, "units" int not null, "state" text not null default 'reserved', "subject_kind" text null, "subject_id" uuid null, "expires_at" timestamptz not null, "consumed_at" timestamptz null, "refunded_at" timestamptz null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "leadgen_quota_reservations_state_expires_at_index" on "leadgen_quota_reservations" ("state", "expires_at");`);
    this.addSql(`alter table "leadgen_quota_reservations" add constraint "leadgen_quota_reservations_lease_token_unique" unique ("lease_token");`);
    this.addSql(`alter table "leadgen_quota_reservations" add constraint "leadgen_quota_reservations_tenant_id_organization_020d5_unique" unique ("tenant_id", "organization_id", "idempotency_key");`);

    this.addSql(`create table "leadgen_sends" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "draft_id" uuid not null, "approval_id" uuid not null, "draft_hash" text not null, "idempotency_key" text not null, "provider_key" text null, "channel" text not null default 'email', "provider_message_id" text null, "state" text not null default 'queued', "attempt" int not null default 0, "lease_owner" text null, "lease_expires_at" timestamptz null, "enqueued_at" timestamptz not null, "sent_at" timestamptz null, "error_code" text null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "leadgen_sends_draft_id_index" on "leadgen_sends" ("draft_id");`);
    this.addSql(`create index "leadgen_sends_state_updated_at_index" on "leadgen_sends" ("state", "updated_at");`);
    this.addSql(`alter table "leadgen_sends" add constraint "leadgen_sends_tenant_id_organization_id_idempotency_key_unique" unique ("tenant_id", "organization_id", "idempotency_key");`);

    this.addSql(`create table "leadgen_suppressions" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "email_hash" text not null, "email" text not null, "reason" text not null, "source_send_id" uuid null, "created_at" timestamptz not null, "released_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "leadgen_suppressions_tenant_id_organization_id_reason_index" on "leadgen_suppressions" ("tenant_id", "organization_id", "reason");`);
    // Headroom can never go negative: the arithmetic lives in code, but the row must not be
    // able to disagree with it even if a future caller forgets to take the lock.
    this.addSql(`alter table "leadgen_quota_buckets" add constraint "leadgen_quota_buckets_headroom_check" check ("limit_units" >= "reserved_units" + "consumed_units");`);

    // Only one ACTIVE employee binding per employee, one ACTIVE suppression per address,
    // and one ACTIVE bot binding per (channel, external identity).
    this.addSql(`create unique index "leadgen_suppressions_active_unique" on "leadgen_suppressions" ("tenant_id", "email_hash") where "released_at" is null;`);
    this.addSql(`create unique index "leadgen_employee_bindings_active_unique" on "leadgen_employee_bindings" ("tenant_id", "organization_id", "employee_id") where "state" = 'active';`);
    this.addSql(`create unique index "leadgen_bot_bindings_active_unique" on "leadgen_bot_bindings" ("tenant_id", "organization_id", "channel_id", "external_identity") where "state" = 'active';`);

  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "leadgen_bot_bindings" cascade;`);
    this.addSql(`drop table if exists "leadgen_employee_bindings" cascade;`);
    this.addSql(`drop table if exists "leadgen_capability_policies" cascade;`);
    this.addSql(`drop table if exists "leadgen_suppressions" cascade;`);
    this.addSql(`drop table if exists "leadgen_message_receipts" cascade;`);
    this.addSql(`drop table if exists "leadgen_sends" cascade;`);
    this.addSql(`drop table if exists "leadgen_approvals" cascade;`);
    this.addSql(`drop table if exists "leadgen_drafts" cascade;`);
    this.addSql(`drop table if exists "leadgen_quota_ledger" cascade;`);
    this.addSql(`drop table if exists "leadgen_quota_reservations" cascade;`);
    this.addSql(`drop table if exists "leadgen_quota_buckets" cascade;`);
  }
}
