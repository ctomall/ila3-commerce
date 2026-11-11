import type { ModuleInfo } from '@open-mercato/shared/modules/registry'
import { features } from './acl'
import { DshAssistantBinding, DshRun, DshRunEvent } from './data/entities'

/**
 * Persistence module for DSH employee runs (B1).
 *
 * Deliberately headless: no backend pages, widgets, API routes or navigation.
 * The chat route (A2) owns the browser-facing contract and consumes
 * `services/run-store.ts`; this module only owns the tables and their
 * invariants.
 */
export const metadata: ModuleInfo = {
  name: 'dsh_runs',
  title: 'DSH Runs',
  version: '0.1.0',
  description:
    'Employee assistant bindings, idempotent runs, append-only event cursors and revocation state for the DSH engine.',
  author: 'ILA3 Commerce Team',
  license: 'MIT',
}

/**
 * Entity list for discovery/tests. The generated entity registry also scans
 * `data/entities.ts` directly; exporting the classes here keeps the module's
 * ownership explicit without registering any UI page.
 */
export const entities = [DshAssistantBinding, DshRun, DshRunEvent] as const

export { DshAssistantBinding, DshRun, DshRunEvent, features }

export default metadata
