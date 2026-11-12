import { describe, expect, it } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

/**
 * Real-Postgres check for the send idempotency ledger (S97 / design rev2 F3-08).
 *
 * Only a database can prove these: the unique key winning a genuine race, the TTL
 * reclaim removing the stale row, complete/release transitions, and the `42P01`
 * degradation to `SendLedgerUnavailableError`.
 *
 * Skips without `P6_REALDB_URL`. Runner needs `tsx` because Jest's CommonJS
 * transform cannot load the ESM MikroORM packages.
 */
const realUrl = process.env.P6_REALDB_URL
const describeReal = realUrl ? describe : describe.skip

describeReal('send idempotency ledger against real Postgres', () => {
  it('reserves once under concurrency, replays, reclaims and degrades honestly', () => {
    const runner = path.join(
      process.cwd(),
      'src/modules/communications/__tests__/realdb/send-ledger-runner.mts',
    )
    const tsx = path.join(process.cwd(), 'node_modules/.bin/tsx')
    const output = execFileSync(tsx, [runner], {
      encoding: 'utf8',
      env: { ...process.env, P6_REALDB_URL: realUrl },
      timeout: 180_000,
    })
    expect(output).toContain('PASS first claim reserves the key with its payload hash')
    expect(output).toContain('PASS an in-flight retry reports in_flight without a second row')
    expect(output).toContain('PASS completed keys replay on the same hash and conflict on a different one')
    expect(output).toContain('PASS a stale in-flight row is reclaimed and the old row is gone')
    expect(output).toContain('PASS release removes the row so the key is usable again')
    expect(output).toContain('PASS concurrent claims produce exactly one reservation')
    expect(output).toContain('PASS a missing ledger table surfaces SendLedgerUnavailableError')
    expect(output).toContain('send ledger realdb: all scenarios passed')
  }, 240_000)
})
