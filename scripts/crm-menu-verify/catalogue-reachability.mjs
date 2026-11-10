#!/usr/bin/env node
/**
 * Lightweight catalogue + reachability audit (no browser, low memory).
 *
 * Logs in as the real admin/employee accounts from /home/pro/.ila3-admin-credentials
 * via scripts/lib/session.mjs, freezes the live version-2 catalogue, and GET-checks
 * every declared href (daily + manage + personal + utility). Bodies are cancelled after
 * the status is read, so this can run while the host is under memory pressure.
 *
 * Output: <out>/<label>-catalogue-reachability.json
 * Exit: 0 no 5xx/network failures, 1 otherwise, 2 infrastructure failure.
 *
 * Usage:
 *   node scripts/crm-menu-verify/catalogue-reachability.mjs \
 *     --base http://127.0.0.1:3101 --label candidate-a82bd6c \
 *     --out /storage/artifacts/pro/menu-declaration-audit/verify
 */
import fs from 'node:fs'
import path from 'node:path'
import { credentials, loginWithRetry } from '../lib/session.mjs'

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}
const BASE = String(arg('--base', 'http://127.0.0.1:3000')).replace(/\/+$/, '')
const LABEL = arg('--label', `reachability-${Date.now()}`)
const OUT = path.resolve(arg('--out', '/storage/artifacts/pro/menu-declaration-audit/verify'))
const ROLES = String(arg('--roles', 'admin,employee')).split(',').map((role) => role.trim()).filter(Boolean)
const CONCURRENCY = Number(arg('--concurrency', '2'))
const NAV_API = '/api/crm_navigation/navigation'
fs.mkdirSync(OUT, { recursive: true })

function flattenCatalogue(crm) {
  const items = []
  const add = (href, label, kind, container) => {
    if (href) items.push({ href, label: String(label ?? '').slice(0, 120), kind, container })
  }
  for (const group of Array.isArray(crm?.groups) ? crm.groups : []) {
    for (const item of Array.isArray(group.items) ? group.items : []) {
      add(item.href, item.label, 'group', group.id)
      for (const child of Array.isArray(item.children) ? item.children : []) add(child.href, child.label, 'child', group.id)
    }
  }
  for (const category of crm?.manage?.categories ?? []) {
    for (const item of Array.isArray(category.items) ? category.items : []) {
      add(item.href, item.label, 'manage', category.id)
      for (const child of Array.isArray(item.children) ? item.children : []) add(child.href, child.label, 'child', category.id)
    }
  }
  for (const item of crm?.personal?.items ?? []) add(item.href, item.label, 'personal', 'personal')
  for (const item of crm?.utility ?? []) add(item.href, item.label, 'utility', 'utility')
  const counts = new Map()
  for (const item of items) counts.set(item.href, (counts.get(item.href) ?? 0) + 1)
  return {
    items,
    hrefs: [...new Set(items.map((item) => item.href))],
    duplicates: [...counts.entries()].filter(([, count]) => count > 1).map(([href, count]) => ({ href, count })),
  }
}

async function getStatus(cookie, href) {
  const started = Date.now()
  try {
    const response = await fetch(new URL(href, BASE), {
      headers: { cookie, accept: 'text/html' },
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    })
    try {
      await response.body?.cancel()
    } catch {
      /* ignore */
    }
    return { href, status: response.status, location: response.headers.get('location'), elapsedMs: Date.now() - started }
  } catch (error) {
    return { href, status: 0, error: String(error instanceof Error ? error.message : error).slice(0, 200), elapsedMs: Date.now() - started }
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let index = 0
  async function run() {
    while (index < items.length) {
      const current = index++
      results[current] = await worker(items[current])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

const creds = credentials()
const report = { schemaVersion: 1, label: LABEL, base: BASE, generatedAt: new Date().toISOString(), roles: {}, exitCode: 0 }
let exitCode = 0

try {
  for (const role of ROLES) {
    const credential = creds.get(role)
    if (!credential) {
      report.roles[role] = { error: 'credential missing' }
      continue
    }
    let cookie
    try {
      cookie = await loginWithRetry(BASE, credential, { role })
    } catch (error) {
      report.roles[role] = { error: `login failed: ${error instanceof Error ? error.message : String(error)}` }
      exitCode = 2
      continue
    }
    const navResponse = await fetch(new URL(NAV_API, BASE), { headers: { cookie, accept: 'application/json' }, signal: AbortSignal.timeout(30000) })
    if (!navResponse.ok) {
      report.roles[role] = { error: `catalogue ${navResponse.status}` }
      exitCode = 2
      continue
    }
    const payload = await navResponse.json()
    const crm = payload?.crm ?? null
    const flat = flattenCatalogue(crm)
    const statuses = await mapLimit(flat.hrefs, CONCURRENCY, (href) => getStatus(cookie, href))
    const histogram = statuses.reduce((acc, entry) => {
      acc[entry.status] = (acc[entry.status] ?? 0) + 1
      return acc
    }, {})
    const failures = statuses.filter((entry) => entry.status === 0 || entry.status >= 500)
    report.roles[role] = {
      catalogue: {
        version: crm?.version ?? null,
        groups: (crm?.groups ?? []).map((group) => ({ id: group.id, label: group.label, landing: group.landing, items: (group.items ?? []).length })),
        manage: (crm?.manage?.categories ?? []).map((category) => ({ id: category.id, label: category.label, items: (category.items ?? []).map((item) => item.href) })),
        personal: (crm?.personal?.items ?? []).map((item) => ({ href: item.href, label: item.label })),
        utility: crm?.utility ?? [],
        unknown: crm?.unknown ?? [],
        unconfiguredGroups: crm?.unconfiguredGroups ?? [],
        duplicates: crm?.duplicates ?? [],
        counts: { groups: (crm?.groups ?? []).length, daily: (crm?.groups ?? []).reduce((sum, group) => sum + (group.items ?? []).length, 0), manage: (crm?.manage?.categories ?? []).reduce((sum, category) => sum + (category.items ?? []).length, 0), personal: (crm?.personal?.items ?? []).length, entries: flat.items.length, uniqueHrefs: flat.hrefs.length },
        flatItems: flat.items,
      },
      reachability: { hrefs: flat.hrefs.length, histogram, failures, statuses },
    }
    if (failures.length > 0) exitCode = 1
    console.log(`${role}: ${flat.hrefs.length} hrefs, histogram ${JSON.stringify(histogram)}, failures ${failures.length}`)
  }
  report.exitCode = exitCode
  const file = path.join(OUT, `${LABEL}-catalogue-reachability.json`)
  fs.writeFileSync(file, JSON.stringify(report, null, 1))
  console.log(`written ${file}`)
} catch (error) {
  console.error(`[fatal] ${error instanceof Error ? error.stack : String(error)}`)
  exitCode = 2
}

process.exit(exitCode)
