import { describe, expect, it } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

/**
 * Real-Postgres drill for the S85 permission migration (design rev2 F5-01 / D-3).
 *
 * The production apply is still waiting for approval; this proves the script's whole
 * contract against a throwaway database: read-only plan, both refusals, one-batch
 * apply, idempotency, the in-transaction verification abort, and the recorded
 * rollback SQL. The runner points the script at a temp release `.env`, so it cannot
 * reach the real release.
 *
 * Skips without `P6_REALDB_URL`. Runner needs `tsx` because Jest's CommonJS transform
 * cannot load the ESM packages the migration path touches.
 */
const realUrl = process.env.P6_REALDB_URL
const describeReal = realUrl ? describe : describe.skip

describeReal('reply/connect permission migration against real Postgres', () => {
  it('plans, refuses, applies, stays idempotent, aborts on a broken post-condition and rolls back', () => {
    const runner = path.join(
      process.cwd(),
      'src/modules/communications/__tests__/realdb/reply-role-migration-runner.mts',
    )
    const tsx = path.join(process.cwd(), 'node_modules/.bin/tsx')
    const output = execFileSync(tsx, [runner], {
      encoding: 'utf8',
      env: { ...process.env, P6_REALDB_URL: realUrl },
      timeout: 180_000,
    })
    expect(output).toContain('PASS check is read-only and plans exactly the employee grant + legacy revoke')
    expect(output).toContain('PASS apply refuses without the safety flag or for an unknown tenant, leaving grants untouched')
    expect(output).toContain('PASS apply commits the grant + revoke in one batch and writes the rollback SQL')
    expect(output).toContain('PASS a second apply is a no-op')
    expect(output).toContain('PASS the in-transaction verification aborts and rolls back the whole batch')
    expect(output).toContain('PASS the recorded rollback SQL restores the pre-migration grants')
    expect(output).toContain('reply-role-migration realdb: all scenarios passed')
  }, 240_000)
})
