/**
 * Structured evidence fields (expand-only).
 *
 * `leadgen_candidate_evidence` stored an excerpt but no structured fields, so the
 * deterministic verifier could not read what the extractor actually claimed and a
 * stored verdict could not be reproduced. One nullable jsonb column fixes that.
 */
import { Migration } from '@mikro-orm/migrations'

export class Migration20261112063000_leadgen_evidence_fields extends Migration {
  override name = 'Migration20261112063000'

  override up(): void | Promise<void> {
    this.addSql(`alter table "leadgen_candidate_evidence" add column "fields" jsonb null;`)
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "leadgen_candidate_evidence" drop column "fields";`)
  }
}
