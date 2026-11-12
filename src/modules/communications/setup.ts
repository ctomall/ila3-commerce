/**
 * Default role grants for the communications module (new tenants only).
 *
 * Reading the inbox stays `communication_channels.view`. Replying gets its own
 * grant so staff can answer customers without holding the same feature that
 * lets them connect a mailbox or a WhatsApp account (design rev2, `F5-01`/`D-3`).
 *
 * This file only ADDS features at tenant-seed time. It cannot subtract the
 * `communication_channels.connect_user_channel` that the installed
 * `communication_channels` module still seeds for `employee`, so an existing
 * tenant AND a freshly initialised tenant both need
 * `scripts/crm-reply-role-migration.mjs` (check mode by default) before `employee`
 * is really restricted to shared channels. Both halves are required; see
 * `slices/S85-reply-role-migration/README.md`.
 */
import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { REPLY_FEATURE } from './lib/reply-permission'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: [REPLY_FEATURE],
    admin: [REPLY_FEATURE],
    manager: [REPLY_FEATURE],
    employee: [REPLY_FEATURE],
  },
}

export default setup
