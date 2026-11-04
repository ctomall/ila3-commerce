#!/usr/bin/env node
/**
 * Remove token declarations that nothing references (T10 phase 2).
 *
 * "Dead" is decided from the COMPILED CSS, not from source grep: Tailwind
 * utilities only emit var() after compilation, so a source-only scan overstates
 * the dead set. A token is dead when it is declared in globals.css and never
 * referenced as `var(--token)` anywhere in the built CSS.
 *
 * Safety: run `yarn tokens:dynamic` first. It scans inline styles, setProperty,
 * getComputedStyle and cssText for runtime token usage, which the build output
 * cannot reveal.
 *
 * Usage: node scripts/prune-dead-tokens.mjs [--dry]
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const dry = process.argv.includes('--dry')
const root = process.cwd()
const cssPath = path.join(root, 'src/app/globals.css')
const css = fs.readFileSync(cssPath, 'utf8')

// Declared tokens.
const declared = new Set()
for (const line of css.split('\n')) {
  const m = line.trim().match(/^(--[\w-]+)\s*:/)
  if (m) declared.add(m[1])
}

// Tokens referenced by the compiled CSS.
const referenced = new Set()
const built = execSync("find .mercato/next -name '*.css' -size +1k 2>/dev/null || true", {
  cwd: root,
  encoding: 'utf8',
}).split('\n').filter(Boolean)
for (const file of built) {
  const text = fs.readFileSync(path.join(root, file), 'utf8')
  for (const m of text.matchAll(/var\((--[\w-]+)/g)) referenced.add(m[1])
}

// Tailwind v4 maps these namespaces to utilities (`border-border` ->
// --color-border, `rounded-lg` -> --radius-lg). A token consumed only through
// @apply/utility classes never appears as var() in the built CSS, and deleting
// it fails the build with "Cannot apply unknown utility class". They are
// therefore never pruned.
const THEME_NAMESPACES = /^--(color|radius|font|spacing|shadow|text|leading|tracking|breakpoint|container|ease|animate|blur|perspective|aspect)-/

const dead = [...declared].filter((t) => !referenced.has(t) && !THEME_NAMESPACES.test(t))
if (dead.length === 0) {
  console.log('[prune-tokens] nothing to prune')
  process.exit(0)
}

const deadSet = new Set(dead)
const kept = []
const removed = []
for (const line of css.split('\n')) {
  const m = line.trim().match(/^(--[\w-]+)\s*:/)
  if (m && deadSet.has(m[1])) {
    removed.push(m[1])
    continue
  }
  kept.push(line)
}

console.log(`[prune-tokens] declared=${declared.size} referenced=${referenced.size} dead=${dead.length} removed=${removed.length}`)
console.log(`[prune-tokens] sample: ${removed.slice(0, 10).join(', ')}`)
if (removed.length === 0) {
  console.log('[prune-tokens] everything left is either referenced or a Tailwind theme token')
}
if (!dry) {
  fs.writeFileSync(cssPath, kept.join('\n'))
  console.log('[prune-tokens] globals.css updated')
}
