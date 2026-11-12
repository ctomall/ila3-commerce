import { describe, expect, it } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

/**
 * Real-Postgres check for conversation access + the customer link (S95 / F4-01).
 *
 * The route tests use a fake EM. This runs the extracted helpers (shared by the
 * notes route) through a real MikroORM EntityManager: NULL-inclusive organization
 * scope, the personal-channel mask, the `contact_person_id` write with its
 * idempotent no-op, the out-of-scope customer refusal, and LIKE escaping.
 *
 * Skips without `P6_REALDB_URL` — a skip means "not exercised here", never
 * "verified". The runner needs `tsx` because Jest's CommonJS transform cannot load
 * the ESM MikroORM packages.
 */
const realUrl = process.env.P6_REALDB_URL
const describeReal = realUrl ? describe : describe.skip

describeReal('conversation access + customer link against real Postgres', () => {
  it('masks, scopes, links idempotently and escapes wildcards in real SQL', () => {
    const runner = path.join(
      process.cwd(),
      'src/modules/communications/__tests__/realdb/customer-link-runner.mts',
    )
    const tsx = path.join(process.cwd(), 'node_modules/.bin/tsx')
    const output = execFileSync(tsx, [runner], {
      encoding: 'utf8',
      env: { ...process.env, P6_REALDB_URL: realUrl },
      timeout: 180_000,
    })
    expect(output).toContain('PASS another employee personal channel is masked')
    expect(output).toContain('PASS own channel and NULL-organization conversation resolve')
    expect(output).toContain('PASS another organization conversation is masked')
    expect(output).toContain('PASS link persists and re-linking is a no-op')
    expect(output).toContain('PASS unlink clears the column')
    expect(output).toContain('PASS out-of-scope customer is refused as not found')
    expect(output).toContain('PASS candidates respect scope and escape LIKE wildcards')
    expect(output).toContain('conversation access + customer link realdb: all scenarios passed')
  }, 240_000)
})
