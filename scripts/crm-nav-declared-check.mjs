#!/usr/bin/env node
/**
 * Live gate for the declared CRM navigation (catalogue v2).
 *
 * It logs in with the real admin/employee accounts and asserts the contract the
 * module-declaration redesign made:
 *
 *   - the shell receives no group/section rails; the app catalogue is version 2;
 *   - daily groups/items come only from the authorized payload;
 *   - settings/profile entries never leak into the daily rail;
 *   - every authorized href is accounted for exactly once across daily,
 *     management, account and in-page actions;
 *   - the app-level group ids match src/nav/nav-groups.json;
 *   - no group is unconfigured, unknown or duplicated;
 *   - group landings and every daily destination answer;
 *   - the employee account cannot open admin-only APIs.
 *
 * Credentials are read from ~/.ila3-admin-credentials (0600) and never printed.
 *
 * Usage:
 *   node scripts/crm-nav-declared-check.mjs --base http://127.0.0.1:3100 \
 *     --out /storage/artifacts/pro/crm-declared-navigation-goal/check.json --strict
 */
import fs from 'node:fs'
import path from 'node:path'
import { credentials, loginWithRetry } from './lib/session.mjs'

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}
const BASE = arg('--base', process.env.CRM_NAV_BASE_URL ?? 'http://127.0.0.1:3000')
const OUT = arg('--out', null)
const STRICT = process.argv.includes('--strict')
const ROLES = (arg('--roles', 'admin,employee')).split(',').filter(Boolean)
const CATALOG_PATH = path.resolve(process.cwd(), 'src/nav/nav-groups.json')

const issues = []
const push = (role, message) => issues.push(`${role}: ${message}`)

function itemHrefs(items, out = []) {
  for (const item of items ?? []) {
    if (item?.href) out.push(item.href)
    itemHrefs(item?.children, out)
  }
  return out
}

function payloadHrefs(payload) {
  const all = []
  const settings = []
  const profile = []
  const walk = (items, target) => {
    for (const item of items ?? []) {
      if (item?.href) {
        target.push(item.href)
        all.push(item.href)
      }
      walk(item?.children, target)
    }
  }
  for (const group of payload.groups ?? []) {
    for (const item of group.items ?? []) {
      if (item?.href) all.push(item.href)
      if (item?.pageContext === 'settings' || item?.pageContext === 'admin') settings.push(item.href)
      if (item?.pageContext === 'profile') profile.push(item.href)
      walk(item?.children, all)
    }
  }
  for (const section of payload.settingsSections ?? []) walk(section.items, settings)
  for (const section of payload.profileSections ?? []) walk(section.items, profile)
  // Vendor settings pages can miss pageContext; the product path rule is part of
  // the classification contract, so the gate must test the same rule.
  for (const href of all) {
    if (href.startsWith('/backend/config/') || href.endsWith('/settings')) settings.push(href)
  }
  return { all, settings: [...new Set(settings)], profile }
}

async function statusOf(url, cookie) {
  try {
    const res = await fetch(`${BASE}${url}`, { headers: { cookie }, redirect: 'manual' })
    return res.status
  } catch (error) {
    return `ERR ${error instanceof Error ? error.message : String(error)}`
  }
}

const sourceCatalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'))
const expectedGroups = sourceCatalog.map((group) => group.id)
const creds = credentials()
const report = { generatedAt: new Date().toISOString(), base: BASE, expectedGroups, roles: {} }
const generatedCatalogPath = path.resolve(
  process.cwd(),
  'node_modules/@open-mercato/core/dist/modules/auth/lib/nav-groups.generated.json',
)
if (!fs.existsSync(generatedCatalogPath)) {
  issues.push('global: vendor nav-groups.generated.json is missing — run yarn patches:apply')
} else {
  const generated = JSON.parse(fs.readFileSync(generatedCatalogPath, 'utf8'))
  if (JSON.stringify(sourceCatalog) !== JSON.stringify(generated)) {
    issues.push('global: vendor nav-groups.generated.json differs from src/nav/nav-groups.json — run yarn patches:apply')
  }
}

