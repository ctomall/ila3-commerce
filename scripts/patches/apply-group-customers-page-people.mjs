#!/usr/bin/env node
/**
 * Grouped patch entry: one manifest line for every change to node_modules/@open-mercato/core/dist/modules/customers/backend/customers/people/page.js.
 *
 * These edits share a single target file, so they are applied together and share one
 * idempotency check. Each step stays its own script under scripts/patches; this entry
 * only runs them in order.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const STEPS = [
  "scripts/patches/apply-custom-field-cell-labels.mjs",
  "scripts/patches/apply-list-load-error.mjs"
]

for (const step of STEPS) {
  const script = path.resolve(process.cwd(), step)
  const child = spawnSync(process.execPath, [script], { stdio: 'inherit' })
  if (child.status !== 0) {
    console.error(`[patch:group] step failed: ${step}`)
    process.exit(child.status ?? 1)
  }
}
