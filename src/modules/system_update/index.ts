import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

/**
 * Operator surface for the real release pipeline.
 *
 * The browser never talks to git or the filesystem. The page reads a read-only
 * status route that resolves the running release from `/proc/<pid>/cwd`, the
 * latest candidate from `origin/main`, and the deploy executor's own records
 * (`latest.json` / `runs/*.json`). A manual request still goes through the
 * existing run route, which hands it to the unified isolated entry point:
 * CI gate -> release build -> candidate health check -> slot switch.
 */
export const metadata: ModuleInfo = {
  name: 'system_update',
  title: 'System Update',
  version: '0.1.0',
  description:
    'Superadmin-only release status and manual upgrade entry: shows the running release slot, the latest origin/main candidate, and ila3-auto-deploy run records.',
  author: 'ILA3',
  license: 'MIT',
}

export default metadata
