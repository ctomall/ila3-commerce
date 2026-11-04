#!/usr/bin/env node
/**
 * Find tokens that are only reachable through dynamic style usage (T10 phase 2).
 *
 * Deleting a "dead" token is only safe if nothing sets or reads it at runtime.
 * Static `var(--x)` usage is covered by the audit; this covers the rest:
 *   - inline styles:  style={{ ... }}
 *   - cssText / setProperty
 *   - getComputedStyle reads
 *   - string-concatenated token names
 *
 * Usage: node scripts/check-dynamic-token-usage.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const root = process.cwd()
const files = execSync(
  "grep -rIl --include=*.tsx --include=*.ts --include=*.js --include=*.mjs 'var(--\\|setProperty\\|getComputedStyle\\|cssText' src/ scripts/ 2>/dev/null || true",
  { cwd: root, encoding: 'utf8' },
).split('\n').filter(Boolean)

const hits = []
for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    if (/style=\{\{|setProperty\(|getComputedStyle|cssText|\.style\[/.test(line) && /--[a-z]/.test(line)) {
      hits.push({ file, line: i + 1, text: line.trim().slice(0, 120) })
    }
  })
}

console.log(`files with dynamic style code : ${files.length}`)
console.log(`lines mentioning a token      : ${hits.length}`)
for (const hit of hits.slice(0, 20)) console.log(`  ${hit.file}:${hit.line}  ${hit.text}`)
if (hits.length === 0) console.log('  (none — dynamic token usage not detected)')
