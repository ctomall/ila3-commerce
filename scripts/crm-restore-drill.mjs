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
 * database reproduces the source's *structure* (4076 column facts, 1027 index
 * definitions, 3005 constraint facts, 53 sequences, triggers and views) and the
 * *contents* of the probe tables (row count plus a full-row digest — a restore that
 * keeps the count but changes a value used to pass).
 *
 * The structural comparator is a module (`scripts/lib/catalog-digest.mjs`) and every run
 * first proves it can go red: two throwaway schemas with four deliberate differences
 * (extra index, extra column, dropped sequence, dropped foreign key) must be named.
 * A comparison nobody has seen fail is a comment.
 *
 * What it does NOT prove: point-in-time recovery (no WAL archiving), backup retention,
 * that a restore into a *different* PostgreSQL major version works, or that a CHECK
 * constraint's predicate text survived (the comparator compares its presence, name and
 * column set, because pg_dump's deparse round-trip rewrites equivalent expressions — a
 * text comparison reported a difference that did not exist).
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
import { catalogFacts, factsDigest, diffFacts, describeDiff, rowDigest } from './lib/catalog-digest.mjs'

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

/**
 * Negative control for the structural comparator.
 *
 * A comparison that has never been seen to fail is a comment. This builds two throwaway
 * schemas in the drill database, proves they compare equal, then introduces four known
 * differences one at a time (an extra index, an extra column, a dropped sequence, a
 * dropped foreign key) and requires each to be named. It runs on every drill, so the
 * comparator cannot quietly rot into always-equal.
 */
function selfTestComparator() {
  const A = 'om_selftest_a'
  const B = 'om_selftest_b'
  const psql = (sql) => sudoPsql(dbName, sql)
  const ddl = (s) => `
    create table ${s}.t(id serial primary key, v text not null, k int);
    create index t_k_idx on ${s}.t(k);
    create table ${s}.u(id int references ${s}.t(id));
    create sequence ${s}.seq;
    create view ${s}.v_t as select id, v from ${s}.t;
    create table ${s}.audit(id int);
    create function ${s}.touch() returns trigger language plpgsql as $$begin return new; end$$;
    create trigger t_touch before insert on ${s}.t for each row execute function ${s}.touch();`
  const seed = (s) => psql(`insert into ${s}.t(v, k) values ('a', 1), ('b', 2), ('c', 3)`)
  const clean = () => psql(`drop schema if exists ${A} cascade; drop schema if exists ${B} cascade`)
  const checks = []
  try {
    clean()
    psql(`create schema ${A}; create schema ${B}; ${ddl(A)} ${ddl(B)}`)
    const same = diffFacts(catalogFacts(psql, { schema: A }), catalogFacts(psql, { schema: B }))
    checks.push(['两个相同 schema 必须比出 0 处差异', same.total === 0])
    // Content, not just structure. The drill's central claim is that a restore which keeps
    // the row count but changes a value is caught; that claim had never been exercised by
    // the self-test, only by a one-off hand run (audit finding A-P1-2).
    seed(A)
    seed(B)
    const sameRows = [rowDigest(psql, `${A}.t`, { maxRows: 10 }), rowDigest(psql, `${B}.t`, { maxRows: 10 })]
    checks.push([
      '相同数据的内容摘要必须相同',
      sameRows[0].digest !== null && sameRows[0].digest === sameRows[1].digest && sameRows[0].rows === 3,
    ])
    psql(`update ${B}.t set v = 'tampered' where k = 2`)
    const tamperedRows = rowDigest(psql, `${B}.t`, { maxRows: 10 })
    checks.push(['改一行但行数不变 → 内容摘要必须不同', tamperedRows.rows === 3 && tamperedRows.digest !== sameRows[0].digest])
    if (tamperedRows.rows !== 3 || tamperedRows.digest === sameRows[0].digest) {
      console.log(`   self-test detail: 行数 ${tamperedRows.rows}，摘要 ${String(tamperedRows.digest).slice(0, 12)} vs ${String(sameRows[0].digest).slice(0, 12)}`)
    }
    psql(`delete from ${B}.t where k = 3`)
    const shorterRows = rowDigest(psql, `${B}.t`, { maxRows: 10 })
    checks.push(['删一行 → 行数必须不同', shorterRows.rows === 2])
    // Only now mutate the structure: a column added below would change `t::text` and
    // make the identical-data digest comparison fail for the wrong reason.

    const mutations = [
      ['多加一个索引', `create index t_extra on ${B}.t(k)`, 'indexes'],
      ['多出一列', `alter table ${B}.t add column c text`, 'columns'],
      ['丢掉序列', `drop sequence ${B}.seq`, 'sequences'],
      ['丢掉外键', `alter table ${B}.u drop constraint u_id_fkey`, 'constraints'],
      ['丢掉视图', `drop view ${B}.v_t`, 'views'],
      ['丢掉触发器', `drop trigger t_touch on ${B}.t`, 'triggers'],
    ]
    for (const [label, sql, kind] of mutations) {
      psql(sql)
      const diff = diffFacts(catalogFacts(psql, { schema: A }), catalogFacts(psql, { schema: B }))
      const named = Boolean(diff.diffs[kind]) && diff.total > 0
      checks.push([`${label} → 必须点名 ${kind}`, named])
      if (!named) console.log(`   self-test detail: ${label} 的差异被漏掉了：${JSON.stringify(diff)}`)
    }
  } finally {
    try {
      clean()
    } catch {}
  }
  const bad = checks.filter(([, ok]) => !ok)
  if (bad.length > 0) fail('self-test', `比对器的反向自证失败：${bad.map(([label]) => label).join('; ')}`)
  record(
    'self-test',
    true,
    `${checks.length} 项反向自证通过（结构：多索引/多列/丢序列/丢外键/丢视图/丢触发器各自被点名；内容：相同→同摘要、改一行→摘要变、删一行→行数变）`,
  )
}

