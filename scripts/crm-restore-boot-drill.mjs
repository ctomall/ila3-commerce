#!/usr/bin/env node
/**
 * Restore-and-boot drill: does the daily backup produce a system that actually serves?
 *
 * `crm-restore-drill` proves the archive restores the same schema and rows. It does not
 * prove the restored data can *boot the app*: a backup missing a table the ORM touches
 * would still compare equal if the probe tables matched. This drill restores the newest
 * dump into a throwaway database, starts the release's own Next server against it on a
 * spare port, logs in, and reads the customer list through the HTTP API.
 *
 * Safety: scratch DB must match /^om_restore_boot_/ and differ from the source; the
 * production app on :3000 is never touched; the child is killed by its own pid; the
 * database is dropped in `finally` unless --keep.
 *
 * Usage: node scripts/crm-restore-boot-drill.mjs [--backup-dir DIR] [--db open_mercato]
 *        [--port 3600] [--keep]
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}
const BACKUP_DIR = arg('--backup-dir', process.env.ILA3_BACKUP_DIR ?? '/storage/backup/postgres')
const SOURCE_DB = arg('--db', 'open_mercato')
const requestedPort = Number(arg('--port', '0'))
function portInUse(port) {
  const out = spawnSync('ss', ['-ltn'], { encoding: 'utf8' })
  return (out.stdout || '').split('\n').some((line) => new RegExp(`[:.]${port}\\s`).test(line))
}
const PORT = requestedPort > 0 && !portInUse(requestedPort)
  ? requestedPort
  : (() => { for (let port = 3600; port < 3700; port += 1) if (!portInUse(port)) return port; throw new Error('no free port in 3600-3699') })()
const KEEP = process.argv.includes('--keep')
const RELEASE_ROOT = process.env.ILA3_RELEASE_ROOT ?? '/home/pro/releases/mercato'
const CURRENT = path.join(RELEASE_ROOT, 'current')
const BASE = `http://127.0.0.1:${PORT}`

const latest = fs
  .readdirSync(BACKUP_DIR)
  .filter((name) => name.startsWith(`${SOURCE_DB}-`) && name.endsWith('.dump'))
  .map((name) => ({ name, file: path.join(BACKUP_DIR, name), mtime: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)[0]
if (!latest) {
  console.error(`no backup for ${SOURCE_DB} in ${BACKUP_DIR}`)
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const SCRATCH = `om_restore_boot_${stamp}`
if (!/^om_restore_boot_/.test(SCRATCH) || SCRATCH === SOURCE_DB) throw new Error('refusing scratch database name')

function pg(args, input) {
  return spawnSync('sudo', ['-n', '-u', 'postgres', ...args], { encoding: 'utf8', input })
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const summary = { drill: 'restore-boot', sourceDb: SOURCE_DB, backup: latest.file, scratchDb: SCRATCH, port: PORT, steps: {} }
let child = null
let created = false
try {
  const mk = pg(['createdb', '-O', 'postgres', SCRATCH])
  if (mk.status !== 0) throw new Error(`createdb failed: ${mk.stderr}`)
  created = true
  const restore = pg(['pg_restore', '--no-owner', '--no-privileges', '-d', SCRATCH, latest.file])
  summary.steps.restore = { status: restore.status, stderr: (restore.stderr || '').slice(0, 300) }

  // Reuse the release's own credentials, swapping only the database name: a URL without
  // a password makes pg attempt SCRAM with an empty string and login dies with
  // "client password must be a string" (2026-11-10).
  const envFile = fs.readFileSync(path.join(CURRENT, '.env'), 'utf8')
  const envValue = (key) => {
    const line = envFile.split('\n').find((l) => l.startsWith(`${key}=`))
    return line ? line.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, '') : null
  }
  const sourceUrl = envValue('DATABASE_URL')
  const scratchUrl = sourceUrl
    ? sourceUrl.replace(/\/[^/]+$/, `/${SCRATCH}`)
    : `postgres://${envValue('POSTGRES_USER')}:${envValue('POSTGRES_PASSWORD')}@127.0.0.1:5432/${SCRATCH}`
  // The archive is restored as postgres, so the app role needs explicit grants or login
  // dies with 'permission denied for table users' (2026-11-10).
  const appUser = envValue('POSTGRES_USER')
  if (appUser) {
    const grant = pg(['psql', '-d', SCRATCH, '-v', 'ON_ERROR_STOP=1', '-c',
      `grant usage on schema public to ${appUser}; grant all on all tables in schema public to ${appUser}; grant all on all sequences in schema public to ${appUser};`])
    summary.steps.grant = { ok: grant.status === 0, stderr: (grant.stderr || '').slice(0, 200) }
  }

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PORT),
    POSTGRES_DB: SCRATCH,
    DATABASE_URL: scratchUrl,
    HOSTNAME: '127.0.0.1',
  }
  const nextBin = path.join(CURRENT, 'node_modules', 'next', 'dist', 'bin', 'next')
  child = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT), '-H', '127.0.0.1'], {
    cwd: CURRENT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  let log = ''
  child.stdout.on('data', (chunk) => { log += chunk.toString('utf8') })
  child.stderr.on('data', (chunk) => { log += chunk.toString('utf8') })

  const deadline = Date.now() + 90000
  let up = false
  while (Date.now() < deadline) {
    const probe = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(3000) }).catch(() => null)
    if (probe?.ok) { up = true; break }
    if (child.exitCode !== null) break
    await sleep(1500)
  }
  summary.steps.boot = { up, exitCode: child.exitCode, logTail: log.slice(-1500) }
  if (!up) throw new Error(`restored app did not answer /login on :${PORT}`)

  const creds = fs.readFileSync('/home/pro/.ila3-admin-credentials', 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/)).find((p) => p[0] === 'employee')
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: creds[1], password: creds[2] }).toString(),
  })
  const loginBody = await login.text().catch(() => '')
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  summary.steps.login = { status: login.status, cookie: Boolean(cookie), body: loginBody.slice(0, 300) }
  fs.writeFileSync('/tmp/restore-boot-child.log', log)

  const list = await fetch(`${BASE}/api/customers/companies`, { headers: { cookie } })
  const body = await list.json().catch(() => null)
  const items = Array.isArray(body?.items) ? body.items.length : null
  summary.steps.readCustomers = { status: list.status, items }
  summary.passed = login.status === 200 && list.status === 200 && (items ?? 0) > 0
} catch (error) {
  summary.error = String(error?.message ?? error)
  summary.passed = false
} finally {
  if (child?.pid) {
    try { process.kill(-child.pid, 'SIGTERM') } catch { try { child.kill('SIGTERM') } catch { /* gone */ } }
  }
  if (created && !KEEP) {
    const dropped = pg(['dropdb', '--if-exists', SCRATCH])
    summary.steps.drop = { ok: dropped.status === 0 }
  }
  summary.finishedAt = new Date().toISOString()
}

console.log(JSON.stringify(summary, null, 2))
process.exit(summary.passed ? 0 : 1)
