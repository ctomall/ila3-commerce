#!/usr/bin/env node
/**
 * Assert that every managed patch in scripts/patches/manifest.json is present.
 *
 * Dependency reinstalls and package upgrades silently drop patches; this exits
 * non-zero so CI (and `yarn patches:verify`) fails loudly instead of shipping a
 * UI that regressed. `--apply` runs the patch scripts first (used by the build).
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const apply = process.argv.includes('--apply')
const manifestPath = path.resolve(process.cwd(), 'scripts/patches/manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const root = process.cwd()

let failures = 0

for (const patch of manifest.patches) {
  const target = path.resolve(root, patch.target)
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
  if (!fs.existsSync(target)) {
    console.error(`[patches] ${patch.id}: target missing (${patch.target})`)
    failures++
    continue
  }
  const source = fs.readFileSync(target, 'utf8')
  if (!source.includes(patch.marker)) {
    console.error(`[patches] ${patch.id}: marker not found in ${patch.target} — patch was lost`)
    failures++
    continue
  }
  console.log(`[patches] ${patch.id}: ok`)
}

if (failures > 0) {
  console.error(`[patches] FAILED: ${failures} patch(es) missing`)
  process.exit(1)
}
console.log(`[patches] all ${manifest.patches.length} patch(es) present`)
