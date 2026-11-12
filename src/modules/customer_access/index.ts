import type { ModuleInfo } from '@open-mercato/shared/modules/registry'
import { features } from './acl'
import { CustomerAccessGrant } from './data/entities'

/**
 * Productised employee → customer access (`customer_access`).
 *
 * The DSH tool bridge resolves `OM_DSH_CUSTOMER_SCOPE=assigned` to
 * "own rows + live grants"; this module owns the table, the admin API and the
 * grant lifecycle. It never changes ownership: a grant is additive and
 * revocable, ownership remains on the customer entity.
 */
export const metadata: ModuleInfo = {
  name: 'customer_access',
  title: 'Customer Access',
  version: '0.1.0',
  description:
    'Explicit per-employee customer grants (view/edit) with soft revocation, used by the assistant tool scope.',
  author: 'ILA3 Commerce Team',
  license: 'MIT',
}

export const entities = [CustomerAccessGrant] as const
export { CustomerAccessGrant, features }
export default metadata
