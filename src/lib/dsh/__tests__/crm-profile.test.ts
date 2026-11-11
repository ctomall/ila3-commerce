import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from '@jest/globals'

const patch = readFileSync(join(process.cwd(), 'vendor/dsh/crm-profile.patch.yml'), 'utf8')

describe('CRM DSH profile remains tool-minimal', () => {
  it('keeps the CRM MCP overlay', () => {
    expect(patch).toContain('id: mcp-crm')
    expect(patch).toContain('OM_DSH_TOOL_TOKEN')
  })

  it('disables every host-level capability the SDK profile would mount', () => {
    for (const id of ['persistent-bash', 'persistent-pwsh', 'tool-working-directory', 'rea-mcp']) {
      expect(patch).toContain(`- id: ${id}\n  disabled: true`)
    }
    expect(patch).toContain('- id: tool-fs')
    for (const line of ['read: false', 'readImage: false', 'write: false', 'edit: false', 'applyPatch: false']) {
      expect(patch).toContain(line)
    }
  })
})
