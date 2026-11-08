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
 * Usage: node scripts/crm-nav-baseline.mjs [--out docs/crm-platform/appendix]
 */
import fs from 'node:fs'
import path from 'node:path'
import { credentials, loginWithRetry } from './lib/session.mjs'

const BASE = process.env.NAV_BASE_URL ?? 'http://127.0.0.1:3000'
const outFlag = process.argv.indexOf('--out')
const OUT = path.resolve(outFlag === -1 ? 'docs/crm-platform/appendix' : process.argv[outFlag + 1])
const ROLES = ['superadmin', 'admin', 'employee']

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

fs.mkdirSync(OUT, { recursive: true })
const creds = credentials()
const summary = []

for (const role of ROLES) {
  const cred = creds.get(role)
  if (!cred) {
    console.log(`[nav] ${role}: no credentials, skipped`)
    continue
  }
  const cookie = await loginWithRetry(BASE, cred, { role })
  const res = await fetch(`${BASE}/api/auth/admin/nav`, { headers: { cookie } })
  if (!res.ok) throw new Error(`nav failed for ${role}: ${res.status}`)
  const payload = await res.json()
  const trimmed = slim(payload)
  const file = path.join(OUT, `nav-${role}.json`)
  fs.writeFileSync(file, JSON.stringify(trimmed, null, 2) + '\n')

  const countGroupItems = (groups) => (groups ?? []).reduce((sum, group) => sum + countItems(group.items), 0)
  const mainItems = countGroupItems(trimmed.groups)
  const settingsItems = countGroupItems(trimmed.settingsSections)
  summary.push({
    role,
    file: path.relative(process.cwd(), file),
    groups: trimmed.groups?.length ?? 0,
    mainItems,
    settingsSections: trimmed.settingsSections?.length ?? 0,
    settingsItems,
    grantedFeatures: trimmed.grantedFeatures?.length ?? 0,
    roles: trimmed.roles ?? [],
  })
  console.log(`[nav] ${role}: ${trimmed.groups?.length ?? 0} groups, ${mainItems} main items, ${settingsItems} settings items, ${trimmed.grantedFeatures?.length ?? 0} features -> ${summary.at(-1).file}`)
}

fs.writeFileSync(path.join(OUT, 'nav-summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(`[nav] wrote ${summary.length} snapshot(s) to ${path.relative(process.cwd(), OUT)}`)
for (const row of summary) console.log(`  ${row.role.padEnd(10)} main=${String(row.mainItems).padStart(3)} settings=${String(row.settingsItems).padStart(2)} features=${String(row.grantedFeatures).padStart(3)}`)
