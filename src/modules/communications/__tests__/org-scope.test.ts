import { describe, expect, it } from '@jest/globals'
import { nullInclusiveOrgWhere } from '../lib/org-scope'

/**
 * Regression for the SQL NULL trap: `$in: ['org', null]` never matches NULL rows,
 * so tenant-wide records silently disappeared. Caught by the internal-notes
 * real-DB suite (S96).
 */
describe('nullInclusiveOrgWhere', () => {
  it('uses an explicit $or so NULL organization rows stay visible', () => {
    expect(nullInclusiveOrgWhere('o1')).toEqual({
      $or: [{ organizationId: 'o1' }, { organizationId: null }],
    })
  })

  it('narrows to tenant-wide rows when the caller has no organization', () => {
    expect(nullInclusiveOrgWhere(null)).toEqual({ organizationId: null })
    expect(nullInclusiveOrgWhere(undefined)).toEqual({ organizationId: null })
    expect(nullInclusiveOrgWhere('')).toEqual({ organizationId: null })
  })
})
