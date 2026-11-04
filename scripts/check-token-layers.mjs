#!/usr/bin/env node
/**
 * Enforce the three-layer token model (T10).
 *
 * Layer 1 primitive  — raw scales (--color-blue-600, --space-4). Not for components.
 * Layer 2 semantic   — intent tokens (--background, --border, --muted-foreground…).
 *                      This is the ONLY layer components may consume.
 * Layer 3 component  — private tokens (--table-row-height). Declared next to use.
 *
 * The checker scans app source for `var(--x)` and reports any token outside the
 * semantic allowlist. Report-only by default; `--strict` exits non-zero so CI can
 * gate on it once the baseline reaches zero.
 *
 * Usage: node scripts/check-token-layers.mjs [--strict] [--json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const root = process.cwd()

/** Layer 2: the semantic tokens components are allowed to use. */
const SEMANTIC = new Set([
  '--background', '--foreground', '--border', '--input', '--ring',
  '--card', '--card-foreground', '--popover', '--popover-foreground',
  '--muted', '--muted-foreground', '--accent', '--accent-foreground',
  '--primary', '--primary-foreground', '--secondary', '--secondary-foreground',
  '--destructive', '--destructive-foreground', '--radius',
  '--brand-violet', '--brand-lime', '--text-disabled',
  '--sidebar', '--sidebar-foreground', '--sidebar-border',
])

// globals.css is the token *source* — it defines the layers and legitimately
// references primitives internally. Only consumers (components, modules) are checked.
const files = execSync(
  "grep -rIl --include=*.tsx --include=*.ts --include=*.css 'var(--' src/ || true",
  { cwd: root, encoding: 'utf8' },
).split('\n').filter(Boolean).filter((f) => !f.endsWith('src/app/globals.css'))

const violations = []
const used = new Map()
for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), 'utf8')
  for (const m of text.matchAll(/var\((--[\w-]+)/g)) {
    const token = m[1]
    used.set(token, (used.get(token) ?? 0) + 1)
    if (!SEMANTIC.has(token)) violations.push({ file, token })
  }
}

const byToken = new Map()
for (const v of violations) byToken.set(v.token, (byToken.get(v.token) ?? 0) + 1)
const summary = [...byToken.entries()].sort((a, b) => b[1] - a[1])

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ files: files.length, violations: violations.length, byToken: summary }, null, 2))
} else {
  console.log(`files scanned          : ${files.length}`)
  console.log(`distinct tokens used   : ${used.size}`)
  console.log(`non-semantic usages   : ${violations.length}`)
  if (summary.length) {
    console.log('\nnon-semantic tokens (count, token):')
    for (const [token, count] of summary.slice(0, 15)) console.log(`  ${String(count).padStart(4)}  ${token}`)
  }
}

if (process.argv.includes('--strict') && violations.length > 0) {
  console.error(`\n[token-layers] FAILED: ${violations.length} non-semantic usage(s)`)
  process.exit(1)
}
