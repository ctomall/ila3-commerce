import { Migration } from '@mikro-orm/migrations';

export class Migration20261108192028_leadgen extends Migration {

  override name = 'Migration20261108192028';

  override up(): void | Promise<void> {
    this.addSql(`create table "leadgen_candidates" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "run_id" uuid not null, "submitted_fingerprint" text not null, "company_dedupe_key" text not null, "company_name" text not null, "company_domain" text null, "company_country" text null, "contact_name" text null, "contact_title" text null, "contact_email" text null, "contact_email_hash" text null, "source_url" text null, "claim_id" uuid null, "crm_entity_id" uuid null, "crm_written_at" timestamptz null, "status" text not null default 'submitted', "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "leadgen_candidates_tenant_id_organization_id_compa_4d8e4_index" on "leadgen_candidates" ("tenant_id", "organization_id", "company_dedupe_key");`);
    this.addSql(`create index "leadgen_candidates_tenant_id_organization_id_statu_72e7a_index" on "leadgen_candidates" ("tenant_id", "organization_id", "status", "updated_at");`);
    this.addSql(`alter table "leadgen_candidates" add constraint "leadgen_candidates_tenant_id_organization_id_run__4da1e_unique" unique ("tenant_id", "organization_id", "run_id", "submitted_fingerprint");`);

    this.addSql(`create table "leadgen_candidate_evidence" ("id" uuid not null default gen_random_uuid(), "candidate_id" uuid not null, "kind" text not null, "url" text not null, "fetched_at" timestamptz not null, "http_status" int null, "content_hash" text not null, "excerpt" text null, "method" text null, "adapter" text null, "rank" int not null default 0, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "leadgen_candidate_evidence" add constraint "leadgen_candidate_evidence_candidate_id_content_hash_unique" unique ("candidate_id", "content_hash");`);

    this.addSql(`create table "leadgen_company_claims" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "company_dedupe_key" text not null, "display_name" text not null, "crm_entity_id" uuid null, "owner_user_id" uuid null, "owner_employee_id" uuid null, "state" text not null default 'unclaimed', "version" int not null default 1, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "leadgen_company_claims" add constraint "leadgen_company_claims_tenant_id_organization_id__2bd0c_unique" unique ("tenant_id", "organization_id", "company_dedupe_key");`);

    this.addSql(`create table "leadgen_research_runs" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "source" text not null, "run_key" text not null, "agent_key" text null, "agent_version" text null, "policy_version" text null, "prompt_hash" text null, "candidate_count" int not null default 0, "status" text not null default 'open', "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "leadgen_research_runs" add constraint "leadgen_research_runs_tenant_id_organization_id_s_660e7_unique" unique ("tenant_id", "organization_id", "source", "run_key");`);

    this.addSql(`create table "leadgen_verifications" ("id" uuid not null default gen_random_uuid(), "candidate_id" uuid not null, "verifier_version" text not null, "ruleset_hash" text not null, "input_digest" text not null, "verdict" text not null, "checks" jsonb null, "started_at" timestamptz not null, "completed_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "leadgen_verifications" add constraint "leadgen_verifications_candidate_id_verifier_versi_05694_unique" unique ("candidate_id", "verifier_version", "input_digest");`);

    // One candidate may materialise a CRM company once: a partial unique index keeps
    // the "already written" invariant without blocking the NULL rows waiting to be written.
    this.addSql(`create unique index "leadgen_candidates_crm_entity_unique" on "leadgen_candidates" ("tenant_id", "organization_id", "crm_entity_id") where "crm_entity_id" is not null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "leadgen_verifications" cascade;`);
    this.addSql(`drop table if exists "leadgen_candidate_evidence" cascade;`);
    this.addSql(`drop table if exists "leadgen_candidates" cascade;`);
    this.addSql(`drop table if exists "leadgen_company_claims" cascade;`);
    this.addSql(`drop table if exists "leadgen_research_runs" cascade;`);
  }

}
