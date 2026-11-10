import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

/**
 * CRM navigation shell.
 *
 * Owns only the app-level arrangement: which declared module groups feed the
 * installed AppShell sidebar, the management centre with search, and the
 * catalogued account entries. Module page metadata remains the source of
 * titles, icons, order, permission and visibility. The sidebar itself (logo,
 * search, group headers, items, collapse, mobile drawer) is the installed
 * `@open-mercato/ui` AppShell; the app no longer registers a competing rail.
 *
 * It does not own page authorization: every destination is an existing page
 * whose server-side feature check still runs. Hiding an entry here therefore
 * never substitutes for an API permission.
 */
export const metadata: ModuleInfo = {
  name: 'crm_navigation',
  title: 'CRM Navigation',
  version: '0.3.0',
  description:
    'Declared top-level navigation for the installed AppShell sidebar and a searchable management centre over the authorized backend payload.',
  author: 'Acme Corp',
  license: 'MIT',
}

export default metadata
