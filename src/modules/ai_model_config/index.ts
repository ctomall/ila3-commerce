import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

/**
 * App-level module that owns the tenant-managed AI model catalog.
 *
 * Providers (protocols, base URLs, API keys) stay environment-managed — this
 * module lets an administrator freely add, rename, disable and remove the
 * *models* exposed by those providers, and pick the tenant-wide default model.
 *
 * Storage: `module_configs` row `ai_assistant / model_catalog`, tenant-scoped,
 * so no database migration is required.
 */
export const metadata: ModuleInfo = {
  name: 'ai_model_config',
  title: 'AI Model Configuration',
  version: '0.1.0',
  description:
    'Settings surface for the AI assistant model catalog: add, edit, disable and delete models, and choose the tenant default model.',
  author: 'Acme Corp',
  license: 'MIT',
}

export default metadata
