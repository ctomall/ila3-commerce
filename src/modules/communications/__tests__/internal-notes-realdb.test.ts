import { describe, expect, it } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

/**
 * Real-Postgres check for the internal-note READ path (S96 / design rev2 F3-06).
 *
 * The compose itself goes through the installed `messages.messages.compose`
 * command (container, command bus, guards, events); booting that against a
 * throwaway database is out of scope here and recorded as not covered. The SQL the
 * app owns IS proven: tenant + visibility + conversation + deletedAt + the
 * NULL-inclusive organization scope, ascending order.
 *
 * Skips without `P6_REALDB_URL`. Runner needs `tsx` because Jest's CommonJS
 * transform cannot load the ESM MikroORM packages.
 */
const realUrl = process.env.P6_REALDB_URL
const describeReal = realUrl ? describe : describe.skip

describeReal('internal notes read path against real Postgres', () => {
  it('filters tenant/visibility/conversation/deleted/org in real SQL', () => {
    const runner = path.join(
      process.cwd(),
      'src/modules/communications/__tests__/realdb/internal-notes-runner.mts',
    )
    const tsx = path.join(process.cwd(), 'node_modules/.bin/tsx')
    const output = execFileSync(tsx, [runner], {
      encoding: 'utf8',
      env: { ...process.env, P6_REALDB_URL: realUrl },
      timeout: 180_000,
    })
    expect(output).toContain('PASS listing filters tenant/visibility/conversation/deleted/org and keeps ascending order')
    expect(output).toContain('PASS an organization-less caller sees only tenant-wide notes')
    expect(output).toContain('internal notes realdb: all scenarios passed')
  }, 240_000)
})
