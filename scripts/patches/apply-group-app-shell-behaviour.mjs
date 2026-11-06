#!/usr/bin/env node
/**
 * Grouped patch entry: one manifest line for every change to node_modules/@open-mercato/ui/dist/backend/AppShell.js.
 *
 * These edits share a single target file, so they are applied together and share one
 * idempotency check. Each step stays its own script under scripts/patches; this entry
 * only runs them in order.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const STEPS = [
  "scripts/patches/apply-nav-aria-labels.mjs",
  "scripts/patches/apply-sidebar-active-group.mjs",
  "scripts/patches/apply-settings-sidebar-expanded.mjs",
  "scripts/patches/apply-sidebar-footer-removed.mjs"
]

for (const step of STEPS) {
  const script = path.resolve(process.cwd(), step)
  const child = spawnSync(process.execPath, [script], { stdio: 'inherit' })
  if (child.status !== 0) {
    console.error(`[patch:group] step failed: ${step}`)
    process.exit(child.status ?? 1)
  }
}
