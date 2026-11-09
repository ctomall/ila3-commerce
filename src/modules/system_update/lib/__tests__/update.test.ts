import { describe, expect, it } from '@jest/globals'
import { pickRepoDir } from '../update'

describe('pickRepoDir', () => {
  it('skips release directories that carry no .git and uses the checkout', () => {
    const hasGit = (dir: string) => dir === '/home/pro/apps/mercato'
    expect(
      pickRepoDir(['/home/pro/releases/mercato/current', '/home/pro/apps/mercato'], hasGit),
    ).toBe('/home/pro/apps/mercato')
  })

  it('prefers the explicit ILA3_REPO_DIR candidate first', () => {
    const hasGit = (dir: string) => dir === '/tmp/checkout' || dir === '/home/pro/apps/mercato'
    expect(pickRepoDir(['/tmp/checkout', '/home/pro/apps/mercato'], hasGit)).toBe('/tmp/checkout')
  })

  it('ignores empty, blank and null candidates', () => {
    const seen: string[] = []
    const hasGit = (dir: string) => {
      seen.push(dir)
      return false
    }
    expect(pickRepoDir([null, undefined, '', '   '], hasGit)).toBeNull()
    expect(seen).toEqual([])
  })

  it('keeps looking when a candidate throws while probing', () => {
    const hasGit = (dir: string) => {
      if (dir === '/broken') throw new Error('EACCES')
      return dir === '/ok'
    }
    expect(pickRepoDir(['/broken', '/ok'], hasGit)).toBe('/ok')
  })

  it('returns null when no candidate is a checkout', () => {
    expect(pickRepoDir(['/a', '/b'], () => false)).toBeNull()
  })
})
