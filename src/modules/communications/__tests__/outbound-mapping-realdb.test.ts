import { describe, expect, it } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

/**
 * REAL-POSTGRES proof for the two outbound-mapping fixes.
 *
 * Runs only when `P6_REALDB_URL` points at the isolated migrated database for
 * this drill; otherwise skipped so the normal jest run stays green. The real
 * MikroORM work runs in `__tests__/realdb/outbound-mapping-runner.mjs` (Jest's
 * CJS runtime cannot require MikroORM's ESM `kysely` dependency).
 *
 * Proves:
 *   A. control (unpatched sendAsUser) splits the reply into a second
 *      `outbound:<threadId>` conversation;
 *   B. v2-patched sendAsUser run twice keeps exactly 1 conversation / 1 mapping,
 *      heals the mapping ref, both outbound links point at the inbound
 *      conversation, and the second run does not throw;
 *   C. unpatched createConnectedChannelRow leaves a tenant channel private;
 *      patched (`tenant-channel-shared`) creates it shared with user_id NULL.
 */
const clientUrl = process.env.P6_REALDB_URL

function describeRealDb(name: string, fn: () => void): void {
  if (clientUrl) describe(name, fn)
  else describe.skip(name, fn)
}

describeRealDb('outbound mapping fixes on real Postgres', () => {
  it('reuses the inbound conversation without a mapping conflict; tenant channels are shared', () => {
    const runner = path.join(
      process.cwd(),
      'src/modules/communications/__tests__/realdb/outbound-mapping-runner.mjs',
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
        `real-DB mapping runner failed\nstdout:\n${failure.stdout ?? ''}\nstderr:\n${failure.stderr ?? ''}`,
      )
    }

    const line = stdout
      .split('\n')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith('@@P6_MAPPING_RESULT@@'))
    expect(line).toBeTruthy()
    const summary = JSON.parse((line as string).slice('@@P6_MAPPING_RESULT@@'.length)) as {
      ok: boolean
      A: Record<string, unknown>
      B: Record<string, unknown>
      C: { unpatched: Record<string, unknown>; patched: Record<string, unknown> }
    }

    expect(summary.ok).toBe(true)

    // A: control reproduces the split (2 conversations / 2 mappings).
    expect(summary.A).toMatchObject({ conversationCount: 2, mappingCount: 2 })
    expect(String(summary.A.createdConversationKey)).toMatch(/^outbound:/)

    // B: two runs on one inbound conversation.
    expect(summary.B).toMatchObject({
      firstRun: { conversationCount: 1, mappingCount: 1, outboundLinks: 1 },
      secondRun: {
        conversationCount: 1,
        mappingCount: 1,
        outboundLinks: 2,
        allOutboundPointAtInbound: true,
        threw: false,
      },
    })
    expect(String((summary.B.firstRun as Record<string, unknown>).mappingRef)).toMatch(/^wa-/)
    expect(String((summary.B.secondRun as Record<string, unknown>).mappingRef)).toMatch(/^wa-/)

    // C: visibility patch.
    expect(summary.C.unpatched.visibility).toBe('private')
    expect(summary.C.patched.visibility).toBe('shared')
    expect(summary.C.patched.userId).toBeNull()
  })
})
