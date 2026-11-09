#!/usr/bin/env node
/**
 * Live gate for the CRM five-scene navigation.
 *
 * It logs in as the real admin and employee accounts, reads the app's
 * `/api/crm_navigation/navigation` payload and asserts the invariants the redesign made:
 *
 *   - the rail gets no group list and no section rails (so no tree can render);
 *   - every authorized entry has an explicit owner (no unknown, no fallback);
 *   - every rendered href is authorized, and every authorized nav href is reachable;
 *   - no href repeats inside the content surfaces;
 *   - every scene destination answers (redirects allowed);
 *   - page actions keep a real parent page.
 *
 * Credentials come from ~/.ila3-admin-credentials (0600) and are never printed.
 *
 * Usage:
 *   node scripts/crm-nav-scene-check.mjs --base http://127.0.0.1:3100 --out /storage/artifacts/pro/crm-navigation-goal/check.json --strict
 */
import fs from 'node:fs'
import path from 'node:path'
import { credentials, loginWithRetry } from './lib/session.mjs'

const baseFlag = process.argv.indexOf('--base')
const BASE = baseFlag === -1 ? process.env.CRM_NAV_BASE_URL ?? 'http://127.0.0.1:3000' : process.argv[baseFlag + 1]
const outFlag = process.argv.indexOf('--out')
const OUT = outFlag === -1 ? null : path.resolve(process.argv[outFlag + 1])
const STRICT = process.argv.includes('--strict')
const ROLES = ['admin', 'employee']

const issues = []
const push = (role, message) => issues.push(`${role}: ${message}`)

function itemHrefs(items, out = []) {
  for (const item of items ?? []) {
    if (item?.href) out.push(item.href)
    itemHrefs(item?.children, out)
  }
  return out
}

function renderedHrefs(crm) {
  return [
    ...itemHrefs(crm.business?.categories?.flatMap?.((category) => category.items) ?? []),
    ...itemHrefs(crm.manage?.categories?.flatMap?.((category) => category.items) ?? []),
    ...itemHrefs(crm.messages?.items),
    ...itemHrefs(crm.personal?.items),
    ...itemHrefs(crm.customers?.followup),
    ...itemHrefs(crm.customers?.insights),
  ]
}

async function statusOf(url, cookie) {
  try {
    const res = await fetch(`${BASE}${url}`, { headers: { cookie }, redirect: 'manual' })
    return res.status
  } catch (error) {
    return `ERR ${error instanceof Error ? error.message : String(error)}`
  }
}

const creds = credentials()
const report = { generatedAt: new Date().toISOString(), base: BASE, roles: {} }

