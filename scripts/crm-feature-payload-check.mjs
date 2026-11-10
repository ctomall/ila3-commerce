#!/usr/bin/env node
/**
 * Diagnostic: is every feature a role holds actually reported to the browser?
 *
 * The nav payload's `grantedFeatures` goes through `filterGrantsByEnabledModules`, so a
 * feature the module registry does not declare is silently dropped from the payload while
 * the API still authorizes it (proved on 2026-11-10: the employee role holds
 * customers.interactions.manage, POST /api/customers/interactions returns 400 validation,
 * but the payload listed one feature fewer). Any control that gates on the payload would
 * then hide itself while the API allows the action.
 *
 * Read-only: logs in per role, reads the payload, reads the role ACL from the database
 * through the release .env credentials, and prints the difference per role.
 *
 * Usage: node scripts/crm-feature-payload-check.mjs [--base URL]
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { credentials, loginWithRetry } from './lib/session.mjs'

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}
const BASE = arg('--base', process.env.PROBE_BASE_URL ?? 'http://127.0.0.1:3000')
const RELEASE = '/home/pro/releases/mercato/current'
const env = Object.fromEntries(
  fs.readFileSync(path.join(RELEASE, '.env'), 'utf8').split('\n').map((line) => line.replace(/^export /, '')).filter((line) => line.includes('=')).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).replace(/^['"]|['"]$/g, '')]),
)

function roleFeatures(role) {
  const result = spawnSync('psql', ['-tAc', `select features_json from role_acls ra join roles r on r.id = ra.role_id where r.name = '${role}'`], {
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: env.POSTGRES_PASSWORD, PGHOST: env.POSTGRES_HOST || 'localhost', PGPORT: env.POSTGRES_PORT || '5432', PGUSER: env.POSTGRES_USER, PGDATABASE: env.POSTGRES_DB },
  })
  if (result.status !== 0) return null
  try {
    return JSON.parse(result.stdout.trim())
  } catch {
    return null
  }
}

const summary = { base: BASE, roles: {} }
let drift = 0
for (const role of ['employee', 'admin']) {
  const cred = credentials().get(role)
  if (!cred) continue
  const cookie = await loginWithRetry(BASE, cred, { role })
  const res = await fetch(`${BASE}/api/crm_navigation/navigation`, { headers: { cookie } })
  const payload = await res.json().catch(() => null)
  const reported = Array.isArray(payload?.grantedFeatures) ? payload.grantedFeatures : null
  const raw = roleFeatures(role)
  // The payload expands wildcards into concrete ids, so compare only concrete grants and
  // treat a wildcard in the payload as covering them. Otherwise `vector.*` looks "dropped"
  // simply because the payload lists the expanded names instead.
  const covered = (feature, list) => {
    if (list.includes(feature)) return true
    const parts = feature.split('.')
    for (let i = parts.length - 1; i > 0; i -= 1) {
      if (list.includes(`${parts.slice(0, i).join('.')}.*`)) return true
    }
    const payloadWildcards = list.filter((item) => item.endsWith('.*'))
    return payloadWildcards.some((wildcard) => feature.startsWith(wildcard.slice(0, -1)))
  }
  // A wildcard grant is present when the payload carries any of its expansions; a concrete
  // grant must be listed or covered by a wildcard the payload carries.
  const missing = reported && raw
    ? raw.filter((feature) => {
        if (feature.endsWith('.*')) {
          const prefix = feature.slice(0, -2)
          return !reported.some((item) => item === feature || item.startsWith(`${prefix}.`))
        }
        return !covered(feature, reported)
      })
    : null
  // A gap in a module the payload does not mention at all means the module is not exposed to
  // this app (its grants are leftovers). A gap inside a module that IS in the payload is the
  // interesting case: the role holds a feature the browser is never told about.
  const classify = (feature) => {
    const prefix = feature.replace(/\.\*$/, '').split('.')[0]
    const moduleVisible = (reported ?? []).some((item) => item.startsWith(`${prefix}.`))
    return { feature, moduleVisible }
  }
  const gaps = missing ? missing.map(classify) : null
  const anomalies = gaps ? gaps.filter((gap) => gap.moduleVisible) : []
  drift += anomalies.length
  summary.roles[role] = {
    status: res.status,
    reported: reported?.length ?? null,
    acl: raw?.length ?? null,
    anomalies: anomalies.map((gap) => gap.feature),
    informationalNotExposed: gaps ? gaps.filter((gap) => !gap.moduleVisible).map((gap) => gap.feature) : null,
  }
}

summary.note = 'anomalies are features in a module the payload does expose yet the payload omits: the API still authorizes them, so a payload-gated control would hide while the action works. informationalNotExposed are grants from modules this app does not expose at all.'
console.log(JSON.stringify(summary, null, 2))
process.exit(drift > 0 ? 1 : 0)
