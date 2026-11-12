import type { ModuleInfo } from '@open-mercato/shared/modules/registry'
import { features } from './acl'
import {
  LeadgenCandidate,
  LeadgenCandidateDecision,
  LeadgenCandidateEvidence,
  LeadgenCompanyClaim,
  LeadgenResearchRun,
  LeadgenVerification,
} from './data/entities'

/**
 * Lead generation: candidate pipeline for the CRM.
 *
 * Scope of this first slice: research runs, candidates, company claims, evidence and
 * deterministic verifications. Quota, approval/send and bot bindings follow in a second
 * migration once this one is reviewed and applied.
 *
 * Nothing here writes to core tables; cross-module references are scalar ids.
 * M5 adds the decision ledger and the API in `services/` + `src/app/api/leadgen`.
 */
export const metadata: ModuleInfo = {
  name: 'leadgen',
  title: 'Lead Generation',
  version: '0.1.0',
  description: 'Candidate intake, company-level dedupe and deterministic verification for CRM lead generation.',
  author: 'Acme Corp',
  license: 'MIT',
}

export const entities = [
  LeadgenResearchRun,
  LeadgenCandidate,
  LeadgenCandidateEvidence,
  LeadgenVerification,
  LeadgenCompanyClaim,
  LeadgenCandidateDecision,
] as const

export { features }
export default metadata
