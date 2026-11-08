#!/usr/bin/env node
/**
 * Assert that every managed patch in scripts/patches/manifest.json is present.
 *
 * Dependency reinstalls and package upgrades silently drop patches; this exits
 * non-zero so CI (and `yarn patches:verify`) fails loudly instead of shipping a
 * UI that regressed. `--apply` runs the patch scripts first (used by the build).
 *
 * A patch may declare `targets: [...]` instead of a single `target`: one script,
 * several files, one concern (the vendor installer copies 11 built files). The
 * marker is asserted in every listed target, so this narrows the manifest — it
 * does not weaken the check.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const apply = process.argv.includes('--apply')
const manifestPath = path.resolve(process.cwd(), 'scripts/patches/manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const root = process.cwd()

let failures = 0
let targetsChecked = 0

for (const patch of manifest.patches) {
  const targets = Array.isArray(patch.targets) ? patch.targets : patch.target ? [patch.target] : []
  if (targets.length === 0) {
    console.error(`[patches] ${patch.id}: no target(s) declared`)
    failures++
    continue
  }
  if (apply) {
    const result = spawnSync(process.execPath, [patch.script], { cwd: root, encoding: 'utf8' })
    if (result.status !== 0) {
      console.error(`[patches] ${patch.id}: apply failed\n${result.stderr || result.stdout}`)
      failures++
      continue
    }
    const out = (result.stdout || '').trim().split('\n').pop()
    if (out) console.log(`[patches] ${patch.id}: ${out}`)
  }
  let patchFailed = false
  for (const relative of targets) {
    const target = path.resolve(root, relative)
    targetsChecked++
    if (!fs.existsSync(target)) {
      console.error(`[patches] ${patch.id}: target missing (${relative})`)
      patchFailed = true
      continue
    }
    const source = fs.readFileSync(target, 'utf8')
    if (!source.includes(patch.marker)) {
      console.error(`[patches] ${patch.id}: marker not found in ${relative} — patch was lost`)
      patchFailed = true
    }
  }
  if (patchFailed) {
    failures++
    continue
  }
  console.log(`[patches] ${patch.id}: ok${targets.length > 1 ? ` (${targets.length} targets)` : ''}`)
}

if (failures > 0) {
  console.error(`[patches] FAILED: ${failures} patch(es) missing`)
  process.exit(1)
}
console.log(`[patches] all ${manifest.patches.length} patch(es) present across ${targetsChecked} target(s)`)
