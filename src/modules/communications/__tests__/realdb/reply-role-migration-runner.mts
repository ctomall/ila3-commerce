/**
 * Real-Postgres drill for the S85 permission migration (design rev2 F5-01 / D-3).
 *
 * The migration script is the only piece of this task that changes production
 * authorization, so its whole contract is exercised here against a disposable
 * database: the read-only plan, both refusals, the single-transaction apply,
 * idempotency, the in-transaction verification abort, and the recorded rollback SQL.
 *
 * The script reads connection settings from a release `.env`; this runner writes one
 * into a temp dir and points ILA3_RELEASE_ROOT at it, so nothing here can reach the
 * real release or the production database. Audit records go to a temp dir through
 * ILA3_AUDIT_DIR.
 *
 * Launched by `reply-role-migration-realdb.test.ts` through `tsx`; skipped without
 * P6_REALDB_URL.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const url = process.env.P6_REALDB_URL
assert.ok(url, 'P6_REALDB_URL is required')

const parsed = new URL(url)
const pg = {
  host: parsed.hostname,
  port: parsed.port || '5432',
  user: decodeURIComponent(parsed.username || 'postgres'),
  password: decodeURIComponent(parsed.password || ''),
  database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
}

const repo = process.cwd()
const work = fs.mkdtempSync(path.join(os.tmpdir(), 's85-drill-'))
const releaseDir = path.join(work, 'release', 'current')
const auditDir = path.join(work, 'audit')
fs.mkdirSync(releaseDir, { recursive: true })
fs.mkdirSync(auditDir, { recursive: true })
fs.writeFileSync(
  path.join(releaseDir, '.env'),
  [
    `POSTGRES_HOST=${pg.host}`,
    `POSTGRES_PORT=${pg.port}`,
    `POSTGRES_USER=${pg.user}`,
    `POSTGRES_PASSWORD=${pg.password}`,
    `POSTGRES_DB=${pg.database}`,
    '',
  ].join('\n'),
)

const psqlEnv = { ...process.env, PGPASSWORD: pg.password }
function query(statement: string): string {
  return execFileSync('psql', [url!, '-v', 'ON_ERROR_STOP=1', '-tAc', statement], {
    encoding: 'utf8',
    env: psqlEnv,
  }).trim()
}
function queryJson<T>(statement: string): T {
  return JSON.parse(query(statement) || 'null') as T
}

const tenantA = '5f0f0f0f-0000-4000-8000-000000000201'
const tenantB = '5f0f0f0f-0000-4000-8000-000000000202'
const REPLY = 'communications.reply'
const LEGACY = 'communication_channels.connect_user_channel'

function runScript(args: string[], extraEnv: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [path.join(repo, 'scripts/crm-reply-role-migration.mjs'), ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      ILA3_RELEASE_ROOT: path.join(work, 'release'),
      ILA3_AUDIT_DIR: auditDir,
      ...extraEnv,
    },
  })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function jsonOf(output: string): Record<string, unknown> {
  const end = output.lastIndexOf('}')
  assert.ok(end >= 0, `expected JSON in output, got: ${output}`)
  return JSON.parse(output.slice(0, end + 1)) as Record<string, unknown>
}

type RoleState = { role: string; features: string[] }

function rolesOf(tenantId: string): Map<string, string[]> {
  const rows = queryJson<RoleState[]>(`
    select coalesce(json_agg(json_build_object('role', r.name, 'features', ra.features_json)), '[]'::json)
    from roles r join role_acls ra on ra.role_id = r.id
    where r.tenant_id = '${tenantId}'`)
  return new Map(rows.map((row) => [row.role, row.features]))
}

try {
  query(`
    create table roles(id uuid primary key, tenant_id uuid not null, name text not null);
    create table role_acls(id uuid primary key, role_id uuid not null, features_json jsonb not null, updated_at timestamptz not null default now());
    insert into roles values
      ('11111111-1111-4111-8111-111111111111','${tenantA}','superadmin'),
      ('22222222-2222-4222-8222-222222222222','${tenantA}','admin'),
      ('33333333-3333-4333-8333-333333333333','${tenantA}','employee'),
      ('11111111-1111-4111-8111-111111111112','${tenantB}','superadmin'),
      ('22222222-2222-4222-8222-222222222223','${tenantB}','admin'),
      ('44444444-4444-4444-8444-444444444445','${tenantB}','manager'),
      ('33333333-3333-4333-8333-333333333334','${tenantB}','employee');
    insert into role_acls(id, role_id, features_json) values
      ('aaaaaaaa-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','["${REPLY}","${LEGACY}"]'),
      ('bbbbbbbb-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','["${REPLY}","${LEGACY}"]'),
      ('cccccccc-3333-4333-8333-333333333333','33333333-3333-4333-8333-333333333333','["${LEGACY}"]'),
      ('aaaaaaaa-1111-4111-8111-111111111112','11111111-1111-4111-8111-111111111112','["${REPLY}","${LEGACY}"]'),
      ('bbbbbbbb-2222-4222-8222-222222222223','22222222-2222-4222-8222-222222222223','["${REPLY}","${LEGACY}"]'),
      ('dddddddd-4444-4444-8444-444444444445','44444444-4444-4444-8444-444444444445','[]'),
      ('cccccccc-3333-4333-8333-333333333334','33333333-3333-4333-8333-333333333334','["${LEGACY}"]');
  `)

  // 1) read-only plan
  const check = runScript(['--check'])
  assert.equal(check.status, 0, check.stderr)
  const plan = jsonOf(check.stdout) as {
    mode: string
    tenants: { tenantId: string; changing: { role: string; grant: string[]; revoke: string[] }[]; unchanged: string[] }[]
    pendingTenants: number
  }
  assert.equal(plan.mode, 'check')
  const planA = plan.tenants.find((tenant) => tenant.tenantId === tenantA)
  assert.ok(planA, 'tenant A missing from the plan')
  const planEmployee = planA!.changing.find((change) => change.role === 'employee')
  assert.deepEqual(planEmployee, { role: 'employee', grant: [REPLY], revoke: [LEGACY] })
  assert.deepEqual(planA!.unchanged.sort(), ['admin', 'superadmin'])
  console.log('PASS check is read-only and plans exactly the employee grant + legacy revoke')

  // 2) two refusals, no writes
  const noFlag = runScript(['--apply', '--tenant', tenantA, '--approval', 'drill'])
  assert.equal(noFlag.status, 2)
  assert.match(noFlag.stderr, /refusing: --apply needs ILA3_ALLOW_ROLE_MIGRATION=1/)
  const unknownTenant = runScript(
    ['--apply', '--tenant', '99999999-9999-4999-8999-999999999999', '--approval', 'drill'],
    { ILA3_ALLOW_ROLE_MIGRATION: '1' },
  )
  assert.equal(unknownTenant.status, 2)
  assert.match(unknownTenant.stderr, /has no role_acls rows/)
  assert.equal(rolesOf(tenantA).get('employee')!.includes(LEGACY), true)
  console.log('PASS apply refuses without the safety flag or for an unknown tenant, leaving grants untouched')

  // 3) happy path
  const applied = runScript(['--apply', '--tenant', tenantA, '--approval', 'isolated drill'], {
    ILA3_ALLOW_ROLE_MIGRATION: '1',
  })
  assert.equal(applied.status, 0, applied.stderr)
  const appliedJson = jsonOf(applied.stdout) as { mode: string; changed: number; record: string }
  assert.equal(appliedJson.mode, 'apply')
  assert.equal(appliedJson.changed, 1)
  const recordPath = path.join(repo, appliedJson.record)
  assert.ok(fs.existsSync(recordPath), `audit record missing at ${recordPath}`)
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8')) as { rollbackSql: string[]; changes: unknown[] }
  assert.equal(record.changes.length, 1)
  assert.equal(record.rollbackSql.length, 1)
  let state = rolesOf(tenantA)
  assert.deepEqual([...state.get('employee')!].sort(), [REPLY])
  assert.deepEqual([...state.get('admin')!].sort(), [LEGACY, REPLY].sort())
  assert.deepEqual([...state.get('superadmin')!].sort(), [LEGACY, REPLY].sort())
  console.log('PASS apply commits the grant + revoke in one batch and writes the rollback SQL')

  // 4) idempotency
  const again = runScript(['--apply', '--tenant', tenantA, '--approval', 'isolated drill'], {
    ILA3_ALLOW_ROLE_MIGRATION: '1',
  })
  assert.equal(again.status, 0, again.stderr)
  const againJson = jsonOf(again.stdout) as { changed: number }
  assert.equal(againJson.changed, 0)
  console.log('PASS a second apply is a no-op')

  // 5) verification abort: manager missing the legacy grant fails the post-condition
  const failing = runScript(['--apply', '--tenant', tenantB, '--approval', 'isolated drill'], {
    ILA3_ALLOW_ROLE_MIGRATION: '1',
  })
  assert.equal(failing.status, 4, failing.stderr)
  assert.match(failing.stderr, /verify failed: a supervisor role lost communication_channels\.connect_user_channel/)
  const stateB = rolesOf(tenantB)
  assert.deepEqual([...stateB.get('employee')!], [LEGACY], 'employee must be unchanged after the aborted batch')
  assert.deepEqual([...stateB.get('manager')!], [], 'manager must be unchanged after the aborted batch')
  console.log('PASS the in-transaction verification aborts and rolls back the whole batch')

  // 6) rollback SQL
  fs.writeFileSync(path.join(work, 'rollback.sql'), `${record.rollbackSql.join('\n')}\n`)
  execFileSync('psql', [url!, '-v', 'ON_ERROR_STOP=1', '-f', path.join(work, 'rollback.sql')], {
    encoding: 'utf8',
    env: psqlEnv,
  })
  state = rolesOf(tenantA)
  assert.deepEqual([...state.get('employee')!], [LEGACY])
  console.log('PASS the recorded rollback SQL restores the pre-migration grants')

  console.log('reply-role-migration realdb: all scenarios passed')
} finally {
  fs.rmSync(work, { recursive: true, force: true })
}
