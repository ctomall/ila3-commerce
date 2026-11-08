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

/* ------------------------------------------------------------------ 第二片：配额 / 审批发送 / 绑定 */

@Entity({ tableName: 'leadgen_quota_buckets' })
@Unique({ properties: ['tenantId', 'organizationId', 'scopeKind', 'scopeId', 'quotaKind', 'periodKey'] })
@Index({ properties: ['tenantId', 'organizationId', 'quotaKind', 'periodKey'] })
export class LeadgenQuotaBucket {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  /** tenant | department | employee | task — the effective limit is the minimum of all four. */
  @Property({ name: 'scope_kind', type: 'text' })
  scopeKind!: 'tenant' | 'department' | 'employee' | 'task'

  /** Null only for the tenant-level bucket. */
  @Property({ name: 'scope_id', type: 'uuid', nullable: true })
  scopeId?: string | null

  @Property({ name: 'quota_kind', type: 'text' })
  quotaKind!: 'lead' | 'crm_write' | 'send'

  @Property({ name: 'period_key', type: 'text' })
  periodKey!: string

  @Property({ name: 'limit_units', type: 'integer' })
  limitUnits!: number

  @Property({ name: 'reserved_units', type: 'integer', default: 0 })
  reservedUnits: number = 0

  @Property({ name: 'consumed_units', type: 'integer', default: 0 })
  consumedUnits: number = 0

  @Property({ type: 'integer', default: 1 })
  version: number = 1

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'leadgen_quota_reservations' })
@Unique({ properties: ['tenantId', 'organizationId', 'idempotencyKey'] })
@Unique({ properties: ['leaseToken'] })
@Index({ properties: ['state', 'expiresAt'] })
export class LeadgenQuotaReservation {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'bucket_id', type: 'uuid' })
  bucketId!: string

  @Property({ name: 'lease_token', type: 'text' })
  leaseToken!: string

  @Property({ name: 'idempotency_key', type: 'text' })
  idempotencyKey!: string

  @Property({ type: 'integer' })
  units!: number

  @Property({ type: 'text', default: 'reserved' })
  state: 'reserved' | 'consumed' | 'refunded' | 'expired' = 'reserved'

  @Property({ name: 'subject_kind', type: 'text', nullable: true })
  subjectKind?: string | null

  @Property({ name: 'subject_id', type: 'uuid', nullable: true })
  subjectId?: string | null

  @Property({ name: 'expires_at', type: Date })
  expiresAt!: Date

  @Property({ name: 'consumed_at', type: Date, nullable: true })
  consumedAt?: Date | null

  @Property({ name: 'refunded_at', type: Date, nullable: true })
  refundedAt?: Date | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