/**
 * The tables whose contents must survive a restore. Stable, non-empty, business-real.
 * Each is compared by row count AND by a full-row digest: a restore that keeps the
 * count but changes a value passes a count-only check, and that is exactly the failure
 * a restore drill exists to catch.
 */
const PROBES = [
  'tenants',
  'users',
  'dictionaries',
  'dictionary_entries',
  'sales_quotes',
  'mikro_orm_migrations_sales',
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

  const sourceBefore = `${count(srcDb, `select count(*) from information_schema.tables where table_schema='public'`)}|${count(srcDb, `select count(*) from users`)}`
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
  // Prove the comparator can go red before trusting its green.
  selfTestComparator()
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
    // Filter line by line. Matching one benign word against the whole stderr let a real
    // error ride along with an `unaccent` complaint and vanish (audit finding A-P2-8).
    const lines = (restore.stderr || '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
    const benign = (line) => /extension "unaccent" is not available|text search (parser|configuration|dictionary)|skipping/i.test(line)
    const residual = lines.filter((line) => !benign(line) && /error/i.test(line))
    if (residual.length > 0) fail('restore', `pg_restore failed: ${residual.slice(0, 3).join(' | ').slice(0, 400)}`)
    record('restore.warning', true, `pg_restore exited ${restore.status} with only ignored text-search/extensions complaints: ${lines[0]?.slice(0, 120) ?? ''}`)
  }
  record('restore', true, `restored in ${restoreMs} ms`)

  // ---- 3. the restored copy must match the source
  const srcTables = count(srcDb, `select count(*) from information_schema.tables where table_schema='public'`)
  const dstTables = count(dbName, `select count(*) from information_schema.tables where table_schema='public'`)
  if (srcTables !== dstTables) fail('compare.tables', `${dstTables} tables restored vs ${srcTables} in the source`)
  record('compare.tables', true, `${dstTables} tables restored, identical count`)

  // Same table names are not the same schema: indexes, constraints, sequences, triggers
  // and views can all be gone while every table still exists. Hash the definitions.
  const srcFacts = catalogFacts((sql) => sudoPsql(srcDb, sql))
  const dstFacts = catalogFacts((sql) => sudoPsql(dbName, sql))
  const structural = diffFacts(srcFacts, dstFacts)
  if (structural.total > 0) fail('compare.catalog', `恢复后的结构与源库不一致 — ${describeDiff(structural.diffs)}`)
  const dstSum = factsDigest(dstFacts)
  record(
    'compare.catalog',
    true,
    `${Object.entries(dstSum.counts)
      .map(([kind, n]) => `${kind} ${n}`)
      .join(' / ')}；定义摘要 ${dstSum.digest.slice(0, 12)} 与源库一致`,
  )

  const mismatches = []
  for (const table of PROBES) {
    const before = rowDigest((sql) => sudoPsql(srcDb, sql), table)
    const after = rowDigest((sql) => sudoPsql(dbName, sql), table)
    if (before.digest === null || after.digest === null) {
      mismatches.push(`${table}: ${before.skipped ?? after.skipped}`)
    } else if (before.rows !== after.rows) {
      mismatches.push(`${table}: ${before.rows} -> ${after.rows} 行`)
    } else if (before.rows === 0) {
      mismatches.push(`${table}: 两侧都是 0 行，这条探针什么也没证明`)
    } else if (before.digest !== after.digest) {
      mismatches.push(`${table}: 行数相同（${before.rows}）但整表内容摘要不同`)
    }
  }
  if (mismatches.length > 0) fail('compare.rows', mismatches.join(' | '))
  record('compare.rows', true, `${PROBES.length} 张表的行数与整表内容摘要都一致（值级比对，不只比计数）`)

  // The bookkeeping table proves the *content* survived, not just the schema.
  const migrationRows = count(dbName, 'select count(*) from mikro_orm_migrations_sales')
  record('compare.bookkeeping', migrationRows > 0, `${migrationRows} migration bookkeeping rows survived`)

  // One line that states both halves. The gate's evidence row quotes a single line, and
  // "结构一致" alone read stronger than what that one line showed (audit finding B-P2).
  record(
    'summary',
    true,
    `结构 ${dstSum.counts.columns} 列 / ${dstSum.counts.indexes} 索引 / ${dstSum.counts.constraints} 约束 / ${dstSum.counts.sequences} 序列 与源库一致；${PROBES.length} 张探针表行数与整表内容摘要均一致`,
  )

  // Compare, do not announce: this used to record(true) unconditionally, so it was a line
  // of text rather than a check.
  const sourceAfter = `${srcTables}|${count(srcDb, `select count(*) from users`)}`
  record(
    'source.guard',
    sourceAfter === sourceBefore,
    sourceAfter === sourceBefore
      ? `source unchanged (${sourceAfter}, read-only drill)`
      : `source MOVED during the drill: ${sourceBefore} -> ${sourceAfter}`,
  )
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
