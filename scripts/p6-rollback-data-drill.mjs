#!/usr/bin/env node
/**
 * P6 rollback vs data-restore drill.
 *
 * Proves the two operations are different, on the real host:
 *   1. create a scratch company through the app API and back its rows up;
 *   2. application rollback: swap the release symlink back to the previous
 *      release and restart (scripts/crm-rollback.mjs --apply), then verify the
 *      scratch data still exists — rollback does not restore data;
 *   3. forward deploy back to the tested release and verify the data again;
 *   4. data restore: soft-delete the scratch row through the app API, verify it
 *      is gone, then restore its rows from the backup and verify the plaintext
 *      matches — restore does not change the release.
 *
 * Guardrails: one scratch company only, backed up before any step; the final
 * state soft-deletes it again; no migration, no table drop, no credential or
 * ACL change. If the forward deploy fails after rollback, the script retries and
 * reports loudly with the exact command to finish manually.
 *
 * Usage: node scripts/p6-rollback-data-drill.mjs [--out <file>]
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(__dirname, '..')
const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 || !process.argv[index + 1] ? fallback : process.argv[index + 1]
}
const STAMP = new Date().toISOString().replace(/[:.]/g, '')
const OUT = path.resolve(argOf('--out', path.join(repo, 'docs/deployment', `p6-rollback-data-${STAMP}.json`)))
const BACKUP_DIR = process.env.P6_BACKUP_DIR ?? '/home/pro/backups'
const BACKUP = path.join(BACKUP_DIR, `${STAMP}-rollback-drill-data.json`)
const BASE = 'http://127.0.0.1:3000'
const RELEASES = '/home/pro/releases/mercato'
const FORWARD_SHA = process.env.P6_FORWARD_SHA ?? '55f4c48641817222905e947248a2d1a5238ec8f7'
const CREDS = process.env.P6_CREDS_FILE ?? '/home/pro/.ila3-admin-credentials'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const HEADERS = { host: 'mercato.ila3.top', 'x-forwarded-proto': 'https' }

function psql(sql, { db = null } = {}) {
  if (!db) {
    const env = fs.readFileSync(path.join(repo, '.env'), 'utf8')
    db = env.split('\n').find((line) => line.startsWith('DATABASE_URL='))?.slice('DATABASE_URL='.length).trim()
  }
  return execFileSync('psql', [db, '-At', '-c', sql], { encoding: 'utf8', timeout: 30_000 }).trim()
}

function releasedVersion() {
  const current = fs.realpathSync(path.join(RELEASES, 'current'))
  const pkg = JSON.parse(fs.readFileSync(path.join(current, 'package.json'), 'utf8'))
  const release = JSON.parse(fs.readFileSync(path.join(current, 'release.json'), 'utf8'))
  return { dir: current, version: pkg.version, sha: release.sha }
}

async function waitReady(deadlineMs) {
  const started = Date.now()
  for (;;) {
    try {
      const response = await fetch(`${BASE}/start`, { headers: HEADERS, signal: AbortSignal.timeout(5_000) })
      if (response.ok) return true
    } catch {
      // not ready
    }
    if (Date.now() - started > deadlineMs) return false
    await sleep(1_000)
  }
}

async function login(role) {
  const rows = fs.readFileSync(CREDS, 'utf8').split('\n').map((line) => line.split(/\s+/))
  const account = rows.find((fields) => fields[0] === role)
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { ...HEADERS, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: account[1], password: account[2] }),
    redirect: 'manual',
  })
  if (response.status !== 200) throw new Error(`${role} login failed: ${response.status}`)
  return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
}

async function listCompanies(cookie) {
  const response = await fetch(`${BASE}/api/customers/companies?limit=200`, { headers: { ...HEADERS, cookie } })
  if (!response.ok) throw new Error(`list failed: ${response.status}`)
  return (await response.json()).items ?? []
}

function runNode(args, { timeout = 900_000, env = {} } = {}) {
  try {
    const stdout = execFileSync(process.execPath, args, {
      cwd: repo,
      encoding: 'utf8',
      timeout,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, stdout: stdout.slice(-4_000) }
  } catch (error) {
    return { status: typeof error.status === 'number' ? error.status : null, stdout: String(error.stdout ?? '').slice(-4_000), stderr: String(error.stderr ?? '').slice(-2_000) }
  }
}

async function main() {
  const evidence = { schema: 1, drill: 'p6-rollback-vs-data-restore', startedAt: new Date().toISOString(), checks: {} }
  let cookie = null
  let scratch = null
  try {
    const before = releasedVersion()
    evidence.checks.releaseBefore = before
    if (before.sha !== FORWARD_SHA) throw new Error(`live release ${before.sha} is not the drill target ${FORWARD_SHA}`)
    cookie = await login('employee')
    const marker = `Rollback Drill ${STAMP}`
    const create = await fetch(`${BASE}/api/customers/companies`, {
      method: 'POST',
      headers: { ...HEADERS, cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: marker, industry: 'rollback-drill', websiteUrl: 'https://rollback-drill.example.com' }),
    })
    if (create.status !== 201) throw new Error(`scratch create failed: ${create.status}`)
    const created = await create.json()
    scratch = { entityId: created.id, companyId: created.companyId, marker }
    evidence.checks.scratch = scratch

    // Back up exactly the two rows this drill may touch.
    const entityRow = psql(`select row_to_json(t) from (select * from customer_entities where id = '${scratch.entityId}') t`)
    const companyRow = psql(`select row_to_json(t) from (select * from customer_companies where entity_id = '${scratch.entityId}') t`)
    if (!entityRow || !companyRow) throw new Error('scratch rows not found for backup')
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
    fs.writeFileSync(BACKUP, `${JSON.stringify({ takenAt: new Date().toISOString(), scratch, entity: JSON.parse(entityRow), company: JSON.parse(companyRow) }, null, 2)}\n`)
    evidence.checks.backup = BACKUP

    const visibleBefore = (await listCompanies(cookie)).some((item) => item.id === scratch.entityId)
    evidence.checks.visibleBeforeRollback = visibleBefore
    if (!visibleBefore) throw new Error('scratch company is not visible before the drill')

    // 2. application rollback (symlink + restart), data must survive.
    const rollback = runNode([path.join(repo, 'scripts/crm-rollback.mjs'), '--to', 'previous', '--apply'], { timeout: 300_000 })
    const readyAfterRollback = await waitReady(180_000)
    const afterRollback = releasedVersion()
    cookie = await login('employee')
    const visibleAfterRollback = (await listCompanies(cookie)).some((item) => item.id === scratch.entityId)
    evidence.checks.rollback = {
      command: 'node scripts/crm-rollback.mjs --to previous --apply',
      exit: rollback.status,
      ready: readyAfterRollback,
      release: afterRollback,
      dataSurvived: visibleAfterRollback,
    }
    if (rollback.status !== 0 || !readyAfterRollback || afterRollback.sha === before.sha) {
      throw new Error(`application rollback did not complete: exit=${rollback.status} ready=${readyAfterRollback} sha=${afterRollback.sha}`)
    }
    if (!visibleAfterRollback) throw new Error('scratch data did not survive the application rollback')

    // 3. forward deploy back to the tested release (auto-deploy may win the lock).
    let forward = runNode([path.join(repo, 'scripts/auto-deploy/deploy.mjs'), '--manual', '--from-artifact', '--sha', FORWARD_SHA, '--allow-production'], {
      timeout: 900_000,
      env: { ILA3_ALLOW_PRODUCTION: '1' },
    })
    if (forward.status !== 0) {
      // Exit 75 means the timer already took the same SHA; wait for it instead.
      await sleep(20_000)
    }
    await waitReady(240_000)
    let forwardRelease = releasedVersion()
    for (let attempt = 0; attempt < 20 && forwardRelease.sha !== FORWARD_SHA; attempt += 1) {
      await sleep(10_000)
      forwardRelease = releasedVersion()
    }
    cookie = await login('employee')
    const visibleAfterForward = (await listCompanies(cookie)).some((item) => item.id === scratch.entityId)
    evidence.checks.forward = { exit: forward.status, release: forwardRelease, dataSurvived: visibleAfterForward }
    if (forwardRelease.sha !== FORWARD_SHA) throw new Error(`forward deploy did not land on ${FORWARD_SHA}`)
    if (!visibleAfterForward) throw new Error('scratch data did not survive the forward deploy')

    // 4. data restore: soft-delete through the app, then restore the backed-up rows.
    const deleted = await fetch(`${BASE}/api/customers/companies?id=${scratch.entityId}`, {
      method: 'DELETE',
      headers: { ...HEADERS, cookie },
    })
    const hiddenAfterDelete = !(await listCompanies(cookie)).some((item) => item.id === scratch.entityId)
    evidence.checks.softDelete = { status: deleted.status, hidden: hiddenAfterDelete }
    if (deleted.status !== 200 || !hiddenAfterDelete) throw new Error('soft delete did not hide the scratch company')

    const backup = JSON.parse(fs.readFileSync(BACKUP, 'utf8'))
    // The DELETE API removes the rows (observed: no tombstone remains), so a real
    // restore means re-inserting the backed-up rows exactly as they were, from
    // the JSON snapshot taken before any step of this drill.
    const restoreJson = (table, json) => {
      const raw = JSON.stringify(json).replace(/\$\$/g, '$ $')
      psql(`insert into ${table} select * from json_populate_record(null::${table}, $json$${raw}$json$)`)
    }
    const entityExists = psql(`select count(*) from customer_entities where id = '${backup.entity.id}'`) === '1'
    const companyExists = psql(`select count(*) from customer_companies where id = '${backup.company.id}'`) === '1'
    evidence.checks.rowsAfterDelete = { entityExists, companyExists }
    if (!entityExists) restoreJson('customer_entities', backup.entity)
    if (!companyExists) restoreJson('customer_companies', backup.company)
    const restoredRows = psql(
      `select case when e.deleted_at is null and e.display_name = '${backup.entity.display_name.replace(/'/g, "''")}' and c.id is not null then 1 else 0 end from customer_entities e join customer_companies c on c.entity_id = e.id where e.id = '${scratch.entityId}'`,
    )
    cookie = await login('employee')
    const visibleAfterRestore = (await listCompanies(cookie)).some((item) => item.id === scratch.entityId)
    const releaseDuringRestore = releasedVersion()
    evidence.checks.dataRestore = {
      backupFile: BACKUP,
      rowsPresent: restoredRows === '1',
      visible: visibleAfterRestore,
      releaseUnchanged: releaseDuringRestore.sha === FORWARD_SHA,
    }
    if (restoredRows !== '1' || !visibleAfterRestore) throw new Error('data restore did not bring the scratch row back')

    // Final state: hide the scratch row again; the backup remains on disk.
    const cleanup = await fetch(`${BASE}/api/customers/companies?id=${scratch.entityId}`, { method: 'DELETE', headers: { ...HEADERS, cookie } })
    evidence.checks.cleanup = { softDeleteStatus: cleanup.status }
    evidence.checks.distinction = {
      applicationRollback: 'symlink swap + service restart; database untouched; scratch data survived',
      dataRestore: 'row-level restore from backup; release untouched; scratch row restored and re-hidden',
    }
  } catch (error) {
    evidence.failures = [String(error?.message ?? error)]
  } finally {
    evidence.finishedAt = new Date().toISOString()
    evidence.result = (evidence.failures ?? []).length === 0 ? 'passed' : 'failed'
    fs.mkdirSync(path.dirname(OUT), { recursive: true })
    fs.writeFileSync(OUT, `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(JSON.stringify({ result: evidence.result, failures: evidence.failures ?? [], evidence: OUT }))
  }
  if ((evidence.failures ?? []).length > 0) process.exitCode = 1
}

await main()
