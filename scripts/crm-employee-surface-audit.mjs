#!/usr/bin/env node
/**
 * What can a plain employee READ that looks like administration?
 *
 * The M4 probe asserts the endpoints it already knows about behave as expected; this
 * audit looks in the other direction: it asks which admin-ish reads an employee can
 * actually perform right now, so the breadth of the employee role is visible instead
 * of being discovered page by page.
 *
 * Read-only: GET requests only, no writes, no model calls.
 * Usage: node scripts/crm-employee-surface-audit.mjs [--out /path.json]
 */
import fs from 'node:fs'
import { credentials, loginWithRetry } from './lib/session.mjs'

const BASE = process.env.PROBE_BASE_URL ?? 'http://127.0.0.1:3000'
const outFlag = process.argv.indexOf('--out')
const OUT = outFlag === -1 ? null : process.argv[outFlag + 1]

const CASES = [
  { path: '/api/auth/users', label: 'user directory' },
  { path: '/api/auth/roles', label: 'role list' },
  { path: '/api/directory/organizations', label: 'organizations' },
  { path: '/api/audit_logs/audit-logs/actions?canViewTenant=true&scope=tenant', label: 'tenant audit log' },
  { path: '/api/audit_logs/audit-logs/actions', label: 'scoped audit log' },
  { path: '/api/system_update/status', label: 'release status' },
  { path: '/api/docs/openapi', label: 'openapi document' },
  { path: '/api/integrations', label: 'integrations' },
  { path: '/api/webhooks', label: 'webhooks' },
  { path: '/api/payment-gateways', label: 'payment gateways' },
  { path: '/api/data_sync/sync-runs', label: 'data sync runs' },
  { path: '/api/settings/me', label: 'settings' },
  { path: '/api/communication_channels/channels', label: 'communication channels' },
]

const creds = credentials()
const roles = ['employee', 'admin', 'superadmin']

async function probe(role) {
  const cred = creds.get(role)
  if (!cred) return null
  const cookie = await loginWithRetry(BASE, cred, { role })
  const out = []
  for (const item of CASES) {
    const res = await fetch(`${BASE}${item.path}`, { headers: { cookie }, signal: AbortSignal.timeout(8000) }).catch((e) => ({ status: 0, err: String(e.message) }))
    const status = res.status ?? 0
    let shape = null
    if (status === 200) {
      const body = await res.json().catch(() => null)
      shape = body && typeof body === 'object'
        ? { keys: Object.keys(body).slice(0, 6), items: Array.isArray(body.items) ? body.items.length : null }
        : null
    }
    out.push({ ...item, status, shape })
  }
  return out
}

const results = {}
for (const role of roles) {
  const rows = await probe(role)
  if (rows) results[role] = rows
}

const employee = results.employee ?? []
const admin = results.admin ?? []
const review = employee
  .filter((row) => row.status === 200)
  .map((row) => {
    const adminRow = admin.find((r) => r.path === row.path)
    return { ...row, adminStatus: adminRow?.status ?? null, adminOnly: adminRow?.status !== 200 }
  })

const summary = {
  checkedAt: new Date().toISOString(),
  base: BASE,
  roles: Object.fromEntries(Object.entries(results).map(([role, rows]) => [role, rows.map((r) => `${r.status} ${r.label}`)])),
  employeeReadable: review,
  note: 'employeeReadable lists endpoints a plain employee can read today; each one is a policy question, not automatically a bug.',
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
