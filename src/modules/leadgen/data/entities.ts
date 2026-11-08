import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'

/**
 * Lead-generation entities (first slice).
 *
 * Rules that shaped this file:
 * - no cross-module relations: core records are referenced by scalar uuid snapshot;
 * - every row carries tenant_id + organization_id, both derived from auth server-side;
 * - candidate / claim / evidence / verification are separate tables, because "the
 *   company exists", "someone owns it", "we saw it on a page" and "it passed a rule"
 *   are four different facts with four different lifecycles;
 * - dedupe happens on the company claim (one row per company key), not on candidates.
 */

@Entity({ tableName: 'leadgen_research_runs' })
@Unique({ properties: ['tenantId', 'organizationId', 'source', 'runKey'] })
export class LeadgenResearchRun {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  /** Where the run came from: 'dsh' today, room for manual/import later. */
  @Property({ type: 'text' })
  source!: string

  /** Idempotency key from the caller; replays must resolve to this row. */
  @Property({ name: 'run_key', type: 'text' })
  runKey!: string

  @Property({ name: 'agent_key', type: 'text', nullable: true })
  agentKey?: string | null

  @Property({ name: 'agent_version', type: 'text', nullable: true })
  agentVersion?: string | null

  @Property({ name: 'policy_version', type: 'text', nullable: true })
  policyVersion?: string | null

  @Property({ name: 'prompt_hash', type: 'text', nullable: true })
  promptHash?: string | null

  @Property({ name: 'candidate_count', type: 'integer', default: 0 })
  candidateCount: number = 0

  @Property({ type: 'text', default: 'open' })
  status: 'open' | 'closed' | 'voided' = 'open'

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'leadgen_company_claims' })
@Unique({ properties: ['tenantId', 'organizationId', 'companyDedupeKey'] })
export class LeadgenCompanyClaim {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  /** d:<domain> | t:<country>:<taxid> | n:<name>|<country> — see verification.ts. */
  @Property({ name: 'company_dedupe_key', type: 'text' })
  companyDedupeKey!: string

  @Property({ name: 'display_name', type: 'text' })
  displayName!: string

  /** Set once the candidate is written into customers as a company. */
  @Property({ name: 'crm_entity_id', type: 'uuid', nullable: true })
  crmEntityId?: string | null

  @Property({ name: 'owner_user_id', type: 'uuid', nullable: true })
  ownerUserId?: string | null

  @Property({ name: 'owner_employee_id', type: 'uuid', nullable: true })
  ownerEmployeeId?: string | null

  @Property({ type: 'text', default: 'unclaimed' })
  state: 'unclaimed' | 'claimed' | 'conflict' | 'released' | 'merged' = 'unclaimed'

  @Property({ type: 'integer', default: 1 })
  version: number = 1

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'leadgen_candidates' })
@Unique({ properties: ['tenantId', 'organizationId', 'runId', 'submittedFingerprint'] })
@Index({ properties: ['tenantId', 'organizationId', 'status', 'updatedAt'] })
@Index({ properties: ['tenantId', 'organizationId', 'companyDedupeKey'] })
export class LeadgenCandidate {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'run_id', type: 'uuid' })
  runId!: string

  /** sha256(run_key|normalized payload): a replayed submission returns this row. */
  @Property({ name: 'submitted_fingerprint', type: 'text' })
  submittedFingerprint!: string

  @Property({ name: 'company_dedupe_key', type: 'text' })
  companyDedupeKey!: string

  @Property({ name: 'company_name', type: 'text' })
  companyName!: string

  @Property({ name: 'company_domain', type: 'text', nullable: true })
  companyDomain?: string | null

  @Property({ name: 'company_country', type: 'text', nullable: true })
  companyCountry?: string | null

  @Property({ name: 'contact_name', type: 'text', nullable: true })
  contactName?: string | null

  @Property({ name: 'contact_title', type: 'text', nullable: true })
  contactTitle?: string | null

  @Property({ name: 'contact_email', type: 'text', nullable: true })
  contactEmail?: string | null

  /** Lookup sibling so email equality never scans plaintext. */
  @Property({ name: 'contact_email_hash', type: 'text', nullable: true })
  contactEmailHash?: string | null

  @Property({ name: 'source_url', type: 'text', nullable: true })
  sourceUrl?: string | null

  @Property({ name: 'claim_id', type: 'uuid', nullable: true })
  claimId?: string | null

  @Property({ name: 'crm_entity_id', type: 'uuid', nullable: true })
  crmEntityId?: string | null

  @Property({ name: 'crm_written_at', type: Date, nullable: true })
  crmWrittenAt?: Date | null

  @Property({ type: 'text', default: 'submitted' })
  status: 'submitted' | 'needs_review' | 'approved' | 'writing_crm' | 'crm_written' | 'rejected' | 'merged' | 'failed' =
    'submitted'

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'leadgen_candidate_evidence' })
@Unique({ properties: ['candidateId', 'contentHash'] })
export class LeadgenCandidateEvidence {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'candidate_id', type: 'uuid' })
  candidateId!: string

  /** homepage | directory | exhibition | careers | other */
  @Property({ type: 'text' })
  kind!: string

  @Property({ type: 'text' })
  url!: string

  @Property({ name: 'fetched_at', type: Date })
  fetchedAt!: Date

  @Property({ name: 'http_status', type: 'integer', nullable: true })
  httpStatus?: number | null

  @Property({ name: 'content_hash', type: 'text' })
  contentHash!: string

  @Property({ type: 'text', nullable: true })
  excerpt?: string | null

  @Property({ type: 'text', nullable: true })
  method?: string | null

  @Property({ type: 'text', nullable: true })
  adapter?: string | null

  @Property({ type: 'integer', default: 0 })
  rank: number = 0

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

@Entity({ tableName: 'leadgen_verifications' })
@Unique({ properties: ['candidateId', 'verifierVersion', 'inputDigest'] })
export class LeadgenVerification {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'candidate_id', type: 'uuid' })
  candidateId!: string

  @Property({ name: 'verifier_version', type: 'text' })
  verifierVersion!: string

  @Property({ name: 'ruleset_hash', type: 'text' })
  rulesetHash!: string

  /** sha256 of the normalized candidate input: identical input never re-runs. */
  @Property({ name: 'input_digest', type: 'text' })
  inputDigest!: string

  @Property({ type: 'text' })
  verdict!: 'pass' | 'needs_review' | 'fail'

  /** Per-check detail, kept verbatim so a verdict can be explained later. */
  @Property({ type: 'jsonb', nullable: true })
  checks?: unknown[] | null

  @Property({ name: 'started_at', type: Date, onCreate: () => new Date() })
  startedAt: Date = new Date()

  @Property({ name: 'completed_at', type: Date, nullable: true })
  completedAt?: Date | null
}
