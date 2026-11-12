import { describe, expect, it } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

/**
 * Real-Postgres check for the `reconcile-unknown` writer.
 *
 * The unit tests drive the control flow through an injectable fake client; this
 * runs the actual SQL (jsonb append, `for update`, status guard in the UPDATE)
 * against a database supplied by the integration harness. It skips when
 * `P6_REALDB_URL` is unset, so the ordinary unit run stays hermetic — a skip is
 * "not exercised here", never "verified".
 */
const realUrl = process.env.P6_REALDB_URL
const describeReal = realUrl ? describe : describe.skip

describeReal('reconcile-unknown against real Postgres', () => {
  it('appends reconciliation history and never changes the delivery status', () => {
    const runner = path.join(
      process.cwd(),
      'src/modules/communications/__tests__/realdb/reconcile-unknown-runner.mjs',
    )
    const output = execFileSync(process.execPath, [runner], {
      encoding: 'utf8',
      env: { ...process.env, P6_REALDB_URL: realUrl },
      timeout: 120_000,
    })
    expect(output).toContain('PASS dry-run leaves the row untouched')
    expect(output).toContain('PASS apply appends the entry and preserves status + unrelated metadata')
    expect(output).toContain('PASS a second resolution appends to the history')
    expect(output).toContain('PASS a non-unknown link is refused without a write')
    expect(output).toContain('PASS a missing link is refused')
    expect(output).toContain('reconcile-unknown realdb: all scenarios passed')
  }, 150_000)
})
