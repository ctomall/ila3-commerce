#!/usr/bin/env node
/**
 * Freeze the navigation an employee actually receives, as an M1 baseline artifact.
 *
 * The nav is not a static list: page metadata -> payload builder -> patched dist ->
 * AppShell filters (pageContext, settings prefix, empty groups), and `visible(ctx)`
 * predicates can hide an entry per tenant. A static grep therefore cannot be the
 * acceptance baseline — this script records the server payload per role instead.
 *
 * Credentials come from /home/pro/.ila3-admin-credentials (mode 600), never printed.
 * Read-only: one login POST and one GET per role.
 *
 * Usage:
 *   node scripts/crm-nav-baseline.mjs            # record / refresh the snapshots
 *   node scripts/crm-nav-baseline.mjs --check    # compare live nav with the frozen baseline
 *
 * `--check` is the gate. Before it existed, this script was wired into the guard set
 * with the description "入口数不变、重名 0" while it only ever recorded: it could not
 * fail on either, so the M1 acceptance criterion was unenforced. `crm-nav-baseline`
 * stays the recorder; `--check` turns the recorded baseline into an assertion.
 */
import fs from 'node:fs'
import path from 'node:path'
import { credentials, loginWithRetry } from './lib/session.mjs'

const BASE = process.env.NAV_BASE_URL ?? 'http://127.0.0.1:3000'
const outFlag = process.argv.indexOf('--out')
const OUT = path.resolve(outFlag === -1 ? 'docs/crm-platform/appendix' : process.argv[outFlag + 1])
const ROLES = ['superadmin', 'admin', 'employee']
const CHECK = process.argv.includes('--check')

/** Drop the inline SVG payload: it is ~90% of the response and says nothing about entries. */
function slim(value) {
  if (Array.isArray(value)) return value.map(slim)
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const [k, v] of Object.entries(value)) {
    if (k === 'iconMarkup' || k === 'icon' || k === 'brand') continue
    out[k] = slim(v)
  }
  return out
}

function countItems(items) {
  let total = 0
  for (const item of items ?? []) total += 1 + countItems(item.children)
  return total
}

/**
 * `label@href` per entry, recursively. Main nav items carry `title`; settings items
 * carry `label` and no `title`, so keying only on `title` collapsed every settings
 * entry into one empty name and reported a fake 60-way duplicate.
 */
function entryKeys(items, out = []) {
  for (const item of items ?? []) {
    const label = item.title ?? item.label ?? ''
    out.push(`${label}@${item.href ?? item.id ?? ''}`)
    entryKeys(item.children, out)
  }
  return out
}

/** Entries that render the same label twice in one surface (the M1 "重名 0" rule). */
function duplicateTitles(items) {
  const seen = new Map()
  for (const key of entryKeys(items)) {
    const title = key.split('@')[0]
    if (title === '') continue
    seen.set(title, (seen.get(title) ?? 0) + 1)
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([title, n]) => `${title} ×${n}`)
}

function surfaceFacts(payload) {
  const countGroupItems = (groups) => (groups ?? []).reduce((sum, group) => sum + countItems(group.items), 0)
  return {
    groups: payload.groups?.length ?? 0,
    mainItems: countGroupItems(payload.groups),
    settingsSections: payload.settingsSections?.length ?? 0,
    settingsItems: countGroupItems(payload.settingsSections),
    grantedFeatures: payload.grantedFeatures?.length ?? 0,
    mainKeys: entryKeys((payload.groups ?? []).flatMap((g) => g.items ?? [])).sort(),
    settingsKeys: entryKeys((payload.settingsSections ?? []).flatMap((s) => s.items ?? [])).sort(),
    duplicateMain: duplicateTitles((payload.groups ?? []).flatMap((g) => g.items ?? [])),
    duplicateSettings: duplicateTitles((payload.settingsSections ?? []).flatMap((s) => s.items ?? [])),
  }
}

