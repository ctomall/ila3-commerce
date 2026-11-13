#!/usr/bin/env node
/**
 * Evidence-integrity check for the acceptance record.
 *
 * The sign-off and the evidence notes cite files by path (reports, drill JSON, screenshots).
 * A citation that no longer resolves is worse than no citation: an independent reviewer
 * chases a file that does not exist and cannot tell "not recorded" from "recorded and lost".
 *
 * What this proves:
 *   1. every backticked path in the scanned documents resolves to a file in this repo;
 *   2. every cited `verify/verify-*.md` report actually contains its PASS/FAIL verdict line.
 *
 * It does not judge whether the evidence *supports* the claim — that stays a human review.
 *
 * Usage:
 *   node scripts/crm-evidence-links.mjs            # check
 *   node scripts/crm-evidence-links.mjs --list     # print every resolved citation
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(__dirname, '..')
const DOCS = path.join(repo, 'docs/crm-platform')

const SCANNED = [
  'docs/crm-platform/QA-SIGNOFF.md',
  'docs/crm-platform/dsh-integration/EVIDENCE-2026-11-11-REAL.md',
  'docs/crm-platform/dsh-integration/CONCURRENCY.md',
  'docs/crm-platform/leadgen/M6-DISPATCH.md',
]

/** Search bases, most specific first; a bare filename also matches by basename. */
const BASES = [
  DOCS,
  path.join(DOCS, 'dsh-integration'),
  path.join(DOCS, 'dsh-integration/evidence'),
  path.join(DOCS, 'leadgen'),
  path.join(DOCS, 'leadgen/evidence'),
  path.join(DOCS, 'verify'),
  path.join(DOCS, 'poc'),
  path.join(DOCS, 'regression'),
  path.join(DOCS, 'audit'),
  path.join(DOCS, 'appendix'),
]

const PLACEHOLDER = /[*<>…]|\bts\b|YYYY/

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile()
  } catch {
    return false
  }
}

/** Basename index, built once: docs/crm-platform is small enough to walk. */
const byBasename = new Map()
function index(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      index(full)
    } else if (!byBasename.has(entry.name)) {
      byBasename.set(entry.name, full)
    }
  }
}
index(DOCS)

function resolve(ref) {
  if (ref.startsWith('docs/')) {
    const direct = path.join(repo, ref)
    return isFile(direct) ? direct : null
  }
  for (const base of BASES) {
    const candidate = path.join(base, ref)
    if (isFile(candidate)) return candidate
  }
  if (!ref.includes('/')) {
    const found = byBasename.get(path.basename(ref))
    if (found) return found
  }
  return null
}

const missing = []
const resolved = []
for (const rel of SCANNED) {
  const file = path.join(repo, rel)
  if (!isFile(file)) continue
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/`([^`\s]+\.(?:md|json|png))`/g)) {
      const ref = match[1]
      if (PLACEHOLDER.test(ref)) continue
      const target = resolve(ref)
      if (target) {
        resolved.push({ from: rel, line: index + 1, ref, target })
      } else {
        missing.push({ from: rel, line: index + 1, ref })
      }
    }
  })
}

// A cited verification report must carry a verdict; otherwise the citation points at
// a file that does not say pass or fail.
const verdictless = []
for (const entry of resolved) {
  if (!/verify\/verify-[^/]+\.md$/.test(entry.target)) continue
  const body = fs.readFileSync(entry.target, 'utf8')
  if (!/PASS\s+\d+\s+·|发布级门禁：/.test(body)) {
    verdictless.push(entry)
  }
}

const uniqueMissing = [...new Map(missing.map((m) => [`${m.ref}`, m])).values()]
const ok = uniqueMissing.length === 0 && verdictless.length === 0

if (process.argv.includes('--list')) {
  for (const entry of resolved) {
    console.log(`ok   ${entry.from}:${entry.line}  ${entry.ref}`)
  }
}
for (const entry of uniqueMissing) {
  console.log(`MISSING  ${entry.from}:${entry.line}  ${entry.ref}`)
}
for (const entry of verdictless) {
  console.log(`NO-VERDICT  ${entry.from}:${entry.line}  ${entry.ref}`)
}
console.log(`[evidence-links] ${ok ? 'PASS' : 'FAIL'} — ${resolved.length} resolved · ${uniqueMissing.length} missing · ${verdictless.length} without verdict · scanned ${SCANNED.length} documents`)
process.exit(ok ? 0 : 1)
