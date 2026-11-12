import { describe, expect, it } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

/**
 * S100: the preflight script's typecheck attribution is the thing that stops this
 * slice from being blamed for another agent's in-flight code. It only runs when the
 * repository is already broken, so it is exercised here through its self-check mode
 * (no gates are run, nothing is written).
 */
describe('communications preflight attribution', () => {
  it('splits owned vs foreign diagnostics and tolerates empty input', () => {
    const script = path.join(process.cwd(), 'scripts/communications-preflight.mjs')
    const output = execFileSync(process.execPath, [script, '--check-attribution'], {
      encoding: 'utf8',
      timeout: 60_000,
    })
    expect(output).toContain('attribution self-check PASS (owned=2 foreign=2)')
    expect(output).toContain('empty-input self-check PASS')
  })

  it('is exposed as the preflight:communications npm script', () => {
    const pkg = JSON.parse(
      execFileSync(process.execPath, ['-e', "process.stdout.write(require('fs').readFileSync('package.json','utf8'))"], {
        encoding: 'utf8',
      }),
    ) as { scripts?: Record<string, string> }
    expect(pkg.scripts?.['preflight:communications']).toBe('node scripts/communications-preflight.mjs')
  })
})