@Entity({ tableName: 'leadgen_quota_ledger' })
@Index({ properties: ['bucketId', 'occurredAt'] })
export class LeadgenQuotaLedger {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'bucket_id', type: 'uuid' })
  bucketId!: string

  @Property({ name: 'reservation_id', type: 'uuid', nullable: true })
  reservationId?: string | null

  @Property({ name: 'entry_kind', type: 'text' })
  entryKind!: 'reserve' | 'consume' | 'refund' | 'expire' | 'adjust'

  /** Signed: negative entries give units back. */
  @Property({ name: 'delta_units', type: 'integer' })
  deltaUnits!: number

  @Property({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId?: string | null

  @Property({ name: 'reason_code', type: 'text', nullable: true })
  reasonCode?: string | null

  @Property({ name: 'occurred_at', type: Date, onCreate: () => new Date() })
  occurredAt: Date = new Date()
}

@Entity({ tableName: 'leadgen_drafts' })
@Unique({ properties: ['tenantId', 'organizationId', 'candidateId', 'bodyHash'] })
@Index({ properties: ['tenantId', 'organizationId', 'status'] })
export class LeadgenDraft {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'candidate_id', type: 'uuid' })
  candidateId!: string

  @Property({ name: 'recipient_email', type: 'text' })
  recipientEmail!: string

  @Property({ name: 'recipient_hash', type: 'text' })
  recipientHash!: string

  @Property({ type: 'text', default: 'email' })
  channel: string = 'email'

  @Property({ type: 'text' })
  subject!: string

  @Property({ name: 'body_markdown', type: 'text' })
  bodyMarkdown!: string

  @Property({ name: 'body_html', type: 'text', nullable: true })
  bodyHtml?: string | null

  @Property({ name: 'body_hash', type: 'text' })
  bodyHash!: string

  @Property({ name: 'template_key', type: 'text', nullable: true })
  templateKey?: string | null

  @Property({ name: 'template_version', type: 'text', nullable: true })
  templateVersion?: string | null

  @Property({ type: 'integer', default: 1 })
  version: number = 1

  @Property({ type: 'text', default: 'editing' })
  status: 'editing' | 'ready' | 'approved' | 'sent' | 'superseded' | 'blocked' = 'editing'

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'leadgen_approvals' })
@Unique({ properties: ['tenantId', 'organizationId', 'idempotencyKey'] })
@Index({ properties: ['draftId', 'decision'] })
export class LeadgenApproval {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'draft_id', type: 'uuid' })
  draftId!: string

  /** The approval is bound to this hash: any body change invalidates it. */
  @Property({ name: 'draft_hash', type: 'text' })
  draftHash!: string

  @Property({ type: 'text' })
  decision!: 'approved' | 'rejected'

  @Property({ name: 'approver_user_id', type: 'uuid' })
  approverUserId!: string

  @Property({ name: 'idempotency_key', type: 'text' })
  idempotencyKey!: string

  @Property({ name: 'expires_at', type: Date })
  expiresAt!: Date

  @Property({ name: 'revoked_at', type: Date, nullable: true })
  revokedAt?: Date | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

@Entity({ tableName: 'leadgen_sends' })
@Unique({ properties: ['tenantId', 'organizationId', 'idempotencyKey'] })
@Index({ properties: ['state', 'updatedAt'] })
@Index({ properties: ['draftId'] })
export class LeadgenSend {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'draft_id', type: 'uuid' })
  draftId!: string

  @Property({ name: 'approval_id', type: 'uuid' })
  approvalId!: string

  @Property({ name: 'draft_hash', type: 'text' })
  draftHash!: string

  /** One key from approval to provider, so a retry cannot double-send. */
  @Property({ name: 'idempotency_key', type: 'text' })
  idempotencyKey!: string

  @Property({ name: 'provider_key', type: 'text', nullable: true })
  providerKey?: string | null

  @Property({ type: 'text', default: 'email' })
  channel: string = 'email'

  @Property({ name: 'provider_message_id', type: 'text', nullable: true })
  providerMessageId?: string | null

  @Property({ type: 'text', default: 'queued' })
  state:
    | 'queued'
    | 'dispatching'
    | 'accepted'
    | 'delivered'
    | 'replied'
    | 'unknown'
    | 'bounced'
    | 'complained'
    | 'failed'
    | 'suppressed' = 'queued'

  @Property({ type: 'integer', default: 0 })
  attempt: number = 0

  @Property({ name: 'lease_owner', type: 'text', nullable: true })
  leaseOwner?: string | null

  @Property({ name: 'lease_expires_at', type: Date, nullable: true })
  leaseExpiresAt?: Date | null

  @Property({ name: 'enqueued_at', type: Date, onCreate: () => new Date() })
  enqueuedAt: Date = new Date()

  @Property({ name: 'sent_at', type: Date, nullable: true })
  sentAt?: Date | null

  @Property({ name: 'error_code', type: 'text', nullable: true })
  errorCode?: string | null

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'leadgen_message_receipts' })
@Unique({ properties: ['tenantId', 'providerEventId'] })
@Index({ properties: ['sendId', 'occurredAt'] })
export class LeadgenMessageReceipt {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'send_id', type: 'uuid' })
  sendId!: string

  @Property({ name: 'provider_event_id', type: 'text' })
  providerEventId!: string

  @Property({ type: 'text' })
  kind!: 'delivered' | 'bounced' | 'complained' | 'opened' | 'replied'

  @Property({ type: 'text', nullable: true })
  classification?: string | null

  @Property({ name: 'classifier_version', type: 'text', nullable: true })
  classifierVersion?: string | null

  @Property({ name: 'occurred_at', type: Date })
  occurredAt!: Date

  @Property({ name: 'payload_hash', type: 'text' })
  payloadHash!: string
}

