/**
 * Anti-drift guard for the S85 migration script.
 *
 * `scripts/crm-reply-role-migration.mjs` runs outside the TypeScript build, so it
 * restates the two feature ids and the role lists. This test fails when the script
 * and the app disagree, and it also pins the two safety properties that make the
 * script safe to hand to an operator: it is read-only without `--apply`, and
 * `--apply` requires the explicit environment gate.
 */
import { describe, expect, it } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'
import { LEGACY_KEPT_ROLES, REPLY_ROLES } from '../lib/reply-role-plan'
import { LEGACY_REPLY_FEATURE, REPLY_FEATURE } from '../lib/reply-permission'

const scriptPath = path.resolve(__dirname, '../../../../scripts/crm-reply-role-migration.mjs')
const source = fs.readFileSync(scriptPath, 'utf8')

function exported(name: string): string {
  const match = source.match(new RegExp(`export const ${name} = '([^']+)'`))
  if (!match) throw new Error(`script does not export ${name}`)
  return match[1]
}

describe('crm-reply-role-migration.mjs', () => {
  it('uses the same feature ids as the app', () => {
    expect(exported('REPLY_FEATURE')).toBe(REPLY_FEATURE)
    expect(exported('LEGACY_REPLY_FEATURE')).toBe(LEGACY_REPLY_FEATURE)
  })

  it('uses the same role lists as the app', () => {
    for (const role of REPLY_ROLES) expect(source).toContain(`'${role}'`)
    for (const role of LEGACY_KEPT_ROLES) expect(source).toContain(`'${role}'`)
    expect(source).toMatch(/export const REPLY_ROLES = \[[^\]]*'employee'\]/)
  })

  it('is read-only unless --apply and the environment gate are both present', () => {
    expect(source).toContain("process.argv.includes('--apply')")
    expect(source).toContain('ILA3_ALLOW_ROLE_MIGRATION')
    expect(source).toContain('--approval')
    expect(source).toContain('--tenant')
    // The whole change must commit or roll back together.
    expect(source).toContain('begin;')
    expect(source).toContain('commit;')
    expect(source).toContain('verify failed')
    expect(source).toContain('rollbackSql')
  })
})
