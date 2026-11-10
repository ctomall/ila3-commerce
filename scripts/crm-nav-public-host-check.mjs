#!/usr/bin/env node
/**
 * Regression gate: the five-scene navigation route must answer under the PUBLIC host.
 *
 * The route reads its own core-nav payload through the app origin. When that origin came
 * from `req.url` it became https://mercato.ila3.top, which this host cannot reach, so on
 * 2026-11-10 every production read failed with 502 and the rail rendered empty — while a
 * request from 127.0.0.1 succeeded. A local-only check therefore cannot catch it.
 *
 * This sends the public Host header while connecting to loopback, which reproduces the
 * production condition, and asserts 200 with the five scenes.
 *
 * Usage:
 *   node scripts/crm-nav-public-host-check.mjs [--base http://127.0.0.1:3000]
 *        [--host mercato.ila3.top] [--role employee|admin]
 */
import { credentials, loginWithRetry } from './lib/session.mjs'

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

const BASE = arg('--base', process.env.CRM_NAV_BASE_URL ?? 'http://127.0.0.1:3000')
const HOST = arg('--host', process.env.CRM_NAV_PUBLIC_HOST ?? 'mercato.ila3.top')
const ROLE = arg('--role', 'employee')

const cred = credentials().get(ROLE)
if (!cred) throw new Error(`no ${ROLE} credentials in ~/.ila3-admin-credentials`)

const cookie = await loginWithRetry(BASE, cred, { role: ROLE })

let status = 0
let body = null
try {
  const res = await fetch(`${BASE}/api/crm_navigation/navigation`, {
    headers: {
      cookie,
      host: HOST,
      'x-forwarded-host': HOST,
      'x-forwarded-proto': 'https',
    },
    signal: AbortSignal.timeout(20000),
  })
  status = res.status
  body = await res.json().catch(() => null)
} catch (error) {
  console.log(JSON.stringify({ role: ROLE, host: HOST, status: 'network-error', detail: String(error?.message ?? error), ok: false }, null, 2))
  process.exit(1)
}

const scenes = body?.crm?.scenes ?? body?.scenes ?? []
const ok = status === 200 && scenes.length === 5
console.log(
  JSON.stringify(
    {
      role: ROLE,
      base: BASE,
      host: HOST,
      status,
      scenes: scenes.map((scene) => scene.id),
      // The failure this gate exists for: the route answered 502 because its self-fetch
      // went out through the public host and timed out.
      selfFetchTimedOut: status === 502 || status === 504,
      ok,
    },
    null,
    2,
  ),
)
process.exit(ok ? 0 : 1)