for (const role of ROLES) {
  if (!creds.has(role)) {
    push(role, 'credentials missing for role')
    continue
  }
  let cookie
  try {
    cookie = await loginWithRetry(BASE, creds.get(role), { role })
  } catch (error) {
    push(role, `login failed: ${error instanceof Error ? error.message : String(error)}`)
    continue
  }

  const unauth = await fetch(`${BASE}/api/crm_navigation/navigation`, { redirect: 'manual' })
  if (unauth.status !== 401) push(role, `unauthenticated catalogue returned ${unauth.status}, expected 401`)

  const navRes = await fetch(`${BASE}/api/auth/admin/nav`, { headers: { cookie }, redirect: 'manual' })
  if (!navRes.ok) {
    push(role, `upstream nav returned ${navRes.status}`)
    continue
  }
  const nav = await navRes.json()

  const crmRes = await fetch(`${BASE}/api/crm_navigation/navigation`, { headers: { cookie }, redirect: 'manual' })
  if (!crmRes.ok) {
    push(role, `catalogue returned ${crmRes.status}`)
    continue
  }
  const body = await crmRes.json()
  const crm = body.crm
  if (!crm) {
    push(role, 'payload has no crm catalogue')
    continue
  }
  if (crm.version !== 2) push(role, `catalogue version ${crm.version}, expected 2`)
  if ((body.groups ?? []).length !== 0) push(role, `shell still has ${body.groups.length} group(s)`)
  if ((body.settingsSections ?? []).length !== 0) push(role, `shell still has ${body.settingsSections.length} settings section(s)`)
  if ((body.profileSections ?? []).length !== 0) push(role, `shell still has ${body.profileSections.length} profile section(s)`)

  const dailyHrefs = itemHrefs((crm.groups ?? []).flatMap((group) => group.items))
  const manageHrefs = itemHrefs((crm.manage?.categories ?? []).flatMap((category) => category.items))
  const personalHrefs = itemHrefs(crm.personal?.items)
  const actionHrefs = Array.isArray(crm.actions) ? crm.actions : []
  const rendered = [...dailyHrefs, ...manageHrefs, ...personalHrefs, ...actionHrefs]
  const renderedSet = new Set(rendered)
  if (renderedSet.size !== rendered.length) {
    const repeats = rendered.filter((href, index) => rendered.indexOf(href) !== index)
    push(role, `rendered hrefs repeat: ${[...new Set(repeats)].join(', ')}`)
  }

  const authorized = new Set(crm.authorized ?? [])
  const upstream = payloadHrefs(nav)
  const upstreamAll = new Set(upstream.all)
  if (authorized.size !== upstreamAll.size) {
    push(role, `authorized set ${authorized.size} != upstream unique ${upstreamAll.size}`)
  }
  for (const href of authorized) {
    if (!upstreamAll.has(href)) push(role, `catalogue authorized href not in upstream payload: ${href}`)
    if (!renderedSet.has(href)) push(role, `authorized href has no rendered home or action: ${href}`)
  }
  for (const href of rendered) {
    if (!authorized.has(href)) push(role, `rendered href not authorized: ${href}`)
    if (!href.startsWith('/backend')) push(role, `rendered href is not /backend: ${href}`)
  }

  const settingsSet = new Set(upstream.settings)
  const profileSet = new Set(upstream.profile)
  for (const href of dailyHrefs) {
    if (settingsSet.has(href)) push(role, `settings page leaked into daily rail: ${href}`)
    if (profileSet.has(href)) push(role, `profile page leaked into daily rail: ${href}`)
  }

  if ((crm.unknown ?? []).length > 0) push(role, `unknown owners: ${crm.unknown.join(', ')}`)
  if ((crm.unconfiguredGroups ?? []).length > 0) push(role, `unconfigured groups: ${crm.unconfiguredGroups.join(', ')}`)
  if ((crm.duplicates ?? []).length > 0) push(role, `duplicate daily hrefs: ${crm.duplicates.join(', ')}`)
  for (const group of crm.groups ?? []) {
    if (!expectedGroups.includes(group.id)) push(role, `group id not in app catalogue: ${group.id}`)
    if (!group.landing?.startsWith('/backend')) push(role, `group ${group.id} has an invalid landing`)
    if (!(group.items ?? []).some((item) => item.href === group.landing)) {
      push(role, `group ${group.id} landing is not one of its items`)
    }
    if ((group.items ?? []).length === 0) push(role, `group ${group.id} is empty`)
    if ((group.items ?? []).some((item) => !item.label)) push(role, `group ${group.id} has an unlabeled item`)
  }

  const deniedApi = await fetch(`${BASE}/api/directory/organizations`, { headers: { cookie }, redirect: 'manual' })
  if (role === 'employee' && deniedApi.status !== 403) {
    push(role, `organizations API was not refused (${deniedApi.status})`)
  }
  if (role === 'admin' && deniedApi.status === 403) push(role, 'admin unexpectedly refused the organizations API')

  const landingChecks = []
  for (const group of crm.groups ?? []) {
    const status = await statusOf(group.landing, cookie)
    if (![200, 307, 308].includes(status)) push(role, `group ${group.id} landing ${group.landing} -> ${status}`)
    landingChecks.push({ id: group.id, href: group.landing, status })
  }

  const destinationChecks = []
  const uniqueDaily = [...new Set(dailyHrefs)]
  for (let index = 0; index < uniqueDaily.length; index += 8) {
    const batch = uniqueDaily.slice(index, index + 8)
    const results = await Promise.all(batch.map(async (href) => ({ href, status: await statusOf(href, cookie) })))
    for (const result of results) {
      if (![200, 307, 308].includes(result.status)) push(role, `daily destination ${result.href} -> ${result.status}`)
    }
    destinationChecks.push(...results)
  }

  report.roles[role] = {
    status: crmRes.status,
    grantedFeatures: (nav.grantedFeatures ?? []).length,
    groups: (crm.groups ?? []).map((group) => ({
      id: group.id,
      label: group.label,
      landing: group.landing,
      items: (group.items ?? []).length,
    })),
    daily: dailyHrefs.length,
    manage: manageHrefs.length,
    personal: personalHrefs.length,
    actions: actionHrefs.length,
    authorized: authorized.size,
    unconfiguredGroups: crm.unconfiguredGroups ?? [],
    unknown: crm.unknown ?? [],
    duplicates: crm.duplicates ?? [],
    deniedApi: deniedApi.status,
    landings: landingChecks,
    destinations: destinationChecks,
  }
  console.log(
    `[declared-check] ${role}: groups=${(crm.groups ?? []).length} daily=${dailyHrefs.length} ` +
      `manage=${manageHrefs.length} personal=${personalHrefs.length} actions=${actionHrefs.length} ` +
      `authorized=${authorized.size} unknown=${(crm.unknown ?? []).length}`,
  )
}

report.issues = issues
if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`[declared-check] report -> ${OUT}`)
}
if (issues.length) {
  for (const issue of issues) console.error(`[declared-check] ${issue}`)
  console.error(`[declared-check] ${issues.length} issue(s)`)
  if (STRICT) process.exit(1)
} else {
  console.log('[declared-check] all declared-navigation invariants hold')
}
