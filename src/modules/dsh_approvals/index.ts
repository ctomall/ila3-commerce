import type { ModuleInfo } from '@open-mercato/shared/modules/registry'
import { features } from './acl'
import { DshWriteApproval } from './data/entities'

/**
 * Human-approval ledger for DSH CRM writes (C phase).
 *
 * Owns the `dsh_write_approvals` table and the approval page; the tool bridge
 * (`src/lib/dsh/tool-bridge/approval-gate.ts`) is the only writer of proposals,
 * the employee-facing route is the only writer of decisions.
 */
export const metadata: ModuleInfo = {
  name: 'dsh_approvals',
  title: 'DSH Write Approvals',
  version: '0.1.0',
  description:
    'Per-write human approval for the DSH assistant: one proposal per (binding, tool, arguments), single-use consume, 10-minute validity.',
  author: 'ILA3 Commerce Team',
  license: 'MIT',
}

export const entities = [DshWriteApproval] as const

export { DshWriteApproval, features }

export default metadata
