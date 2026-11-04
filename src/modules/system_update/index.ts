import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

/**
 * Operator surface for one-click upgrades from the deployed git remote.
 *
 * Deliberately server-side only: the browser never talks to git. The page asks
 * the API, the API writes an upgrade request and starts a transient systemd
 * unit, and the unit performs fetch -> reset -> build -> restart -> health check
 * with automatic rollback to the previous commit.
 */
export const metadata: ModuleInfo = {
  name: 'system_update',
  title: 'System Update',
  version: '0.1.0',
  description:
    'Superadmin-only one-click upgrade from the configured git remote, with pre-update tag, health check and automatic rollback.',
  author: 'ILA3',
  license: 'MIT',
}

export default metadata
