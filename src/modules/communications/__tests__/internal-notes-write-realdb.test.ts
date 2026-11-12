import { describe, expect, it } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

/**
 * Real-Postgres check for the internal-note WRITE path (S99 / design rev2 F3-06).
 *
 * S96 proved the read query and the input contract. This executes the actual
 * installed `messages.messages.compose` command through a minimal container (only
 * `em`; the hub tolerates a missing event bus) against a real database, then reads
 * the row back through the app query. Absent services warn instead of failing,
 * which is exactly what a minimal harness needs.
 *
 * Skips without `P6_REALDB_URL`; runner needs `tsx` for the ESM MikroORM packages.
 */
const realUrl = process.env.P6_REALDB_URL
const describeReal = realUrl ? describe : describe.skip

describeReal('internal notes write path against real Postgres', () => {
  it('composes through the installed command and reads the note back', () => {
    const runner = path.join(
      process.cwd(),
      'src/modules/communications/__tests__/realdb/internal-notes-write-runner.mts',
    )
    const tsx = path.join(process.cwd(), 'node_modules/.bin/tsx')
    const output = execFileSync(tsx, [runner], {
      encoding: 'utf8',
      env: { ...process.env, P6_REALDB_URL: realUrl },
      timeout: 180_000,
    })
    expect(output).toContain('PASS compose creates an internal note row with no delivery flags')
    expect(output).toContain('PASS the note is addressed to its author')
    expect(output).toContain('PASS the composed note is returned by the app read path')
    expect(output).toContain('PASS a note with a parent inherits the parent thread')
    expect(output).toContain('PASS another conversation stays out of the list')
    expect(output).toContain('internal notes write realdb: all scenarios passed')
  }, 240_000)
})
