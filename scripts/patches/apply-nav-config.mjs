#!/usr/bin/env node
/**
 * Managed patch: apply the repository's navigation configuration in one step.
 *
 * Two capabilities used to be registered as separate patches even though both exist
 * only to feed the shell's payload builder from src/nav:
 *   - settings-sections.json  -> merge module settings partitions into 8 sections
 *   - nav-groups.json         -> collapse page groups into the sidebar sections
 *
 * They are one concern (navigation configuration), so this entry runs both steps and
 * the manifest carries a single line. The individual steps stay on disk as the
 * implementation detail they are, and both keep their own markers so a partial
 * application is still detectable.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs through the nav-groups marker.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const STEPS = ['apply-settings-groups.mjs', 'apply-nav-groups.mjs', 'apply-nav-logic.mjs']

for (const step of STEPS) {
  const script = path.resolve(process.cwd(), 'scripts/patches', step)
  const child = spawnSync(process.execPath, [script], { stdio: 'inherit' })
  if (child.status !== 0) {
    console.error(`[patch:nav-config] step failed: ${step}`)
    process.exit(child.status ?? 1)
  }
}
console.log('[patch:nav-config] navigation configuration applied')
