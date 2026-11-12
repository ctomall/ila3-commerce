#!/usr/bin/env node
/**
 * S85 · reply/connect grant migration (design rev2 `F5-01`, `D-3`).
 *
 * Two changes must land in ONE transaction or a tenant loses reply the moment the
 * legacy grant is revoked:
 *
 *   1. grant `communications.reply` to the roles that answer customers;
 *   2. revoke `communication_channels.connect_user_channel` from `employee`
 *      (personal channels are supervisor-and-above only), keeping it for
 *      superadmin / admin / manager.
 *
 * Read-only by default. `--check` prints the plan per tenant and changes nothing.
 *
 *   node scripts/crm-reply-role-migration.mjs --check
 *   node scripts/crm-reply-role-migration.mjs --apply --tenant <tenantId> --approval "<who approved>"
 *
 * `--apply` additionally needs ILA3_ALLOW_ROLE_MIGRATION=1 so a stray invocation
 * cannot change production authorization by accident. The update, the post-state
 * verification and the commit share one psql batch: a failed verification RAISEs
 * and rolls the whole tenant back. An audit record (before/after + rollback SQL)
 * is written under docs/crm-platform/audit/.
 *
 * The plan mirrors src/modules/communications/lib/reply-role-plan.ts; the jest
 * case `reply-role-migration-script.test.ts` fails if the two disagree.
 *
 * Scope: existing tenants. New tenants also need this script after `mercato init`,
 * because the installed communication_channels module still seeds
 * `connect_user_channel` for `employee`; the app can only add features at seed
 * time (see src/modules/communications/setup.ts).
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Kept in sync with src/modules/communications/lib/reply-permission.ts (guarded by a test).
export const REPLY_FEATURE = 'communications.reply'
export const LEGACY_REPLY_FEATURE = 'communication_channels.connect_user_channel'
export const REPLY_ROLES = ['superadmin', 'admin', 'manager', 'employee']
export const LEGACY_KEPT_ROLES = ['superadmin', 'admin', 'manager']

const APPLY = process.argv.includes('--apply')
const APPROVAL = valueOf('--approval')
const TENANT = valueOf('--tenant')
const RELEASE = process.env.ILA3_RELEASE_ROOT
  ? path.join(process.env.ILA3_RELEASE_ROOT, 'current')
  : '/home/pro/releases/mercato/current'
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const AUDIT_DIR = path.join(REPO_ROOT, 'docs/crm-platform/audit')

function valueOf(flag) {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}

function dbEnv() {
  const file = path.join(RELEASE, '.env')
  if (!fs.existsSync(file)) {
    console.error(`cannot read release env at ${file}; set ILA3_RELEASE_ROOT to a release root`)
    process.exit(1)
  }
  const env = Object.fromEntries(
    fs.readFileSync(file, 'utf8').split('\n')
      .map((line) => line.replace(/^export /, ''))
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).replace(/^['"]|['"]$/g, '')]),
  )
  return {
    ...process.env,
    PGPASSWORD: env.POSTGRES_PASSWORD,
    PGHOST: env.POSTGRES_HOST || 'localhost',
    PGPORT: env.POSTGRES_PORT || '5432',
    PGUSER: env.POSTGRES_USER,
    PGDATABASE: env.POSTGRES_DB,
  }
}

function sql(statement) {
  return spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-tAc', statement], { encoding: 'utf8', env: dbEnv() })
}

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`
const jsonLiteral = (values) => `${quote(JSON.stringify(values))}::jsonb`

/** row: { tenant_id, role_name, features_json } */
function readRoles() {
  const result = sql(
    "select coalesce(json_agg(json_build_object('tenantId', r.tenant_id, 'role', r.name, 'features', ra.features_json, 'aclId', ra.id)), '[]'::json) " +
      'from roles r join role_acls ra on ra.role_id = r.id',
  )
  if (result.status !== 0) {
    console.error(`cannot read role_acls: ${(result.stderr || '').trim()}`)
    process.exit(1)
  }
  const rows = JSON.parse(result.stdout.trim() || '[]')
  return rows.map((row) => ({
    tenantId: row.tenantId,
    role: row.role,
    aclId: row.aclId,
    features: Array.isArray(row.features) ? row.features : [],
  }))
}

function planRole(role, features) {
  if (!REPLY_ROLES.includes(role)) return null
  const after = [...new Set(features)]
  const grant = []
  const revoke = []
  if (!after.includes(REPLY_FEATURE)) {
    after.push(REPLY_FEATURE)
    grant.push(REPLY_FEATURE)
  }
  if (!LEGACY_KEPT_ROLES.includes(role) && after.includes(LEGACY_REPLY_FEATURE)) {
    after.splice(after.indexOf(LEGACY_REPLY_FEATURE), 1)
    revoke.push(LEGACY_REPLY_FEATURE)
  }
  return { role, before: features, after, grant, revoke, changed: grant.length > 0 || revoke.length > 0 }
}

