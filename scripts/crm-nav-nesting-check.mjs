#!/usr/bin/env node
/**
 * Detect entries that should be nested but are sitting at the root.
 *
 * nav.ts builds parent/child by href prefix, but only inside one group. When a page and
 * its would-be parent declare different pageGroupKey values, they end up in two groups
 * that merely share a display name and the nesting never happens. The symptom is a
 * "create" page sitting at the root of a section.
 *
 * This checks the served payload instead of reading source: for every root entry whose
 * parent href also exists in the payload, the entry is suspicious — the parent is there,
 * yet the link is not a child of it.
 *
 * Usage:
 *   node scripts/crm-nav-nesting-check.mjs            # report / refresh the baseline
 *   node scripts/crm-nav-nesting-check.mjs --check    # gate: live must equal the baseline
 *   node scripts/crm-nav-nesting-check.mjs --strict   # gate: refuse ANY orphaned entry
 *
 * `--check` is the gate. A bare report cannot fail, and `--strict` cannot be wired
 * because five stock pages are orphaned upstream — so the five are pinned in
 * `appendix/nav-nesting.json` and this fails when one more appears OR when one of the
 * five is fixed and the baseline is not updated. Either direction is a fact worth
 * knowing; neither should be discovered by reading a log.
 */
import fs from 'node:fs'
import { credentials, loginWithRetry } from './lib/session.mjs'

const BASE = process.env.NAV_BASE_URL ?? 'http://127.0.0.1:3000'
const STRICT = process.argv.includes('--strict')
const CHECK = process.argv.includes('--check')

const cred = credentials().get('superadmin')
const cookie = await loginWithRetry(BASE, cred, { role: 'superadmin' })
const res = await fetch(`${BASE}/api/auth/admin/nav`, { headers: { cookie } })
if (!res.ok) throw new Error(`nav ${res.status}`)
const payload = await res.json()

const byHref = new Map()
const roots = []
for (const group of payload.groups ?? []) {
  for (const item of group.items ?? []) {
    roots.push({ group: group.name, ...item })
    byHref.set(item.href, item)
    for (const child of item.children ?? []) byHref.set(child.href, child)
  }
}

function parentHref(href) {
  const parts = String(href).split('/').filter(Boolean)
  for (let i = parts.length - 1; i >= 2; i -= 1) {
    const candidate = `/${parts.slice(0, i).join('/')}`
    if (byHref.has(candidate)) return candidate
  }
  return null
}

const suspicious = []
for (const item of roots) {
  const parent = parentHref(item.href)
  if (!parent) continue
  const parentItem = byHref.get(parent)
  const isChild = (parentItem.children ?? []).some((child) => child.href === item.href)
  if (!isChild) suspicious.push({ href: item.href, title: item.title, group: item.group, parent })
}

console.log(`[nav-nesting] ${roots.length} root entries examined`)
if (suspicious.length === 0) {
  console.log('[nav-nesting] no entry is orphaned from an existing parent')
} else {
  console.log(`[nav-nesting] ${suspicious.length} entry(ies) have an existing parent but are not nested:`)
  for (const item of suspicious) {
    console.log(`  ${item.href} (${item.title}, group ${item.group}) — parent ${item.parent} exists`)
  }
  console.log('[nav-nesting] cause is usually a parent/child pageGroupKey mismatch; fix belongs upstream')
}

const BASELINE = 'docs/crm-platform/appendix/nav-nesting.json'

if (CHECK) {
  if (!fs.existsSync(BASELINE)) {
    console.log(`[nav-nesting] RESULT: FAIL — 没有基线 ${BASELINE}`)
    process.exit(1)
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  const baseHrefs = new Set((baseline.suspicious ?? []).map((item) => item.href))
  const liveHrefs = new Set(suspicious.map((item) => item.href))
  const added = [...liveHrefs].filter((href) => !baseHrefs.has(href))
  const fixed = [...baseHrefs].filter((href) => !liveHrefs.has(href))
  // Root-entry count drift is informational here: the nav-baseline gate owns entry counts.
  const rootDrift = baseline.roots !== roots.length ? ` （根入口 ${baseline.roots} -> ${roots.length}，由 nav-baseline 门负责）` : ''
  if (added.length === 0 && fixed.length === 0) {
    console.log(`[nav-nesting] RESULT: PASS — ${liveHrefs.size} 条已知未嵌套入口与基线一致${rootDrift}`)
    process.exit(0)
  }
  console.log(`[nav-nesting] RESULT: FAIL — 与基线不一致${rootDrift}`)
  for (const href of added) console.log(`  ✗ 新增未嵌套入口 ${href}`)
  for (const href of fixed) console.log(`  ✗ 基线里这条已修好或消失 ${href}（如果是修好了，请重录基线）`)
  process.exit(1)
}

fs.mkdirSync('docs/crm-platform/appendix', { recursive: true })
fs.writeFileSync(
  BASELINE,
  JSON.stringify({ generatedAt: new Date().toISOString(), roots: roots.length, suspicious }, null, 2) + '\n',
)

// Without --strict this is a report: the known upstream mismatch must not turn the
// whole guard set red. With --strict it is a gate.
process.exit(STRICT && suspicious.length > 0 ? 1 : 0)
