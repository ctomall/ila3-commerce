import { describe, expect, it } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

/**
 * REAL-POSTGRES differential proof for the `outbound-thread-reuse` patch.
 *
 * Runs only when `P6_REALDB_URL` points at the isolated, migrated database for
 * this drill (throwaway pgvector/pg16 container). Without it the suite is
 * skipped, so the normal `yarn jest src/modules/communications` run stays green.
 *
 * The real MikroORM/Postgres work runs in a child ESM process
 * (`__tests__/realdb/outbound-thread-reuse-runner.mjs`) because Jest's CJS
 * runtime cannot require MikroORM's ESM `kysely` dependency. The child:
 *   - inits MikroORM with the installed entity classes against the real DB;
 *   - loads an UNPATCHED temp mirror of `send-as-user.js` for scenario A;
 *   - runs the real managed patch script on a second mirror for scenario B;
 *   - asserts via SQL and prints a `@@P6_RESULT@@` JSON line.
 * This test asserts that structured summary. The shared install is untouched.
 */
const clientUrl = process.env.P6_REALDB_URL

function describeRealDb(name: string, fn: () => void): void {
  if (clientUrl) describe(name, fn)
  else describe.skip(name, fn)
}

describeRealDb('outbound-thread-reuse on real Postgres', () => {
  it('A unpatched creates outbound:<threadId>; B patched reuses the inbound conversation', () => {
    const runner = path.join(
      process.cwd(),
      'src/modules/communications/__tests__/realdb/outbound-thread-reuse-runner.mjs',
    )

    let stdout: string
    try {
      stdout = execFileSync(process.execPath, [runner], {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 120_000,
        env: { ...process.env, P6_REALDB_URL: clientUrl },
      })
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string }
      throw new Error(
        `real-DB runner failed\nstdout:\n${failure.stdout ?? ''}\nstderr:\n${failure.stderr ?? ''}`,
      )
    }

    const line = stdout
      .split('\n')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith('@@P6_RESULT@@'))
    expect(line).toBeTruthy()
    const summary = JSON.parse((line as string).slice('@@P6_RESULT@@'.length)) as {
      ok: boolean
      A: Record<string, unknown>
      B: Record<string, unknown>
    }

    expect(summary.ok).toBe(true)

    // (A) unpatched: a second conversation keyed outbound:<threadId>, a second
    // mapping, and the outbound link points at the NEW conversation.
    expect(summary.A).toMatchObject({
      conversationCount: 2,
      mappingCount: 2,
      parentLinkUnchanged: true,
    })
    expect(summary.A.createdConversationKey).toBe(`outbound:${summary.A.threadId}`)
    expect(summary.A.outboundLinkConversationId).not.toBe(summary.A.parentConversationId)

    // (B) patched: still exactly the seeded inbound conversation and mapping;
    // the outbound link points at the seeded conversation id.
    expect(summary.B).toMatchObject({
      conversationCount: 1,
      mappingCount: 1,
      parentLinkUnchanged: true,
    })
    expect(String(summary.B.conversationKey)).toMatch(/^wa-/)
    expect(summary.B.outboundLinkConversationId).toBe(summary.B.parentConversationId)
  })
})