const drift = []
function compare(role, live, baseline) {
  const base = surfaceFacts(baseline)
  for (const field of ['groups', 'mainItems', 'settingsSections', 'settingsItems', 'grantedFeatures']) {
    if (live[field] !== base[field]) {
      drift.push(`${role}.${field}: 基线 ${base[field]} → 现在 ${live[field]}`)
    }
  }
  for (const [surface, keys, baseKeys] of [
    ['主导航', live.mainKeys, base.mainKeys],
    ['设置', live.settingsKeys, base.settingsKeys],
  ]) {
    const added = keys.filter((k) => !baseKeys.includes(k))
    const removed = baseKeys.filter((k) => !keys.includes(k))
    for (const k of added) drift.push(`${role}.${surface}: 新增入口 ${k}`)
    for (const k of removed) drift.push(`${role}.${surface}: 消失入口 ${k}`)
  }
  for (const [surface, dups] of [
    ['主导航', live.duplicateMain],
    ['设置', live.duplicateSettings],
  ]) {
    for (const dup of dups) drift.push(`${role}.${surface}: 重名 ${dup}`)
  }
}

if (!CHECK) fs.mkdirSync(OUT, { recursive: true })
const creds = credentials()
const summary = []
let missingBaseline = 0

for (const role of ROLES) {
  const cred = creds.get(role)
  if (!cred) {
    // A silently skipped role turns the gate green without comparing anything.
    if (CHECK) drift.push(`${role}: 没有凭证，无法比对`)
    console.log(`[nav] ${role}: no credentials, skipped`)
    continue
  }
  const cookie = await loginWithRetry(BASE, cred, { role })
  const res = await fetch(`${BASE}/api/auth/admin/nav`, { headers: { cookie } })
  if (!res.ok) throw new Error(`nav failed for ${role}: ${res.status}`)
  const payload = await res.json()
  const trimmed = slim(payload)
  const file = path.join(OUT, `nav-${role}.json`)
  const facts = surfaceFacts(trimmed)

  if (CHECK) {
    if (!fs.existsSync(file)) {
      missingBaseline += 1
      drift.push(`${role}: 没有基线文件 ${path.relative(process.cwd(), file)}`)
      continue
    }
    const baseline = JSON.parse(fs.readFileSync(file, 'utf8'))
    compare(role, facts, baseline)
    summary.push({ role, file: path.relative(process.cwd(), file), ...facts })
    console.log(`[nav] ${role}: 基线比对 ${facts.mainItems} main / ${facts.settingsItems} settings / ${facts.grantedFeatures} features`)
    continue
  }

  fs.writeFileSync(file, JSON.stringify(trimmed, null, 2) + '\n')
  summary.push({
    role,
    file: path.relative(process.cwd(), file),
    groups: facts.groups,
    mainItems: facts.mainItems,
    settingsSections: facts.settingsSections,
    settingsItems: facts.settingsItems,
    grantedFeatures: facts.grantedFeatures,
    roles: trimmed.roles ?? [],
  })
  console.log(`[nav] ${role}: ${facts.groups} groups, ${facts.mainItems} main items, ${facts.settingsItems} settings items, ${facts.grantedFeatures} features -> ${summary.at(-1).file}`)
}

if (CHECK) {
  console.log('')
  if (drift.length === 0 && missingBaseline === 0) {
    console.log(`[nav] RESULT: PASS — ${summary.length} 个角色的入口与冻结基线一致，重名 0`)
    process.exit(0)
  }
  console.log(`[nav] RESULT: FAIL — 与基线有 ${drift.length} 处差异`)
  for (const line of drift) console.log(`  ✗ ${line}`)
  console.log('')
  console.log('  如果这是有意的导航改动：node scripts/crm-nav-baseline.mjs（重录基线）后提交 appendix/nav-*.json。')
  process.exit(1)
}

fs.writeFileSync(path.join(OUT, 'nav-summary.json'), JSON.stringify(summary.map(({ role, file, groups, mainItems, settingsSections, settingsItems, grantedFeatures }) => ({ role, file, groups, mainItems, settingsSections, settingsItems, grantedFeatures })), null, 2) + '\n')
console.log(`[nav] wrote ${summary.length} snapshot(s) to ${path.relative(process.cwd(), OUT)}`)
for (const row of summary) console.log(`  ${row.role.padEnd(10)} main=${String(row.mainItems).padStart(3)} settings=${String(row.settingsItems).padStart(2)} features=${String(row.grantedFeatures).padStart(3)}`)
