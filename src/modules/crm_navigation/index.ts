import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

/**
 * CRM navigation shell.
 *
 * Owns the app-level information architecture: the five-scene left rail, the
 * content-area second level (customer tabs, business category pages, related
 * record links), the management centre with search, and the account entry.
 *
 * It does not own page authorization: every destination is an existing page
 * whose server-side feature check still runs. Hiding an entry here therefore
 * never substitutes for an API permission.
 */
export const metadata: ModuleInfo = {
  name: 'crm_navigation',
  title: 'CRM Navigation',
  version: '0.1.0',
  description:
    'Five-scene navigation, in-content second-level navigation, and a searchable management centre over the authorized backend payload.',
  author: 'Acme Corp',
  license: 'MIT',
}

export default metadata
