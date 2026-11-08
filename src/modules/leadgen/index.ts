import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

/**
 * Lead generation: candidate pipeline for the CRM.
 *
 * Scope of this first slice: research runs, candidates, company claims, evidence and
 * deterministic verifications. Quota, approval/send and bot bindings follow in a second
 * migration once this one is reviewed and applied.
 *
 * Nothing here writes to core tables; cross-module references are scalar ids.
 */
export const metadata: ModuleInfo = {
  name: 'leadgen',
  title: 'Lead Generation',
  version: '0.1.0',
  description: 'Candidate intake, company-level dedupe and deterministic verification for CRM lead generation.',
  author: 'Acme Corp',
  license: 'MIT',
}

export default metadata
