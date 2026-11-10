#!/usr/bin/env node
/**
 * Restore drill for the daily database backup.
 *
 * The backup timer has run for days, but nothing ever proved a dump can be restored.
 * This restores the newest logical backup into a THROWAWAY database, compares row
 * counts with production, and asserts production was not touched.
 *
 * Safety guards (hard failures):
 *  - the scratch database name must start with `om_drill_` and differ from the source;
 *  - the source database is never written, only counted, before and after;
 *  - the scratch database is dropped in `finally` unless --keep is passed.
 *
 * Usage:
 *   node scripts/crm-backup-restore-drill.mjs [--backup-dir /storage/backup/postgres]
 *        [--db open_mercato] [--keep]
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

const BACKUP_DIR = arg('--backup-dir', process.env.ILA3_BACKUP_DIR ?? '/storage/backup/postgres')
const SOURCE_DB = arg('--db', process.env.POSTGRES_DB ?? 'open_mercato')
const KEEP = process.argv.includes('--keep')
const TABLES = ['users', 'roles', 'role_acls', 'messages', 'customer_interactions', 'customer_activities']

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })
  return { ok: result.status === 0, status: result.status, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim() }
}

function asPostgres(args, options = {}) {
  return run('sudo', ['-n', '-u', 'postgres', ...args], options)
}

function countRows(database, table) {
  // Read-only counts, always through the postgres superuser: the app role has no
  // peer login on this host, and the drill must not depend on .env credentials.
  const sql = `select count(*) from ${table}`
  const result = asPostgres(['psql', '-d', database, '-tAc', sql])
  if (!result.ok) return null
  const value = Number(result.stdout)
  return Number.isFinite(value) ? value : null
}

function snapshot(database) {
  const counts = {}
  for (const table of TABLES) counts[table] = countRows(database, table)
  return counts
}

const backups = fs
  .readdirSync(BACKUP_DIR)
  .filter((name) => name.startsWith(`${SOURCE_DB}-`) && name.endsWith('.dump'))
  .map((name) => ({ name, file: path.join(BACKUP_DIR, name), mtime: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)

if (backups.length === 0) {
  console.error(`no backup found in ${BACKUP_DIR} for ${SOURCE_DB}`)
  process.exit(1)
}
const latest = backups[0]
const ageHours = (Date.now() - latest.mtime) / 36e5

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const SCRATCH_DB = `om_drill_restore_${stamp}`
if (!SCRATCH_DB.startsWith('om_drill_') || SCRATCH_DB === SOURCE_DB) {
  throw new Error('refusing to use a scratch database name without the om_drill_ prefix')
}

const summary = {
  drill: 'backup-restore',
  sourceDb: SOURCE_DB,
  backup: { file: latest.file, bytes: fs.statSync(latest.file).size, ageHours: Number(ageHours.toFixed(1)) },
  scratchDb: SCRATCH_DB,
  startedAt: new Date().toISOString(),
  steps: {},
}

let created = false
try {
  const listing = asPostgres(['pg_restore', '-l', latest.file])
  summary.steps.list = {
    ok: listing.ok,
    entries: listing.ok ? listing.stdout.split('\n').filter((line) => line && !line.startsWith(';')).length : 0,
    detail: listing.ok ? null : listing.stderr.slice(0, 200),
  }
  if (!listing.ok) throw new Error('pg_restore -l failed: the dump is not readable')

  summary.prodBefore = snapshot(SOURCE_DB)

  const created_ = asPostgres(['createdb', '-O', 'postgres', SCRATCH_DB])
  if (!created_.ok) throw new Error(`createdb failed: ${created_.stderr}`)
  created = true

  const restore = asPostgres(['pg_restore', '--no-owner', '--no-privileges', '-d', SCRATCH_DB, latest.file])
  // pg_restore reports non-zero for benign warnings (missing roles, comments); the row
  // comparison below is the real assertion, so the raw status is kept as evidence.
  summary.steps.restore = { ok: restore.ok, status: restore.status, stderr: restore.stderr.slice(0, 400) }

  const restored = snapshot(SCRATCH_DB)
  summary.restored = restored
  const prod = summary.prodBefore
  summary.deltas = Object.fromEntries(
    TABLES.map((table) => [table, { prod, backup: restored[table], missing: prod[table] != null && restored[table] != null ? prod[table] - restored[table] : null }]),
  )

  // Production kept running since the dump, so the backup is allowed to be behind, never ahead.
  const monotonic = TABLES.every((table) => restored[table] != null && prod[table] != null && restored[table] <= prod[table])
  const nonEmpty = ['users', 'roles', 'customer_activities'].every((table) => (restored[table] ?? 0) > 0)

  summary.prodAfter = snapshot(SOURCE_DB)
  const untouched = TABLES.every((table) => summary.prodAfter[table] === summary.prodBefore[table])

  summary.checks = {
    backupReadable: listing.ok,
    restoreRan: restore.status === 0 || restore.status === 1,
    rowCountsAtMostProd: monotonic,
    coreTablesRestored: nonEmpty,
    productionUntouched: untouched,
    backupAgeHoursUnder48: ageHours < 48,
  }
  summary.passed = Object.values(summary.checks).every(Boolean)
} catch (error) {
  summary.error = String(error?.message ?? error)
  summary.passed = false
} finally {
  if (created && !KEEP) {
    const dropped = asPostgres(['dropdb', '--if-exists', SCRATCH_DB])
    summary.cleanup = { dropped: dropped.ok, kept: false }
  } else if (KEEP) {
    summary.cleanup = { dropped: false, kept: true }
  }
  summary.finishedAt = new Date().toISOString()
}

console.log(JSON.stringify(summary, null, 2))
process.exit(summary.passed ? 0 : 1)