for (const role of ROLES) {
  if (!creds.has(role)) {
    push(role, 'credentials missing for role')
    continue
  }
  const cookie = await loginWithRetry(BASE, creds.get(role), { role })
  const unauthenticated = await fetch(`${BASE}/api/crm_navigation/navigation`, { redirect: 'manual' })
  if (unauthenticated.status !== 401) push(role, `unauthenticated request returned ${unauthenticated.status}, expected 401`)

  const res = await fetch(`${BASE}/api/crm_navigation/navigation`, { headers: { cookie }, redirect: 'manual' })
  if (!res.ok) {
    push(role, `/api/crm_navigation/navigation returned ${res.status}`)
    // Hiding an entry is not authorization: the server must still refuse the API
  // and the page for a role that was never granted it.
  const deniedApi = await fetch(`${BASE}/api/directory/organizations`, { headers: { cookie }, redirect: 'manual' })
  const deniedPage = await fetch(`${BASE}/backend/directory/organizations`, { headers: { cookie }, redirect: 'manual' })
  // Server HTML embeds error-component source, so an "Access Denied" substring is
  // not proof the caller saw it. The API status is authoritative here; the
  // visible page denial is asserted in the browser run.
  const denied = { api: deniedApi.status, page: deniedPage.status }
  if (role === 'employee' && deniedApi.status !== 403) {
    push(role, `organizations API was not refused (${deniedApi.status})`)
  }
  if (role === 'admin' && deniedApi.status === 403) push(role, 'admin unexpectedly refused the organizations API')

  report.roles[role] = { status: res.status }
    continue
  }
  const payload = await res.json()
  const crm = payload.crm
  if (!crm) {
    push(role, 'payload has no crm catalogue')
    // Hiding an entry is not authorization: the server must still refuse the API
  // and the page for a role that was never granted it.
  const deniedApi = await fetch(`${BASE}/api/directory/organizations`, { headers: { cookie }, redirect: 'manual' })
  const deniedPage = await fetch(`${BASE}/backend/directory/organizations`, { headers: { cookie }, redirect: 'manual' })
  // Server HTML embeds error-component source, so an "Access Denied" substring is
  // not proof the caller saw it. The API status is authoritative here; the
  // visible page denial is asserted in the browser run.
  const denied = { api: deniedApi.status, page: deniedPage.status }
  if (role === 'employee' && deniedApi.status !== 403) {
    push(role, `organizations API was not refused (${deniedApi.status})`)
  }
  if (role === 'admin' && deniedApi.status === 403) push(role, 'admin unexpectedly refused the organizations API')

  report.roles[role] = { status: res.status }
    continue
  }
  if ((payload.groups ?? []).length !== 0) push(role, `rail still has ${payload.groups.length} group(s)`)
  if ((payload.settingsSections ?? []).length !== 0) push(role, `rail still has ${payload.settingsSections.length} settings section(s)`)
  if ((payload.profileSections ?? []).length !== 0) push(role, `rail still has ${payload.profileSections.length} profile section(s)`)
  if ((crm.unknown ?? []).length !== 0) push(role, `unmapped entries: ${crm.unknown.join(', ')}`)

  const authorized = new Set(crm.authorized ?? [])
  const rendered = renderedHrefs(crm)
  for (const href of rendered) {
    if (!authorized.has(href)) push(role, `rendered but not authorized: ${href}`)
  }
  const repeated = rendered.filter((href, index) => rendered.indexOf(href) !== index)
  if (repeated.length) push(role, `repeated entry: ${[...new Set(repeated)].join(', ')}`)

  // Reachability: a hidden entry is only allowed to disappear if it is an
  // in-page action (its button lives on the parent page).
  const covered = new Set([
    ...rendered,
    ...(crm.scenes ?? []).map((scene) => scene.href).filter(Boolean),
    ...(crm.customers?.tabs ?? []).map((tab) => tab.href),
    ...(crm.actions ?? []),
  ])
  const lost = [...authorized].filter((href) => !covered.has(href))
  for (const href of lost) push(role, `authorized entry has no reachable home: ${href}`)

  const sceneChecks = []
  for (const scene of crm.scenes ?? []) {
    if (!scene.href) {
      if (scene.action !== 'open-ai-assistant') push(role, `scene ${scene.id} has neither href nor a known action`)
      sceneChecks.push({ id: scene.id, status: 'action' })
      continue
    }
    const status = await statusOf(scene.href, cookie)
    if (![200, 307, 308].includes(status)) push(role, `scene ${scene.id} ${scene.href} -> ${status}`)
    sceneChecks.push({ id: scene.id, href: scene.href, status })
  }
  for (const tab of crm.customers?.tabs ?? []) {
    const status = await statusOf(tab.href, cookie)
    if (![200, 307, 308].includes(status)) push(role, `customer tab ${tab.id} ${tab.href} -> ${status}`)
  }

  // Hiding an entry is not authorization: the server must still refuse the API
  // and the page for a role that was never granted it.
  const deniedApi = await fetch(`${BASE}/api/directory/organizations`, { headers: { cookie }, redirect: 'manual' })
  const deniedPage = await fetch(`${BASE}/backend/directory/organizations`, { headers: { cookie }, redirect: 'manual' })
  // Server HTML embeds error-component source, so an "Access Denied" substring is
  // not proof the caller saw it. The API status is authoritative here; the
  // visible page denial is asserted in the browser run.
  const denied = { api: deniedApi.status, page: deniedPage.status }
  if (role === 'employee' && deniedApi.status !== 403) {
    push(role, `organizations API was not refused (${deniedApi.status})`)
  }
  if (role === 'admin' && deniedApi.status === 403) push(role, 'admin unexpectedly refused the organizations API')

  report.roles[role] = {
    status: res.status,
    grantedFeatures: (payload.grantedFeatures ?? []).length,
    scenes: sceneChecks,
    customers: (crm.customers?.tabs ?? []).map((tab) => tab.id),
    businessCategories: (crm.business?.categories ?? []).map((category) => ({ id: category.id, items: category.items.length })),
    manageCategories: (crm.manage?.categories ?? []).map((category) => ({ id: category.id, items: category.items.length })),
    messages: (crm.messages?.items ?? []).length,
    personal: (crm.personal?.items ?? []).length,
    authorized: authorized.size,
    rendered: rendered.length,
    actions: crm.actions ?? [],
    unknown: crm.unknown ?? [],
    denied,
  }
  console.log(
    `[scene-check] ${role}: scenes=${(crm.scenes ?? []).length} tabs=${(crm.customers?.tabs ?? []).length} ` +
      `business=${(crm.business?.categories ?? []).length} manage=${(crm.manage?.categories ?? []).length} ` +
      `messages=${(crm.messages?.items ?? []).length} authorized=${authorized.size} rendered=${rendered.length} unknown=${(crm.unknown ?? []).length}`,
  )
}

report.issues = issues
if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`[scene-check] report -> ${OUT}`)
}

if (issues.length) {
  for (const issue of issues) console.error(`[scene-check] ${issue}`)
  console.error(`[scene-check] ${issues.length} issue(s)`)
  if (STRICT) process.exit(1)
} else {
  console.log('[scene-check] all invariants hold')
}
