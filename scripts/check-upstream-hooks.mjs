#!/usr/bin/env node
/**
 * Upstream hook readiness.
 *
 * S5 (<=15 patches) is deferred until the package exposes the hooks listed in
 * docs/upstream-hooks-proposal.md. This check answers, at any moment, which of those
 * hooks the installed packages actually provide and therefore which patches can be
 * deleted right now. It only reads files; it never edits the manifest.
 *
 * Exit code: 0 always (informational). Use the printed table to plan the removal.
 */
import fs from 'node:fs'
import path from 'node:path'

const read = (relative) => {
  const file = path.resolve(process.cwd(), relative)
  if (!fs.existsSync(file)) return null
  return fs.readFileSync(file, 'utf8')
}

const HOOKS = [
  {
    id: 'nav.groups / settings.sections',
    unblocks: ['nav-config'],
    probe: () => {
      const overrides = read('node_modules/@open-mercato/shared/dist/modules/overrides.js')
      const chrome = read('node_modules/@open-mercato/core/dist/modules/auth/lib/backendChrome.js')
      const hasOverride = Boolean(overrides && /getNavGroupsOverride|navGroups/.test(overrides))
      const consumes = Boolean(chrome && /getNavGroupsOverride/.test(chrome))
      return {
        ready: hasOverride && consumes,
        evidence: `overrides export: ${hasOverride ? 'yes' : 'no'} · payload consumes it: ${consumes ? 'yes' : 'no'}`,
      }
    },
  },
  {
    id: 'DataTable ariaSort + empty/error state slots',
    unblocks: ['aria-sort', 'empty-state-art', 'empty-state-art-search', 'empty-state-art-default', 'list-error-visual'],
    probe: () => {
      const table = read('node_modules/@open-mercato/ui/dist/backend/DataTable.js')
      if (!table) return { ready: false, evidence: 'DataTable.js not found' }
      // Our own aria-sort patch writes `ariaSort` into this file, so a plain text
      // match would report upstream support that is not there. Presence of the patch
      // marker means the capability is ours; it only counts as upstream once the
      // patch is gone and the text remains.
      const patchedByUs = table.includes('[patched:aria-sort]')
      const hasAriaSortProp = /ariaSort/.test(table) && !patchedByUs
      const emptySpot = /dataTableExtensionSpotId\([^)]*"empty-state"/.test(table)
      return {
        ready: hasAriaSortProp && emptySpot,
        evidence:
          `ariaSort upstream: ${hasAriaSortProp ? 'yes' : 'no'}` +
          `${patchedByUs && !hasAriaSortProp ? ' (currently supplied by our patch)' : ''}` +
          ` · empty-state spot used: ${emptySpot ? 'yes' : 'no'}`,
      }
    },
  },
  {
    id: 'page column definitions externalised',
    unblocks: ['cf-label-companies', 'cf-label-people', 'cf-label-deals', 'column-priority', 'column-priority-deals'],
    probe: () => {
      const meta = read('node_modules/@open-mercato/core/dist/modules/customers/backend/customers/companies/page.meta.js')
      const overrides = read('node_modules/@open-mercato/shared/dist/modules/overrides.js')
      const hasColumnsInMeta = Boolean(meta && /columns\s*:/.test(meta))
      const hasColumnsOverride = Boolean(overrides && /getColumnsOverride|columnOverrides/.test(overrides))
      return {
        ready: hasColumnsInMeta || hasColumnsOverride,
        evidence: `columns in page.meta: ${hasColumnsInMeta ? 'yes' : 'no'} · columns override API: ${hasColumnsOverride ? 'yes' : 'no'}`,
      }
    },
  },
]

let ready = 0
const unblocked = []
for (const hook of HOOKS) {
  let result
  try {
    result = hook.probe()
  } catch (error) {
    result = { ready: false, evidence: `probe failed: ${error.message}` }
  }
  if (result.ready) {
    ready += 1
    unblocked.push(...hook.unblocks)
  }
  console.log(`${result.ready ? 'READY   ' : 'PENDING '} ${hook.id}`)
  console.log(`          evidence: ${result.evidence}`)
  console.log(`          unblocks: ${hook.unblocks.join(', ')}`)
}

console.log(`\n[upstream-hooks] ${ready}/${HOOKS.length} hooks available`)
if (unblocked.length > 0) {
  console.log(`[upstream-hooks] patches removable now: ${Array.from(new Set(unblocked)).join(', ')}`)
} else {
  console.log('[upstream-hooks] no hook is available yet; keep the current baseline (14 manifest entries) and see docs/upstream-hooks-proposal.md')
}
