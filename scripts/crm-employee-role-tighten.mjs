#!/usr/bin/env node
/**
 * Propose (and, with explicit approval, apply) the technical-feature revoke for `employee`.
 *
 * Evidence for the list: scripts/crm-employee-surface-audit.mjs shows a plain employee can
 * read the user directory (3 accounts with roles) and 14 integrations because the role
 * holds auth.users.list / integrations.view / webhooks.view. Whether employees *should*
 * see those is a business decision, so this tool is read-only by default: --check prints
 * exactly what would be removed and changes nothing.
 *
 *   node scripts/crm-employee-role-tighten.mjs --check
 *   node scripts/crm-employee-role-tighten.mjs --apply --approval "<who approved>"
 *
 * --apply also needs ILA3_ALLOW_ROLE_TIGHTEN=1 in the environment, so a stray invocation
 * cannot change production authorization by accident.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const REVOKE = ['auth.users.list', 'integrations.view', 'webhooks.view']
const apply = process.argv.includes('--apply')
const approvalFlag = process.argv.indexOf('--approval')
const approval = approvalFlag === -1 ? null : process.argv[approvalFlag + 1]
const RECORD = 'docs/crm-platform/audit/employee-role-tighten.json'
const RELEASE = process.env.ILA3_RELEASE_ROOT ? path.join(process.env.ILA3_RELEASE_ROOT, 'current') : '/home/pro/releases/mercato/current'

function sql(statement) {
  const env = Object.fromEntries(
    fs.readFileSync(path.join(RELEASE, '.env'), 'utf8').split('\n').map((l) => l.replace(/^export /, '')).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^['"]|['"]$/g, '')]),
  )
  return spawnSync('psql', ['-tAc', statement], {
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: env.POSTGRES_PASSWORD, PGHOST: env.POSTGRES_HOST || 'localhost', PGPORT: env.POSTGRES_PORT || '5432', PGUSER: env.POSTGRES_USER, PGDATABASE: env.POSTGRES_DB },
  })
}

const before = sql("select features_json from role_acls ra join roles r on r.id = ra.role_id where r.name = 'employee'")
if (before.status !== 0) {
  console.error(`cannot read the employee role: ${(before.stderr || '').trim()}`)
  process.exit(1)
}
const features = JSON.parse(before.stdout.trim())
const removed = features.filter((feature) => REVOKE.includes(feature))
const after = features.filter((feature) => !REVOKE.includes(feature))

console.log(JSON.stringify({ mode: apply ? 'apply' : 'check', before: features.length, after: after.length, remove: removed, keepCount: after.length }, null, 2))
if (!apply) {
  console.log('\n只读检查：未修改任何权限。要执行请用 --apply --approval "<who>" 且设置 ILA3_ALLOW_ROLE_TIGHTEN=1。')
  process.exit(0)
}
if (process.env.ILA3_ALLOW_ROLE_TIGHTEN !== '1' || !approval) {
  console.error('refusing: --apply needs ILA3_ALLOW_ROLE_TIGHTEN=1 and --approval "<who approved>"')
  process.exit(2)
}
const literal = JSON.stringify(after).replace(/'/g, "''")
const update = sql(`update role_acls ra set features_json = '${literal}'::jsonb, updated_at = now() from roles r where r.id = ra.role_id and r.name = 'employee' returning jsonb_array_length(ra.features_json)`)
if (update.status !== 0) {
  console.error(`update failed: ${(update.stderr || '').trim()}`)
  process.exit(1)
}
const record = { at: new Date().toISOString(), approvedBy: approval, removed, before: features.length, after: Number(update.stdout.trim()) }
fs.mkdirSync(path.dirname(RECORD), { recursive: true })
fs.writeFileSync(RECORD, JSON.stringify(record, null, 2))
console.log(JSON.stringify(record, null, 2))
console.log('已写入；RbacService 缓存 5 分钟，或 systemctl restart ila3-auto-deploy-app.service 立即生效。')
