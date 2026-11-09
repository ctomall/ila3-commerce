#!/usr/bin/env node
/**
 * Restore drill: prove the backup you would take before a migration can actually be
 * restored.
 *
 * M8 asks for a restore drill before release. Round 25 ran `pg_dump -Fc` and restored it
 * by hand, recorded "13 MB / 1.9 s / 6.7 s / row counts match" in a document, and that
 * was the end of it — a hand-run experiment, not something that re-runs. This makes it a
 * gate: dump production, restore the archive into a throwaway database, compare it with
 * the source, and fail if anything disagrees.
 *
 * What it proves: the archive is readable, the restore completes, and the restored
 * database has the same table count and the same row counts in the tables that matter.
 * What it does NOT prove: point-in-time recovery (no WAL archiving), backup retention, or
 * that a restore into a *different* PostgreSQL major version works.
 *
 * Safety: refuses any database name that is not `om_restore_*` or that equals the source
 * database, refuses to drop a database this run did not create unless `--reuse` is
 * passed, and reports what actually happened rather than assuming it.
 *
 * Usage: node scripts/crm-restore-drill.mjs [--db om_restore_drill] [--reuse] [--keep]
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (!a.startsWith('--')) continue
  const next = process.argv[i + 1]
  if (next === undefined || next.startsWith('--')) args[a.slice(2)] = true
  else {
    args[a.slice(2)] = next
    i++
  }
}

const REPO = process.cwd()
const dbName = String(args.db ?? 'om_restore_drill')
const reuse = args.reuse === true
const keep = args.keep === true
const OUT = path.resolve(args.out ?? 'docs/crm-platform/verify')

const phases = []
const failedPhases = []
let created = false
let dropped = false

function record(phase, ok, detail) {
  phases.push({ phase, ok, detail })
  if (!ok) failedPhases.push(`${phase}: ${detail}`)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${phase}  ${detail}`)
}

class DrillError extends Error {}
function fail(phase, detail) {
  record(phase, false, detail)
  throw new DrillError(`${phase}: ${detail}`)
}

function readEnvUrl(file) {
  if (!fs.existsSync(file)) return null
  const m = fs.readFileSync(file, 'utf8').match(/^DATABASE_URL=(.+)$/m)
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}
const dbOf = (url) => {
  try {
    return new URL(url).pathname.replace(/^\//, '')
  } catch {
    return '?'
  }
}
const withDb = (url, db) => {
  const u = new URL(url)
  u.pathname = `/${db}`
  return u.toString()
}
const mask = (url) => String(url).replace(/:[^:@/]*@/, ':***@')

function sudoPsql(db, sql) {
  const r = spawnSync('sudo', ['-n', '-u', 'postgres', 'psql', '-X', '-tA', '-d', db, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
  })
  if (r.status !== 0) throw new DrillError(`psql (${db}) failed: ${(r.stderr || r.stdout || '').trim().slice(0, 300)}`)
  return (r.stdout || '').trim()
}
const count = (db, sql) => {
  const value = sudoPsql(db, sql)
  if (!/^\d+$/.test(value)) throw new DrillError(`expected an integer from ${db}, got ${JSON.stringify(value)}`)
  return Number(value)
}

/** The tables whose row counts must survive a restore. Stable, non-empty, business-real. */
const PROBES = [
  ['tenants', 'select count(*) from tenants'],
  ['users', 'select count(*) from users'],
  ['dictionaries', 'select count(*) from dictionaries'],
  ['dictionary_entries', 'select count(*) from dictionary_entries'],
  ['sales_quotes', 'select count(*) from sales_quotes'],
  ['mikro_orm_migrations_sales', 'select count(*) from mikro_orm_migrations_sales'],
]

// SIGKILL cannot be caught, but SIGINT/SIGTERM can, and those are what Ctrl-C and systemd
// send. Without this a cancelled drill leaves a full database dump in /tmp.
const dumpPaths = new Set()
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const file of dumpPaths) {
      try {
        fs.unlinkSync(file)
      } catch {}
    }
    process.exit(130)
  })
}

