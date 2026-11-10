import { describe, expect, it } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Contract test for the managed dedupe patch: a provider that returns an id we
 * already stored must complete the delivery, not fail the job and re-send.
 */
describe('dedupe-external-id managed patch', () => {
  const target = path.resolve(
    process.cwd(),
    'node_modules/@open-mercato/core/dist/modules/communication_channels/commands/deliver-outbound-message.js',
  )

  it('looks up an existing external message before inserting', () => {
    const source = fs.readFileSync(target, 'utf8')
    expect(source).toContain('[patched:dedupe-external-id]')
    expect(source).toMatch(/const existingExternal = await em\.findOne\(ExternalMessage, \{/)
    expect(source).toMatch(/existingExternal\?\.id \?\? randomUUID\(\)/)
    expect(source).toMatch(/if \(!existingExternal\) em\.persist\(externalMessage\)/)
  })
})
