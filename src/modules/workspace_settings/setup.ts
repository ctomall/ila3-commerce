/**
 * Default grants for NEW tenants only. An existing tenant keeps its stored role
 * ACLs, so granting `workspace_settings.manage` to an existing admin role is a
 * separate, recorded ACL change — never an implicit effect of deploying code.
 */
import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['workspace_settings.view', 'workspace_settings.manage'],
    admin: ['workspace_settings.view', 'workspace_settings.manage'],
  },
}

export default setup
