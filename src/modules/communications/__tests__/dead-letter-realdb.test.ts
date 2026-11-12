import { describe, expect, it } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

/**
 * Real-Postgres proof that an unmatched receipt can actually be written.
 *
 * The unit tests stub the EntityManager, so a wrong column name or a nullable
 * mismatch would only surface in production — where the helper deliberately
 * swallows the failure (a webhook must not 5xx because its bookkeeping failed),
 * making "recorded nothing" look like success. The runner uses the shipped entity
 * mapping against a supplied database; it is skipped without `P6_REALDB_URL`, so
 * a skip means "not exercised here", never "verified".
 */
const realUrl = process.env.P6_REALDB_URL
const describeReal = realUrl ? describe : describe.skip

describeReal('unmatched receipts against real Postgres', () => {
  it('writes the dead-letter row with the real entity mapping and deduplicates it', () => {
    const runner = path.join(
      process.cwd(),
      'src/modules/communications/__tests__/realdb/dead-letter-runner.mjs',
    )
    const output = execFileSync(process.execPath, [runner], {
      encoding: 'utf8',
      env: { ...process.env, P6_REALDB_URL: realUrl },
      timeout: 120_000,
    })
    expect(output).toContain('PASS unmatched receipt is written with the real entity mapping')
    expect(output).toContain('PASS the same receipt is deduplicated')
    expect(output).toContain('PASS a different error class is recorded separately')
    expect(output).toContain('PASS a watermark is recorded by conversation id')
    expect(output).toContain('dead-letter realdb: all scenarios passed')
  }, 150_000)
})
