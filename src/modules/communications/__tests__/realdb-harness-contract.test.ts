import { describe, expect, it } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Anti-rot guard for `scripts/realdb-suite.mjs` (S98).
 *
 * The harness spawns Postgres, so it cannot run inside jest. What CAN be pinned is
 * that it still points at existing suites, stays exposed as an npm script, and
 * keeps its cleanup path — the three ways this kind of helper silently stops
 * working.
 */
const source = fs.readFileSync(path.resolve(process.cwd(), 'scripts/realdb-suite.mjs'), 'utf8')
const suitePaths = [...source.matchAll(/test:\s*'([^']+)'/g)].map((match) => match[1])

describe('realdb suite harness', () => {
  it('lists the six real-DB suites and every referenced test file exists', () => {
    expect(suitePaths).toHaveLength(6)
    for (const testPath of suitePaths) {
      expect(fs.existsSync(path.resolve(process.cwd(), testPath))).toBe(true)
    }
    expect(suitePaths.join('\n')).toContain('product-reconciliation-realdb.test.ts')
    expect(suitePaths.join('\n')).toContain('customer-link-realdb.test.ts')
    expect(suitePaths.join('\n')).toContain('internal-notes-realdb.test.ts')
    expect(suitePaths.join('\n')).toContain('send-ledger-realdb.test.ts')
    expect(suitePaths.join('\n')).toContain('internal-notes-write-realdb.test.ts')
    expect(suitePaths.join('\n')).toContain('reply-role-migration-realdb.test.ts')
  })

  it('stops and removes the cluster unless --keep is passed', () => {
    expect(source).toContain("'stop'")
    expect(source).toContain("'-m'")
    expect(source).toContain("'fast'")
    expect(source).toContain('fs.rmSync(dataDir, { recursive: true, force: true })')
    expect(source).toContain("process.argv.includes('--keep')")
  })

  it('is exposed as the realdb:check npm script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    expect(pkg.scripts?.['realdb:check']).toBe('node scripts/realdb-suite.mjs')
  })

  it('refuses to guess Postgres binaries instead of pinning a version path', () => {
    expect(source).toContain('REALDB_PG_BIN')
    expect(source).toContain('initdb')
    expect(source).toContain('createdb')
  })
})