@Entity({ tableName: 'leadgen_suppressions' })
@Index({ properties: ['tenantId', 'organizationId', 'reason'] })
export class LeadgenSuppression {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'email_hash', type: 'text' })
  emailHash!: string

  @Property({ type: 'text' })
  email!: string

  @Property({ type: 'text' })
  reason!: 'unsubscribe' | 'complaint' | 'bounce'

  @Property({ name: 'source_send_id', type: 'uuid', nullable: true })
  sourceSendId?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'released_at', type: Date, nullable: true })
  releasedAt?: Date | null
}

@Entity({ tableName: 'leadgen_capability_policies' })
@Unique({ properties: ['tenantId', 'organizationId', 'policyKey', 'version'] })
export class LeadgenCapabilityPolicy {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'policy_key', type: 'text' })
  policyKey!: string

  @Property({ type: 'integer' })
  version!: number

  @Property({ type: 'jsonb' })
  capabilities!: unknown

  @Property({ type: 'text', default: 'draft' })
  status: 'draft' | 'active' | 'retired' = 'draft'

  @Property({ name: 'effective_from', type: Date, nullable: true })
  effectiveFrom?: Date | null

  @Property({ name: 'effective_to', type: Date, nullable: true })
  effectiveTo?: Date | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

@Entity({ tableName: 'leadgen_employee_bindings' })
@Unique({ properties: ['tenantId', 'organizationId', 'employeeId', 'state'] })
@Index({ properties: ['tenantId', 'organizationId', 'assistantAgentKey'] })
export class LeadgenEmployeeBinding {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'employee_id', type: 'uuid' })
  employeeId!: string

  @Property({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string | null

  @Property({ name: 'assistant_agent_key', type: 'text' })
  assistantAgentKey!: string

  @Property({ name: 'capability_policy_id', type: 'uuid' })
  capabilityPolicyId!: string

  @Property({ name: 'capability_policy_version', type: 'integer' })
  capabilityPolicyVersion!: number

  @Property({ type: 'text', default: 'active' })
  state: 'active' | 'suspended' | 'revoked' | 'offboarded' = 'active'

  @Property({ name: 'bound_at', type: Date, onCreate: () => new Date() })
  boundAt: Date = new Date()

  @Property({ name: 'revoked_at', type: Date, nullable: true })
  revokedAt?: Date | null

  @Property({ name: 'revoke_reason', type: 'text', nullable: true })
  revokeReason?: string | null
}

@Entity({ tableName: 'leadgen_bot_bindings' })
@Index({ properties: ['tenantId', 'organizationId', 'channelId', 'externalIdentity'] })
export class LeadgenBotBinding {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'channel_id', type: 'uuid' })
  channelId!: string

  @Property({ name: 'channel_type', type: 'text' })
  channelType!: string

  @Property({ name: 'external_identity', type: 'text' })
  externalIdentity!: string

  @Property({ name: 'employee_binding_id', type: 'uuid' })
  employeeBindingId!: string

  @Property({ type: 'text', default: 'active' })
  state: 'active' | 'revoked' | 'offboarded' = 'active'

  @Property({ name: 'verified_at', type: Date, nullable: true })
  verifiedAt?: Date | null

  @Property({ name: 'revoked_at', type: Date, nullable: true })
  revokedAt?: Date | null
}
