import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

/**
 * Read-only directory of the modules enabled in this deployment.
 *
 * The list is derived from the generated module registry (module metadata) and
 * the generated backend route metadata (page titles/paths), so it always
 * matches what the running build actually mounted.
 */
export const metadata: ModuleInfo = {
  name: 'module_directory',
  title: 'Module Directory',
  version: '0.1.0',
  description: 'Settings page listing every enabled module with version, description and navigation entry points.',
  author: 'Acme Corp',
  license: 'MIT',
}

export default metadata