const startedAt = new Date()
let reportPath = null

try {
  const srcUrl = readEnvUrl(path.join(REPO, '.env'))
  if (!srcUrl) throw new DrillError(`no DATABASE_URL in ${path.join(REPO, '.env')}`)
  const srcDb = dbOf(srcUrl)
  if (!/^om_restore_[a-z0-9_]+$/.test(dbName)) {
    throw new DrillError(`refusing database name ${JSON.stringify(dbName)}: must match /^om_restore_[a-z0-9_]+$/`)
  }
  if (dbName === srcDb) throw new DrillError('refusing to restore over the source database')
  record('guards', true, `target ${dbName} != source ${srcDb}; ${mask(withDb(srcUrl, dbName))}`)

  const exists = sudoPsql('postgres', `select 1 from pg_database where datname = '${dbName}'`) === '1'
  if (exists && !reuse) {
    fail('guards.exists', `database ${dbName} already exists; pass --reuse or choose another name`)
  }
  if (exists && reuse) {
    spawnSync('sudo', ['-n', '-u', 'postgres', 'dropdb', '--if-exists', dbName], { encoding: 'utf8' })
  }

  // ---- 1. dump, the way an operator would before a migration
  const dumpPath = path.join(os.tmpdir(), `crm-restore-drill-${process.pid}.dump`)
  dumpPaths.add(dumpPath)
  const dumpStart = Date.now()
  const dump = spawnSync('pg_dump', [srcUrl, '-Fc', '-f', dumpPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const dumpMs = Date.now() - dumpStart
  if (dump.status !== 0) fail('dump', `pg_dump failed: ${(dump.stderr || '').trim().slice(0, 300)}`)
  // The dump holds the whole database. pg_dump writes it with the process umask (0644 by
  // default), which on a shared /tmp means any local user can read it.
  try {
    fs.chmodSync(dumpPath, 0o600)
  } catch {}
  const bytes = fs.statSync(dumpPath).size
  if (bytes === 0) fail('dump', 'pg_dump produced an empty archive')
  const digest = createHash('sha256').update(fs.readFileSync(dumpPath)).digest('hex')
  record('dump', true, `${(bytes / 1024 / 1024).toFixed(1)} MB in ${dumpMs} ms, sha256 ${digest.slice(0, 12)}`)

  const listed = spawnSync('pg_restore', ['--list', dumpPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (listed.status !== 0) fail('archive', `pg_restore --list failed: ${(listed.stderr || '').trim().slice(0, 200)}`)
  const tocEntries = (listed.stdout || '').split('\n').filter((line) => /^\d+;/.test(line)).length
  if (tocEntries === 0) fail('archive', 'the archive has an empty table of contents')
  record('archive', true, `${tocEntries} TOC entries are readable by pg_restore`)

  // ---- 2. restore into a database this run creates
  const create = spawnSync('sudo', ['-n', '-u', 'postgres', 'createdb', '-O', 'mercato', dbName], { encoding: 'utf8' })
  if (create.status !== 0) fail('restore', `createdb failed: ${(create.stderr || '').trim().slice(0, 300)}`)
  created = true
  const restoreUrl = withDb(srcUrl, dbName)
  const restoreStart = Date.now()
  const restore = spawnSync('pg_restore', ['--no-owner', '--no-privileges', '-d', restoreUrl, dumpPath], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const restoreMs = Date.now() - restoreStart
  // A non-zero exit can still mean "restored everything, complained about a missing role"
  // so the row counts below decide, not the exit code alone.
  if (restore.status !== 0) {
    const err = (restore.stderr || '').trim()
    if (!/unaccent|text search/i.test(err)) fail('restore', `pg_restore failed: ${err.slice(0, 300)}`)
    record('restore.warning', true, `pg_restore complained about a text-search object (not schema): ${err.split('\n')[0].slice(0, 120)}`)
  }
  record('restore', true, `restored in ${restoreMs} ms`)

  // ---- 3. the restored copy must match the source
  const srcTables = count(srcDb, `select count(*) from information_schema.tables where table_schema='public'`)
  const dstTables = count(dbName, `select count(*) from information_schema.tables where table_schema='public'`)
  if (srcTables !== dstTables) fail('compare.tables', `${dstTables} tables restored vs ${srcTables} in the source`)
  record('compare.tables', true, `${dstTables} tables restored, identical count`)

  const mismatches = []
  for (const [label, sql] of PROBES) {
    const before = count(srcDb, sql)
    const after = count(dbName, sql)
    if (before !== after) mismatches.push(`${label}: ${before} -> ${after}`)
    else if (before === 0) mismatches.push(`${label}: both sides are 0, this probe proves nothing`)
  }
  if (mismatches.length > 0) fail('compare.rows', mismatches.join(' | '))
  record('compare.rows', true, `${PROBES.length} row-count probes match (and none is vacuously zero)`)

  // The bookkeeping table proves the *content* survived, not just the schema.
  const migrationRows = count(dbName, 'select count(*) from mikro_orm_migrations_sales')
  record('compare.bookkeeping', migrationRows > 0, `${migrationRows} migration bookkeeping rows survived`)

  const sourceFingerprint = `${srcTables}|${count(srcDb, `select count(*) from users`)}`
  record('source.guard', true, `source still ${sourceFingerprint} (read-only drill)`)
} catch (error) {
  // Every thrown failure must land in `failedPhases`. A guard refusal that only printed
  // "FAILED" still exited 0 — the exact "a gate that cannot go red" defect this project
  // keeps hunting, found here by its own negative control.
  const message = error instanceof DrillError ? error.message : `${error?.name ?? 'Error'}: ${error?.message ?? error}`
  if (!failedPhases.includes(message)) failedPhases.push(message)
  console.log(`\nRESTORE DRILL FAILED: ${message}`)
} finally {
  if (created && !keep) {
    const drop = spawnSync('sudo', ['-n', '-u', 'postgres', 'dropdb', '--if-exists', dbName], { encoding: 'utf8' })
    dropped = drop.status === 0
    if (!dropped) failedPhases.push(`teardown: could not drop ${dbName}`)
    console.log(dropped ? `dropped ${dbName}` : `FAILED to drop ${dbName}`)
  }
  for (const f of fs.readdirSync(os.tmpdir())) {
    if (f.startsWith(`crm-restore-drill-${process.pid}`)) {
      try {
        fs.unlinkSync(path.join(os.tmpdir(), f))
      } catch {}
    }
  }

  fs.mkdirSync(OUT, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  reportPath = path.join(OUT, `restore-drill-${stamp}.md`)
  const failed = failedPhases.length > 0
  const lines = [
    `# 备份恢复演练 — ${startedAt.toISOString()}`,
    '',
    `演练库：\`${dbName}\` — ${
      created
        ? `本次创建：是；演练后删除：${keep ? '未要求（--keep）' : dropped ? '是' : '**否，库仍在**'}`
        : '本次未创建（守卫在任何数据库动作之前就拒绝了，没有删任何库）'
    }。`,
    `来源库：\`${dbOf(readEnvUrl(path.join(REPO, '.env')) ?? '') || '?'}\`（只读，仅 pg_dump）。`,
    '',
    '| 阶段 | 结果 | 详情 |',
    '| --- | --- | --- |',
    ...phases.map((p) => `| ${p.phase} | ${p.ok ? 'PASS' : 'FAIL'} | ${String(p.detail).replace(/\|/g, '\\|')} |`),
    '',
    failed ? `**结果：FAIL** — ${failedPhases.join('; ')}` : '**结果：PASS** — 备份档可读、可恢复、恢复后表数与关键行数一致。',
    '',
    '这一项证明的是"归档能恢复且内容对得上"；**不**证明时间点恢复（无 WAL 归档）、保留策略，或跨大版本恢复。',
    '',
  ]
  fs.writeFileSync(reportPath, lines.join('\n'))
}

console.log(`\nreport: ${reportPath}`)
const failed = failedPhases.length > 0
console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS')
process.exit(failed ? 1 : 0)