function plansByTenant(rows) {
  const tenants = new Map()
  for (const row of rows) {
    if (!tenants.has(row.tenantId)) tenants.set(row.tenantId, new Map())
    tenants.get(row.tenantId).set(row.role, row)
  }
  const out = new Map()
  for (const [tenantId, roles] of tenants) {
    const plans = []
    for (const [role, row] of roles) {
      const plan = planRole(role, row.features)
      if (plan) plans.push({ ...plan, aclId: row.aclId })
    }
    out.set(tenantId, plans.sort((a, b) => REPLY_ROLES.indexOf(a.role) - REPLY_ROLES.indexOf(b.role)))
  }
  return out
}

const rows = readRoles()
const tenants = plansByTenant(rows)
const summary = [...tenants].map(([tenantId, plans]) => ({
  tenantId,
  changing: plans.filter((plan) => plan.changed).map((plan) => ({ role: plan.role, grant: plan.grant, revoke: plan.revoke })),
  unchanged: plans.filter((plan) => !plan.changed).map((plan) => plan.role),
}))

const pending = summary.filter((entry) => entry.changing.length > 0)

if (!APPLY) {
  console.log(JSON.stringify({ mode: 'check', tenants: summary, pendingTenants: pending.length }, null, 2))
  console.log('\n只读检查：未修改任何权限。要执行请用 --apply --tenant <id> --approval "<who>" 且设置 ILA3_ALLOW_ROLE_MIGRATION=1。')
  process.exit(0)
}

if (process.env.ILA3_ALLOW_ROLE_MIGRATION !== '1' || !APPROVAL || !TENANT) {
  console.error('refusing: --apply needs ILA3_ALLOW_ROLE_MIGRATION=1, --tenant <tenantId> and --approval "<who approved>"')
  process.exit(2)
}
if (!tenants.has(TENANT)) {
  console.error(`refusing: tenant ${TENANT} has no role_acls rows`)
  process.exit(2)
}
const plans = tenants.get(TENANT)
const changes = plans.filter((plan) => plan.changed)
if (changes.length === 0) {
  console.log(JSON.stringify({ mode: 'apply', tenantId: TENANT, changed: 0, note: 'nothing to do (already migrated)' }, null, 2))
  process.exit(0)
}

const statements = changes.map(
  (plan) => `update role_acls set features_json = ${jsonLiteral(plan.after)}, updated_at = now() where id = ${quote(plan.aclId)};`,
)
const rollback = changes.map(
  (plan) => `update role_acls set features_json = ${jsonLiteral(plan.before)}, updated_at = now() where id = ${quote(plan.aclId)};`,
)
// Verification inside the same transaction: any violation RAISEs and rolls back.
const verify = `do $verify$
declare missing text;
begin
  select string_agg(r.name, ',') into missing
    from roles r join role_acls ra on ra.role_id = r.id
   where r.tenant_id = ${quote(TENANT)}
     and r.name in (${REPLY_ROLES.map(quote).join(',')})
     and not (ra.features_json ? ${quote(REPLY_FEATURE)});
  if missing is not null then
    raise exception 'verify failed: missing % for role(s) %', ${quote(REPLY_FEATURE)}, missing;
  end if;
  if exists (
    select 1 from roles r join role_acls ra on ra.role_id = r.id
     where r.tenant_id = ${quote(TENANT)} and r.name = 'employee'
       and ra.features_json ? ${quote(LEGACY_REPLY_FEATURE)}
  ) then
    raise exception 'verify failed: employee still holds %', ${quote(LEGACY_REPLY_FEATURE)};
  end if;
  if exists (
    select 1 from roles r join role_acls ra on ra.role_id = r.id
     where r.tenant_id = ${quote(TENANT)}
       and r.name in (${LEGACY_KEPT_ROLES.map(quote).join(',')})
       and not (ra.features_json ? ${quote(LEGACY_REPLY_FEATURE)})
  ) then
    raise exception 'verify failed: a supervisor role lost %', ${quote(LEGACY_REPLY_FEATURE)};
  end if;
end $verify$;`

const batch = `begin;\n${statements.join('\n')}\n${verify}\ncommit;`
const applied = sql(batch)
if (applied.status !== 0) {
  console.error(`migration rolled back: ${(applied.stderr || '').trim()}`)
  process.exit(applied.stderr && applied.stderr.includes('verify failed') ? 4 : 3)
}

const record = {
  at: new Date().toISOString(),
  tenantId: TENANT,
  approvedBy: APPROVAL,
  replyFeature: REPLY_FEATURE,
  legacyFeature: LEGACY_REPLY_FEATURE,
  changes: changes.map((plan) => ({ role: plan.role, grant: plan.grant, revoke: plan.revoke, before: plan.before, after: plan.after })),
  rollbackSql: rollback,
  note: 'RbacService caches grants for 5 minutes; restart the app unit to apply immediately.',
}
fs.mkdirSync(AUDIT_DIR, { recursive: true })
const recordPath = path.join(AUDIT_DIR, `reply-role-migration-${record.at.replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(recordPath, JSON.stringify(record, null, 2))
console.log(JSON.stringify({ mode: 'apply', tenantId: TENANT, changed: changes.length, record: path.relative(REPO_ROOT, recordPath) }, null, 2))
console.log('已提交；回退 SQL 记录在上述 JSON 的 rollbackSql。')
