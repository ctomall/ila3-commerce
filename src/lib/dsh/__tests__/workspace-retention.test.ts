import { lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from '@jest/globals'
import { pruneOldWorkspaces } from '../workspace-retention'

let root: string | null = null
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
  root = null
})

describe('pruneOldWorkspaces', () => {
  it('removes only old run directories and never follows symlinks', () => {
    root = mkdtempSync(join(tmpdir(), 'dsh-retention-'))
    const ws = join(root, 'workspaces', 'identity')
    const oldRun = join(ws, 'old-run')
    const newRun = join(ws, 'new-run')
    mkdirSync(oldRun, { recursive: true })
    mkdirSync(newRun, { recursive: true })
    writeFileSync(join(oldRun, 'file'), 'x')
    const old = new Date('2020-01-01T00:00:00Z')
    utimesSync(oldRun, old, old)
    const outside = join(root, 'outside')
    mkdirSync(outside)
    symlinkSync(outside, join(ws, 'link-run'))

    const result = pruneOldWorkspaces({ root, ttlMs: 7 * 24 * 3600 * 1000, now: Date.now() })

    expect(result.removed).toBe(1)
    expect(result.scanned).toBe(2)
    expect(() => lstatSyncSafe(oldRun)).toThrow()
    expect(() => lstatSyncSafe(newRun)).not.toThrow()
    expect(() => lstatSyncSafe(outside)).not.toThrow()
  })

  it('is a no-op when the workspace root does not exist', () => {
    root = mkdtempSync(join(tmpdir(), 'dsh-retention-empty-'))
    expect(pruneOldWorkspaces({ root, ttlMs: 1 })).toMatchObject({ scanned: 0, removed: 0 })
  })
})

function lstatSyncSafe(path: string) {
  return lstatSync(path)
}
