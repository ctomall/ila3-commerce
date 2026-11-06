#!/usr/bin/env node
/**
 * Validate the sidebar navigation as data, before it ships.
 *
 * The sidebar mixes three sources: page metadata declares entries, the package
 * hardcodes the default group order, and this project patches in a settings
 * merge table. This check reports what is actually wrong with the data, so a
 * broken label or an orphan group shows up here instead of in the sidebar.
 *
 * Usage: node scripts/nav-check.mjs [--json]
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const BASE = process.env.NAV_CHECK_BASE_URL ?? 'http://127.0.0.1:3000'

/**
 * Credentials come from the environment first (NAV_CHECK_EMAIL / NAV_CHECK_PASSWORD)
 * so this check runs in CI; a local credentials file is only a development
 * fallback and its path can be redirected with NAV_CHECK_CREDENTIALS.
 */
function loadCredentials() {
  const email = process.env.NAV_CHECK_EMAIL
  const password = process.env.NAV_CHECK_PASSWORD
  if (email && password) return { email, password }
  const file = process.env.NAV_CHECK_CREDENTIALS ?? '/home/pro/.ila3-admin-credentials'
  if (!fs.existsSync(file)) {
    console.error(`[nav-check] no credentials: set NAV_CHECK_EMAIL/NAV_CHECK_PASSWORD or provide ${file}`)
    process.exit(2)
  }
  const creds = fs.readFileSync(file, 'utf8')
  const line = creds.split('\n').find((l) => l.startsWith('superadmin'))
  if (!line) {
    console.error('[nav-check] credentials file has no superadmin line')
    process.exit(2)
  }
  const [, email2, password2] = line.trim().split(/\s+/)
  return { email: email2, password: password2 }
}

async function login() {
  const { email, password } = loadCredentials()
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }),
  })
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
}

const cookie = await login()
const res = await fetch(`${BASE}/api/auth/admin/nav`, { headers: { cookie } })
if (!res.ok) {
  console.error(`[nav-check] nav API returned ${res.status}`)
  process.exit(1)
}
const payload = await res.json()
const groups = payload.groups ?? []
const settingsSections = payload.settingsSections ?? []
const zh = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/i18n/zh.json'), 'utf8'))

const issues = []
let itemCount = 0

// Main groups use `title`; settings sections use `label`/`labelKey`. A page may
// legitimately appear in both surfaces, so duplicates are only meaningful inside
// one group.
const labelOf = (item) => item.title ?? item.label ?? item.labelKey ?? null

const walk = (items, where, seen = new Set()) => {
  for (const item of items ?? []) {
    itemCount++
    const href = item.href
    if (!href || !href.startsWith('/backend')) issues.push(`${where}: item without a /backend href (${labelOf(item) ?? item.id})`)
    else if (seen.has(href)) issues.push(`${where}: duplicate href ${href}`)
    else seen.add(href)
    if (!labelOf(item)) issues.push(`${where}: item without a label (${href ?? item.id})`)
    walk(item.children, where, seen)
  }
}

for (const group of groups) {
  const label = group.name ?? group.labelKey
  if (!label) issues.push(`group ${group.id}: no label`)
  if (group.labelKey && !(group.labelKey in zh) && !group.name) issues.push(`group ${group.id}: labelKey ${group.labelKey} missing from zh.json`)
  if (!group.items || group.items.length === 0) issues.push(`group ${group.id}: empty group`)
  walk(group.items, `group ${group.id}`)
}
for (const section of settingsSections) walk(section.items, `settings ${section.id}`)

const report = {
  groups: groups.length,
  settingsSections: settingsSections.length,
  items: itemCount,
  duplicateHrefs: issues.filter((i) => i.includes('duplicate href')).length,
  issues,
}
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(`groups            : ${report.groups}`)
  console.log(`settings sections : ${report.settingsSections}`)
  console.log(`items             : ${report.items}`)
  console.log(`duplicate hrefs   : ${report.duplicateHrefs}`)
  console.log(`issues            : ${issues.length}`)
  for (const issue of issues.slice(0, 20)) console.log(`  - ${issue}`)
}
if (issues.length > 0) process.exitCode = 1
