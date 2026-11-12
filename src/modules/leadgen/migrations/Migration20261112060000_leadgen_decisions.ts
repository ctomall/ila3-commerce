/**
 * M5 review-decision ledger (expand-only).
 *
 * The two approved-schema slices modelled candidates, evidence, verification and
 * claims, but not the manual decision itself. Without this table a decision
 * endpoint cannot make `decisionKey` idempotent (the contract requires it) or
 * record who decided what. Additive and independent of the two reviewed slices.
 */
import { Migration } from '@mikro-orm/migrations'

export class Migration20261112060000_leadgen_decisions extends Migration {
  override name = 'Migration20261112060000'

  override up(): void | Promise<void> {
    this.addSql(`create table "leadgen_candidate_decisions" (
  "id" uuid not null default gen_random_uuid(),
  "tenant_id" uuid not null,
  "organization_id" uuid not null,
  "candidate_id" uuid not null,
  "decision" text not null,
  "decision_key" text not null,
  "actor_user_id" uuid not null,
  "reason_code" text null,
  "merge_target_claim_id" uuid null,
  "created_at" timestamptz not null,
  constraint "leadgen_candidate_decisions_pkey" primary key ("id"),
  constraint "leadgen_candidate_decisions_tenant_org_key_uq" unique ("tenant_id", "organization_id", "decision_key")
);`)
    this.addSql(
      `create index "leadgen_candidate_decisions_candidate_idx" on "leadgen_candidate_decisions" ("candidate_id", "created_at");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "leadgen_candidate_decisions";`)
  }
}
