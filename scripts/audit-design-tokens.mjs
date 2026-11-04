#!/usr/bin/env node
/**
 * Audit the CSS custom properties in src/app/globals.css.
 *
 * T10 (three-layer tokens) is a refactor of a 1,155-line stylesheet with 472
 * variables. Before moving anything this reports what actually exists:
 *   - tokens declared per block (:root vs .dark)
 *   - tokens referenced from app source (`var(--x)`)
 *   - dead tokens (declared, never referenced) and dangling references
 *
 * Usage: node scripts/audit-design-tokens.mjs [--json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const root = process.cwd()
const cssPath = path.join(root, 'src/app/globals.css')
const css = fs.readFileSync(cssPath, 'utf8')

/** Split the stylesheet into top-level blocks and record which block declares what. */
const declared = new Map() // token -> Set(block selector)
let currentBlock = '(root)'
for (const rawLine of css.split('\n')) {
  const line = rawLine.trim()
  const blockMatch = line.match(/^([.#:][\w\-.:[\]="'> ]+)\s*\{$/)
  if (blockMatch) currentBlock = blockMatch[1].trim()
  else if (line === '}') currentBlock = '(root)'
  const decl = line.match(/^(--[\w-]+)\s*:/)
  if (decl) {
    const token = decl[1]
    if (!declared.has(token)) declared.set(token, new Set())
    declared.get(token).add(currentBlock)
  }
}

const darkTokens = new Set(
  [...declared.entries()].filter(([, blocks]) => [...blocks].some((b) => b.includes('dark'))).map(([t]) => t),
)

/** References from app source (node_modules tokens belong to packages, not us). */
const refs = new Map() // token -> count
const files = execSync(
  "grep -rIl --include=*.tsx --include=*.ts --include=*.css 'var(--' src/ || true",
  { cwd: root, encoding: 'utf8' },
)
  .split('\n')
  .filter(Boolean)
for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), 'utf8')
  for (const m of text.matchAll(/var\((--[\w-]+)/g)) {
    refs.set(m[1], (refs.get(m[1]) ?? 0) + 1)
  }
}

const declaredTokens = [...declared.keys()]
const dead = declaredTokens.filter((t) => !refs.has(t)).sort()
const dangling = [...refs.keys()].filter((t) => !declared.has(t)).sort()
const top = [...refs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)

// Authoritative usage: the compiled CSS shows every real consumer, including
// Tailwind utilities that never appear as a literal var() in our source.
const builtUsage = new Map()
for (const cssFile of execSync("find .mercato/next -name '*.css' -size +1k 2>/dev/null || true", { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)) {
  const text = fs.readFileSync(path.join(root, cssFile), 'utf8')
  for (const m of text.matchAll(/var\((--[\w-]+)/g)) {
    builtUsage.set(m[1], (builtUsage.get(m[1]) ?? 0) + 1)
  }
}
const trulyDead = declaredTokens.filter((t) => !builtUsage.has(t)).sort()

const report = {
  cssLines: css.split('\n').length,
  tokensDeclared: declaredTokens.length,
  tokensWithDarkOverride: darkTokens.size,
  tokensReferenced: refs.size,
  deadTokens: dead.length,
  deadBySourceOnly: dead.length,
  deadInBuiltCss: trulyDead.length,
  builtTokensReferenced: builtUsage.size,
  danglingReferences: dangling.length,
  topReferenced: top,
  deadSample: trulyDead.slice(0, 20),
  danglingSample: dangling.slice(0, 20),
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(`globals.css lines        : ${report.cssLines}`)
  console.log(`tokens declared          : ${report.tokensDeclared}`)
  console.log(`  with .dark override    : ${report.tokensWithDarkOverride}`)
  console.log(`tokens referenced in src : ${report.tokensReferenced}`)
  console.log(`dead tokens (src-only)   : ${report.deadBySourceOnly}`)
  console.log(`dead tokens (built CSS)  : ${report.deadInBuiltCss}  <- authoritative`)
  console.log(`dangling refs (undefined): ${report.danglingReferences}`)
  console.log('\ntop referenced:')
  for (const [token, count] of report.topReferenced) console.log(`  ${String(count).padStart(4)}  ${token}`)
  if (report.deadSample.length) console.log('\ndead sample: ' + report.deadSample.join(', '))
  if (report.danglingSample.length) console.log('dangling sample: ' + report.danglingSample.join(', '))
}
