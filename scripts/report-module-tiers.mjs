#!/usr/bin/env node
/**
 * Report what each module tier actually enables.
 *
 * Reads the module ids out of src/modules.ts (the source of truth), applies the
 * tier rules, and prints the enabled/disabled split plus the approximate
 * dictionary weight contributed by the extension modules.
 *
 * Usage: node scripts/report-module-tiers.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { moduleTierOf, MODULE_TIERS, tierIncludes } from '../src/lib/module-tiers.ts'

const source = fs.readFileSync(path.resolve(process.cwd(), 'src/modules.ts'), 'utf8')
const ids = [...new Set([...source.matchAll(/\{\s*id:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]))].sort()

const zh = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/i18n/zh.json'), 'utf8'))
const byNamespace = new Map()
for (const key of Object.keys(zh)) {
  const ns = key.split('.')[0]
  byNamespace.set(ns, (byNamespace.get(ns) ?? 0) + 1)
}

const rows = MODULE_TIERS.map((tier) => {
  const enabled = ids.filter((id) => tierIncludes(tier, id))
  const disabled = ids.filter((id) => !tierIncludes(tier, id))
  // Approximate dictionary weight of the disabled modules by namespace prefix.
  const droppedKeys = disabled.reduce((sum, id) => sum + (byNamespace.get(id) ?? 0), 0)
  return { tier, enabled: enabled.length, disabled: disabled.length, droppedKeys, disabledIds: disabled }
})

console.log(`modules in src/modules.ts: ${ids.length}\n`)
for (const row of rows) {
  console.log(
    `${row.tier.padEnd(10)} enabled=${String(row.enabled).padStart(3)}  disabled=${String(row.disabled).padStart(3)}  approx_dropped_zh_keys=${row.droppedKeys}`,
  )
}
const extension = ids.filter((id) => moduleTierOf(id) === 'extension')
console.log(`\nextension modules (${extension.length}): ${extension.join(', ')}`)
