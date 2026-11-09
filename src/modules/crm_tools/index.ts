import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'crm_tools',
  title: 'CRM read-only tools',
  version: '0.1.0',
  description:
    'Per-employee assistant tools that read CRM data inside the caller own tenant and organization. Read-only by construction: no writes, no mutations, no scope from the model.',
  author: 'ILA3 Commerce Team',
  license: 'MIT',
}
