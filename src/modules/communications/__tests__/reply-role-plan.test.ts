import { describe, expect, it } from '@jest/globals'
import {
  LEGACY_KEPT_ROLES,
  REPLY_ROLES,
  planReplyRoleMigration,
  verifyReplyRoleMigration,
} from '../lib/reply-role-plan'
import { LEGACY_REPLY_FEATURE, REPLY_FEATURE } from '../lib/reply-permission'

const base = () => ({
  superadmin: [LEGACY_REPLY_FEATURE],
  admin: [LEGACY_REPLY_FEATURE],
  manager: [LEGACY_REPLY_FEATURE, 'communication_channels.view'],
  employee: [LEGACY_REPLY_FEATURE, 'communication_channels.view'],
})

describe('planReplyRoleMigration', () => {
  it('grants reply to every answering role and revokes only employee legacy connect', () => {
    const plans = planReplyRoleMigration(base())
    const byRole = Object.fromEntries(plans.map((plan) => [plan.role, plan]))

    expect(byRole.employee.grant).toEqual([REPLY_FEATURE])
    expect(byRole.employee.revoke).toEqual([LEGACY_REPLY_FEATURE])
    expect(byRole.employee.after).toContain(REPLY_FEATURE)
    expect(byRole.employee.after).not.toContain(LEGACY_REPLY_FEATURE)
    // The read grant is untouched: replying must not cost inbox access.
    expect(byRole.employee.after).toContain('communication_channels.view')

    for (const role of LEGACY_KEPT_ROLES) {
      expect(byRole[role].revoke).toEqual([])
      expect(byRole[role].after).toContain(LEGACY_REPLY_FEATURE)
      expect(byRole[role].after).toContain(REPLY_FEATURE)
    }
  })

  it('is idempotent: a migrated tenant produces no changes', () => {
    const first = planReplyRoleMigration(base())
    const migrated = Object.fromEntries(first.map((plan) => [plan.role, plan.after]))
    const second = planReplyRoleMigration(migrated)
    expect(second.every((plan) => plan.changed === false)).toBe(true)
    expect(second.every((plan) => plan.grant.length === 0 && plan.revoke.length === 0)).toBe(true)
  })

  it('does not invent roles the tenant does not have', () => {
    const plans = planReplyRoleMigration({ employee: [LEGACY_REPLY_FEATURE] })
    expect(plans.map((plan) => plan.role)).toEqual(['employee'])
    expect(REPLY_ROLES).toHaveLength(4)
  })

  it('leaves an employee that never held the legacy grant unchanged apart from the reply grant', () => {
    const plans = planReplyRoleMigration({ employee: ['communication_channels.view'] })
    expect(plans[0].revoke).toEqual([])
    expect(plans[0].grant).toEqual([REPLY_FEATURE])
  })
})

describe('verifyReplyRoleMigration', () => {
  it('accepts the post-migration state', () => {
    const plans = planReplyRoleMigration(base())
    const after = Object.fromEntries(plans.map((plan) => [plan.role, plan.after]))
    expect(verifyReplyRoleMigration(after)).toEqual([])
  })

  it('reports an employee that still holds the legacy grant', () => {
    const problems = verifyReplyRoleMigration({ ...base(), employee: [REPLY_FEATURE, LEGACY_REPLY_FEATURE] })
    expect(problems.join('\n')).toContain('employee: still holds')
  })

  it('reports a supervisor role that lost the legacy grant', () => {
    const problems = verifyReplyRoleMigration({ ...base(), admin: [REPLY_FEATURE] })
    expect(problems.join('\n')).toContain('admin: lost')
  })

  it('reports an answering role without the reply grant', () => {
    const problems = verifyReplyRoleMigration({ employee: ['communication_channels.view'] })
    expect(problems.join('\n')).toContain('employee: missing')
  })
})
