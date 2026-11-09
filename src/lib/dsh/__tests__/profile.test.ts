import { describe, expect, it } from '@jest/globals'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  deriveProfile,
  materializeProfile,
  profileKeyOf,
  revoke,
  sharedRoots,
  wideningAttempt,
  type EmployeeProfileInput,
} from '../profile'

const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-profile-test-'))
const mode = (target: string) => fs.statSync(target).mode & 0o777

const base: EmployeeProfileInput = {
  userId: 'user-aaaa',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  assistantId: 'crm.lead_researcher',
  policyVersion: 'pv-1',
  grantedTools: ['crm.find_companies', 'context_whoami', 'customers.list_people'],
  assistantTools: ['crm.find_companies', 'context_whoami'],
}

describe('deriveProfile', () => {
  it('exposes only granted tools that the assistant may also expose', () => {
    const profile = deriveProfile(base)
    expect(profile.tools).toEqual(['context_whoami', 'crm.find_companies'])
  })

  it('records a granted tool the assistant does not expose, instead of keeping it', () => {
    const profile = deriveProfile(base)
    expect(profile.dropped).toContainEqual({ tool: 'customers.list_people', reason: 'not-in-assistant-ceiling' })
  })

  it('records an assistant tool the employee was not granted', () => {
    const profile = deriveProfile({ ...base, grantedTools: ['context_whoami'] })
    expect(profile.tools).toEqual(['context_whoami'])
    expect(profile.dropped).toContainEqual({ tool: 'crm.find_companies', reason: 'not-granted' })
  })

  it('narrows to the request and never widens to it', () => {
    const child = deriveProfile({ ...base, requestedTools: ['crm.find_companies', 'crm.steal_everything'] })
    expect(child.tools).toEqual(['crm.find_companies'])
    // A requested tool outside the parent is an escalation attempt, not a typo.
    expect(child.dropped).toContainEqual({ tool: 'crm.steal_everything', reason: 'not-in-assistant-ceiling' })
    expect(wideningAttempt(deriveProfile(base), child)).toEqual([])
  })

  it('reports a widening attempt when the child holds a tool the parent does not', () => {
    const parent = deriveProfile({ ...base, assistantTools: ['context_whoami'], grantedTools: ['context_whoami'] })
    const child = deriveProfile({ ...base, assistantTools: ['context_whoami', 'crm.find_companies'] })
    expect(wideningAttempt(parent, child)).toEqual(['crm.find_companies'])
  })

  it('deduplicates and sorts, so two derivations of one input never differ', () => {
    const dupes = deriveProfile({ ...base, grantedTools: ['context_whoami', 'context_whoami', 'crm.find_companies'] })
    expect(dupes.tools).toEqual(['context_whoami', 'crm.find_companies'])
    expect(deriveProfile(base)).toEqual(deriveProfile(base))
  })

  it('gives two employees disjoint roots and keys', () => {
    const a = deriveProfile(base)
    const b = deriveProfile({ ...base, userId: 'user-bbbb' })
    expect(a.profileKey).not.toEqual(b.profileKey)
    expect(sharedRoots(a, b)).toEqual([])
  })

  it('keeps employee ids out of every path', () => {
    const profile = deriveProfile(base)
    for (const root of Object.values(profile.roots)) {
      expect(root).not.toContain('user-aaaa')
      expect(root).not.toContain('user-bbbb')
    }
  })

  it('re-partitions memory when the policy version changes but keeps the employee', () => {
    const v1 = deriveProfile(base)
    const v2 = deriveProfile({ ...base, policyVersion: 'pv-2' })
    expect(v1.roots.memory).not.toEqual(v2.roots.memory)
    expect(v1.userId).toEqual(v2.userId)
    expect(v1.profileKey).not.toEqual(v2.profileKey)
  })

  it('fails closed on revocation: identity kept, every tool gone', () => {
    const revoked = revoke(deriveProfile(base))
    expect(revoked.tools).toEqual([])
    expect(revoked.revoked).toBe(true)
    expect(revoked.userId).toEqual(base.userId)
  })

  it('refuses a policy version that could escape the profile root', () => {
    for (const evil of ['../../../../..', '../etc', '/etc', 'pv/../..', 'pv 1', '']) {
      expect(() => deriveProfile({ ...base, policyVersion: evil })).toThrow(/policyVersion/)
    }
    expect(deriveProfile({ ...base, policyVersion: 'pv-2.1_beta' }).roots.memory).toContain('pv-2.1_beta')
  })

  it('creates a traversable profiles/ parent so denial is attributable to the employee dir', () => {
    const root = tempRoot()
    const written = materializeProfile(deriveProfile(base), root)
    expect(mode(path.join(root, 'profiles'))).toBe(0o711)
    expect(mode(path.dirname(written.profileDir))).toBe(0o711)
    expect(mode(written.profileDir)).toBe(0o700)
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('refuses to build a key from a blank identity field', () => {
    expect(() => profileKeyOf({ ...base, userId: '  ' })).toThrow(/userId/)
    expect(() => deriveProfile({ ...base, assistantId: '' })).toThrow(/assistantId/)
  })

  it('yields an empty toolset when nothing is granted, rather than the ceiling', () => {
    expect(deriveProfile({ ...base, grantedTools: [] }).tools).toEqual([])
  })
})

describe('materializeProfile', () => {
  it('creates four 0700 directories and a 0600 metadata file', () => {
    const root = tempRoot()
    const profile = deriveProfile(base)
    const written = materializeProfile(profile, root)
    for (const suffix of ['session', 'artifacts', `memory/${base.policyVersion}`, 'browser']) {
      const dir = path.join(written.profileDir, suffix)
      expect(fs.statSync(dir).isDirectory()).toBe(true)
      expect(mode(dir)).toBe(0o700)
    }
    expect(mode(written.metadataPath)).toBe(0o600)
    expect(JSON.parse(fs.readFileSync(written.metadataPath, 'utf8'))).toMatchObject({
      userId: base.userId,
      profileKey: profile.profileKey,
    })
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('is idempotent for the same identity', () => {
    const root = tempRoot()
    const profile = deriveProfile(base)
    expect(materializeProfile(profile, root).created).toBe(true)
    expect(materializeProfile(profile, root).created).toBe(false)
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('refuses to reuse a directory whose metadata names another identity', () => {
    const root = tempRoot()
    const profile = deriveProfile(base)
    const written = materializeProfile(profile, root)
    fs.writeFileSync(written.metadataPath, JSON.stringify({ userId: 'someone-else', profileKey: profile.profileKey }))
    expect(() => materializeProfile(profile, root)).toThrow(/already belongs to another identity/)
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('keeps two employees in unrelated directories', () => {
    const root = tempRoot()
    const a = materializeProfile(deriveProfile(base), root)
    const b = materializeProfile(deriveProfile({ ...base, userId: 'user-bbbb' }), root)
    expect(a.profileDir).not.toBe(b.profileDir)
    expect(fs.readdirSync(path.join(root, 'profiles')).sort()).toEqual(
      [a.profileDir, b.profileDir].map((dir) => path.basename(dir)).sort(),
    )
    expect(fs.readdirSync(a.profileDir)).not.toContain(path.basename(b.profileDir))
    fs.rmSync(root, { recursive: true, force: true })
  })
})
