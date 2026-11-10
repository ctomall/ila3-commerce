import { describe, expect, it } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Contract test for the managed dedupe patch.
 *
 * CI runs unit tests BEFORE the build applies managed patches, so this asserts
 * the manifest entry + the patch script's three edits (portable on any checkout)
 * and, when the installed bytes are already patched, that they carry the marker
 * and the lookup. It never mutates node_modules.
 */
describe('dedupe-external-id managed patch', () => {
  const root = process.cwd()

  it('is declared in the managed patch manifest', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/patches/manifest.json'), 'utf8')) as {
      patches: Array<{id: string; target?: string; marker?: string}>
    }
    const entry = manifest.patches.find((patch) => patch.id === 'dedupe-external-message-id')
    expect(entry).toBeTruthy()
    expect(entry?.marker).toBe('/* [patched:dedupe-external-id] */')
    expect(entry?.target).toContain('deliver-outbound-message.js')
  })

  it('the patch script looks up the existing row, reuses it and guards the persist', () => {
    const script = fs.readFileSync(path.join(root, 'scripts/patches/apply-dedupe-external-message-id.mjs'), 'utf8')
    expect(script).toContain('existingExternal?.id ?? randomUUID()')
    expect(script).toContain('if (!existingExternal) em.persist(externalMessage);')
    expect(script).toContain('em.findOne(ExternalMessage')
  })

  it('applies to the installed bytes when they are patched on this checkout', () => {
    const target = path.join(
      root,
      'node_modules/@open-mercato/core/dist/modules/communication_channels/commands/deliver-outbound-message.js',
    )
    const source = fs.readFileSync(target, 'utf8')
    if (!source.includes('[patched:dedupe-external-id]')) return
    expect(source).toMatch(/const existingExternal = await em\.findOne\(ExternalMessage, \{/)
    expect(source).toMatch(/existingExternal\?\.id \?\? randomUUID\(\)/)
  })
})
