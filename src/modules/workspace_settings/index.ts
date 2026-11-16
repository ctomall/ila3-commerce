import type { ModuleInfo } from '@open-mercato/shared/modules/registry'
import { features } from './acl'
import { NavigationPreference, WorkspaceLayout } from './data/entities'

/**
 * Organization-level navigation governance.
 *
 * Workspaces themselves stay code-declared (`src/nav/workspaces.json`): this
 * module only stores how an organization *presents* them (order, visibility,
 * labels), the presets an administrator hands to employees, and the per-user
 * preferences that must survive a different browser. It never widens access:
 * every consumer intersects the stored hints with the authorized catalogue.
 */
export const metadata: ModuleInfo = {
  name: 'workspace_settings',
  title: 'Workspace settings',
  version: '0.1.0',
  description:
    'Organization workspace order, visibility, labels and presets, plus per-user navigation preferences.',
  author: 'ILA3 Commerce Team',
  license: 'MIT',
}

export const entities = [WorkspaceLayout, NavigationPreference] as const
export { WorkspaceLayout, NavigationPreference, features }
export default metadata
