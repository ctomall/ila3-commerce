/**
 * Pure plan for migrating reply/connect grants (`S85`, design rev2 `F5-01`, `D-3`).
 *
 * Two things must happen in the same operation, or a tenant loses the ability to
 * reply the moment `connect_user_channel` is revoked:
 *
 * 1. every role that answers customers gains `communications.reply`;
 * 2. `employee` loses `communication_channels.connect_user_channel` (personal
 *    channels are supervisor-and-above only), while the roles that keep it —
 *    superadmin / admin / manager — are untouched.
 *
 * The plan is a function of the CURRENT features, so it is idempotent: running it
 * twice yields zero changes the second time. It never invents a role that the
 * tenant does not have.
 */
import { LEGACY_REPLY_FEATURE, REPLY_FEATURE } from './reply-permission'

/** Roles that answer customers and therefore need the dedicated reply grant. */
export const REPLY_ROLES = ['superadmin', 'admin', 'manager', 'employee'] as const

/** Roles allowed to keep the legacy grant, which also allows personal channels. */
export const LEGACY_KEPT_ROLES = ['superadmin', 'admin', 'manager'] as const

export type RolePlan = {
  role: string
  grant: string[]
  revoke: string[]
  before: string[]
  after: string[]
  changed: boolean
}

/**
 * @param current role name -> features it currently holds. Roles missing from the
 *   map are treated as absent (not created, not reported as changed).
 */
export function planReplyRoleMigration(current: Record<string, readonly string[]>): RolePlan[] {
  const plans: RolePlan[] = []
  for (const role of REPLY_ROLES) {
    const features = current[role]
    if (!features) continue
    const set = new Set(features)
    const grant: string[] = []
    const revoke: string[] = []
    if (!set.has(REPLY_FEATURE)) {
      set.add(REPLY_FEATURE)
      grant.push(REPLY_FEATURE)
    }
    if (!(LEGACY_KEPT_ROLES as readonly string[]).includes(role) && set.has(LEGACY_REPLY_FEATURE)) {
      set.delete(LEGACY_REPLY_FEATURE)
      revoke.push(LEGACY_REPLY_FEATURE)
    }
    const after = [...set]
    plans.push({
      role,
      grant,
      revoke,
      before: [...features],
      after,
      changed: grant.length > 0 || revoke.length > 0,
    })
  }
  return plans
}

/**
 * Post-state invariants. Returns the violations instead of throwing so the caller
 * can report every one of them (the migration script aborts the transaction when
 * this is non-empty).
 */
export function verifyReplyRoleMigration(current: Record<string, readonly string[]>): string[] {
  const problems: string[] = []
  for (const role of REPLY_ROLES) {
    const features = current[role]
    if (!features) continue
    if (!features.includes(REPLY_FEATURE)) problems.push(`${role}: missing ${REPLY_FEATURE}`)
  }
  const employee = current.employee
  if (employee && employee.includes(LEGACY_REPLY_FEATURE)) {
    problems.push(`employee: still holds ${LEGACY_REPLY_FEATURE}`)
  }
  for (const role of LEGACY_KEPT_ROLES) {
    const features = current[role]
    if (!features) continue
    if (!features.includes(LEGACY_REPLY_FEATURE)) {
      problems.push(`${role}: lost ${LEGACY_REPLY_FEATURE} but must keep it`)
    }
  }
  return problems
}
