#!/usr/bin/env node
/**
 * Report which managed patches are present in the installed node_modules.
 *
 * The manifest is applied before a build and asserted by verify-patches.mjs.
 * This read-only report answers "is this install patched, and does every target
 * still exist after an upgrade?" without modifying anything.
 *
 * Usage: node scripts/patches/status.mjs [--json]
 * Exit: 0 = all targets exist, 1 = a target is missing (install drift), 2 = manifest unreadable.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export function summarize({ manifest, readFile, exists }) {
  const entries = (manifest.patches ?? []).map((patch) => {
    const targets = patch.targets ?? (patch.target ? [patch.target] : [])
    const missing = targets.filter((target) => !exists(target))
    const markerPresent = missing.length === 0 && targets.every((target) => readFile(target).includes(patch.marker))
    return { id: patch.id, marker: patch.marker, targets, missing, markerPresent }
  })
  return {
    total: entries.length,
    applied: entries.filter((entry) => entry.markerPresent).length,
    missingTargets: entries.filter((entry) => entry.missing.length > 0),
    entries,
  }
}

export function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json')
  const manifestPath = path.join(ROOT, 'scripts', 'patches', 'manifest.json')
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    console.error(`patch-status: cannot read manifest: ${error.message}`)
    return 2
  }
  const summary = summarize({
    manifest,
    exists: (relative) => fs.existsSync(path.join(ROOT, relative)),
    readFile: (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8'),
  })
  if (json) {
    console.log(JSON.stringify(summary, null, 2))
    return summary.missingTargets.length ? 1 : 0
  }
  console.log(`patch-status: ${summary.applied}/${summary.total} applied, ${summary.missingTargets.length} with missing targets`)
  for (const entry of summary.entries) {
    const state = entry.missing.length ? `MISSING ${entry.missing.length} target(s)` : entry.markerPresent ? 'applied' : 'not applied'
    console.log(`  ${entry.id}: ${state}`)
  }
  return summary.missingTargets.length ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}
