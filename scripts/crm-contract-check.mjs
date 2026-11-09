#!/usr/bin/env node
/**
 * Contract linter for the draft leadgen API (docs/crm-platform/api/leadgen-openapi.json).
 *
 * The rules are the ones the contract itself claims: identity is never taken from the
 * body, every operation names the feature it needs, mutating calls declare how they are
 * idempotent, quota-limited calls declare 429, and state transitions declare 409. A draft
 * that violates its own rules must fail here, before anyone implements against it.
 *
 * NOT checked here: the 404-rather-than-403 rule for cross-tenant reads (D16). It is a
 * written rule with no route to exercise yet; claiming it as enforced would make the draft
 * read as guarded when nothing tests it (audit finding B-P1-1).
 *
 * Also checks that no draft path already exists in the live /api/docs/openapi, so the
 * draft cannot silently collide with something the app already serves.
 *
 * Usage: node scripts/crm-contract-check.mjs [--spec docs/crm-platform/api/leadgen-openapi.json]
 */
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.CONTRACT_BASE_URL ?? 'http://127.0.0.1:3000'
const specFlag = process.argv.indexOf('--spec')
const SPEC = path.resolve(specFlag === -1 ? 'docs/crm-platform/api/leadgen-openapi.json' : process.argv[specFlag + 1])
const CREDENTIALS = '/home/pro/.ila3-admin-credentials'

const FORBIDDEN_BODY_KEYS = ['tenantId', 'tenant_id', 'organizationId', 'organization_id', 'actorUserId', 'actor_user_id']
const MUTATION_METHODS = new Set(['post', 'put', 'patch'])

const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'))
const problems = []
const notes = []

function walk(node, visit, trail = '') {
  if (Array.isArray(node)) {
    node.forEach((item, index) => walk(item, visit, `${trail}[${index}]`))
    return
  }
  if (node && typeof node === 'object') {
    visit(node, trail)
    for (const [key, value] of Object.entries(node)) walk(value, visit, `${trail}/${key}`)
  }
}

// 1) structure
if (spec.openapi !== '3.1.0') problems.push(`openapi must be 3.1.0, got ${spec.openapi}`)
if (!spec.paths || Object.keys(spec.paths).length === 0) problems.push('no paths declared')

const operations = []
for (const [route, item] of Object.entries(spec.paths ?? {})) {
  if (!route.startsWith('/leadgen/')) problems.push(`${route}: draft paths must live under /leadgen/`)
  for (const [method, op] of Object.entries(item)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue
    operations.push({ route, method, op })
  }
}

for (const { route, method, op } of operations) {
  const id = `${method.toUpperCase()} ${route}`

  // 2) every operation names its features (webhooks are the documented exception)
  const features = op['x-required-features']
  if (!Array.isArray(features)) problems.push(`${id}: missing x-required-features`)
  else if (features.length === 0 && op['x-auth'] !== 'signature') {
    problems.push(`${id}: empty x-required-features without x-auth: signature`)
  }

  // 3) idempotency declared for mutations
  if (MUTATION_METHODS.has(method) && !op['x-idempotency']) {
    problems.push(`${id}: mutation without x-idempotency`)
  }

  // 4) identity must never come from the request body
  const bodySchema = resolveSchema(op.requestBody?.content?.['application/json']?.schema)
  if (bodySchema) {
    walk(bodySchema, (node, trail) => {
      for (const key of FORBIDDEN_BODY_KEYS) {
        if (Object.prototype.hasOwnProperty.call(node.properties ?? {}, key)) {
          problems.push(`${id}: request body exposes ${key} (path ${trail})`)
        }
      }
    })
  }

  // 5) quota-limited operations declare 429; state transitions declare 409
  const text = JSON.stringify(op).toLowerCase()
  // Only writes consume quota; reading a bucket cannot answer 429.
  if (MUTATION_METHODS.has(method) && (text.includes('quota') || text.includes('额度')) && !op.responses?.['429']) {
    problems.push(`${id}: quota-limited but declares no 429`)
  }
  if (['put', 'patch'].includes(method) && !op.responses?.['409']) {
    problems.push(`${id}: versioned mutation without 409`)
  }

  // 6) feature naming convention
  if (Array.isArray(features)) {
    for (const feature of features) {
      if (!feature.startsWith('leadgen.')) problems.push(`${id}: feature "${feature}" is not leadgen.*`)
    }
  }
}

// 7) no collision with the live surface
function credentials() {
  const map = new Map()
  for (const line of fs.readFileSync(CREDENTIALS, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    const [role, email, password] = line.trim().split(/\s+/)
    if (role && email && password) map.set(role, { email, password })
  }
  return map.get('superadmin')
}

let livePaths = []
try {
  const cred = credentials()
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(cred).toString(),
    redirect: 'manual',
  })
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  const live = await fetch(`${BASE}/api/docs/openapi`, { headers: { cookie } })
  if (live.ok) {
    const json = await live.json()
    livePaths = Object.keys(json.paths ?? {})
  } else {
    // "Collision check skipped" must not coexist with "no collision": that pair is how a
    // gate ends up green while the tested property was never observed.
    problems.push(`live openapi returned ${live.status}: cannot prove the draft avoids existing paths`)
  }
} catch (error) {
  problems.push(`live openapi unreachable (${String(error).slice(0, 60)}): cannot prove the draft avoids existing paths`)
}

// `requestBody.schema` may be a $ref; checking only inline `properties` let a referenced
// schema carry tenantId straight through the rule.
function resolveSchema(schema) {
  let current = schema
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    const ref = current.$ref
    if (typeof ref !== 'string' || !ref.startsWith('#/')) return current
    current = ref
      .slice(2)
      .split('/')
      .reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), spec)
  }
  return current
}

for (const { route } of operations) {
  if (livePaths.includes(route)) problems.push(`${route}: already served by the live API — draft would collide`)
}

const ok = problems.length === 0
console.log(`[contract] ${operations.length} operation(s), ${Object.keys(spec.paths).length} path(s)`)
console.log(`[contract] live paths seen: ${livePaths.length}`)
for (const note of notes) console.log(`[contract] note: ${note}`)
if (ok) {
  const collisionClaim = livePaths.length > 0 ? 'no collision' : 'collision check NOT RUN'
  console.log(`[contract] OK: draft satisfies its own rules (features, idempotency, no body identity, 429/409, ${collisionClaim})`)
} else {
  for (const problem of problems) console.error(`[contract] FAIL ${problem}`)
  console.error(`[contract] ${problems.length} problem(s)`)
}
process.exit(ok ? 0 : 1)
