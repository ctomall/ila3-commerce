#!/usr/bin/env node
/**
 * Merge model-configuration Chinese strings into apps/mercato/src/i18n/zh.json.
 * Idempotent: existing keys are overwritten from the source file.
 *
 * Usage: node scripts/merge-ai-model-zh.mjs [--root /path/to/app] [--dry-run]
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const rootIndex = args.indexOf('--root')
const appRoot = resolve(rootIndex >= 0 ? args[rootIndex + 1] ?? process.cwd() : process.cwd())
const dryRun = args.includes('--dry-run')

const sourcePath = join(here, '..', 'i18n', 'models.zh.json')
const targetPath = join(appRoot, 'src', 'i18n', 'zh.json')

const additions = JSON.parse(readFileSync(sourcePath, 'utf8'))
const target = JSON.parse(readFileSync(targetPath, 'utf8'))

let added = 0
let updated = 0
for (const [key, value] of Object.entries(additions)) {
  if (!(key in target)) added += 1
  else if (target[key] !== value) updated += 1
  target[key] = value
}

console.log(`zh.json: ${added} new, ${updated} updated, ${Object.keys(additions).length} total supplied`)
if (!dryRun) {
  if (!existsSync(`${targetPath}.models.bak`)) copyFileSync(targetPath, `${targetPath}.models.bak`)
  writeFileSync(targetPath, `${JSON.stringify(target, null, 2)}\n`)
  console.log('zh.json written')
}
