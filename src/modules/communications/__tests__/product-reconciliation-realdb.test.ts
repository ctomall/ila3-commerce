import { describe, expect, it } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

/**
 * Real-Postgres check for the product reconciliation path (S94 / design rev2 F8-03).
 *
 * The unit tests drive a fake EM. This one runs the same functions through a real
 * MikroORM EntityManager against a disposable database, so the jsonb write, the
 * sibling-metadata preservation, the unknown/direction filter and the
 * NULL-inclusive organization scope are proven against Postgres instead of a mock.
 *
 * It skips when `P6_REALDB_URL` is unset — a skip means "not exercised here", never
 * "verified". The runner is launched through `tsx` because Jest's CommonJS
 * transform cannot load the ESM MikroORM packages.
 */
const realUrl = process.env.P6_REALDB_URL
const describeReal = realUrl ? describe : describe.skip

describeReal('product reconciliation against real Postgres', () => {
  it('appends verdicts, preserves metadata and filters the scope in real SQL', () => {
    const runner = path.join(
      process.cwd(),
      'src/modules/communications/__tests__/realdb/product-reconciliation-runner.mts',
    )
    const tsx = path.join(process.cwd(), 'node_modules/.bin/tsx')
    const output = execFileSync(tsx, [runner], {
      encoding: 'utf8',
      env: { ...process.env, P6_REALDB_URL: realUrl },
      timeout: 180_000,
    })
    expect(output).toContain('PASS append keeps delivery_status unknown and preserves sibling metadata')
    expect(output).toContain('PASS a second verdict is refused')
    expect(output).toContain('PASS a non-unknown link is refused')
    expect(output).toContain('PASS listing filters unknown + outbound + NULL-inclusive organization scope')
    expect(output).toContain('product reconciliation realdb: all scenarios passed')
  }, 240_000)
})
