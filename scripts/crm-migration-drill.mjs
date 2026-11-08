#!/usr/bin/env node
/**
 * CRM leadgen migration drill.
 *
 * Applies the leadgen migration slices to a THROWAWAY database cloned from the
 * production schema, asserts the resulting schema, compares it against the
 * MikroORM snapshot (drift), then runs every `down()` and re-applies `up()` to
 * prove the slices are reversible. The production database is never written to.
 *
 * Why this exists: before this script the only evidence for the migration was
 * "up() created 16 tables inside a transaction that we rolled back". Nobody had
 * ever executed `down()`, nobody had compared the result with the entity
 * snapshot, and the CLI migration bookkeeping table for leadgen already existed
 * but was empty. Applying to production with that evidence would have been a bet.
 *
 * Usage (from the repo root):
 *   npx tsx scripts/crm-migration-drill.mjs
 *   npx tsx scripts/crm-migration-drill.mjs --cli-checkout /tmp/leadgen-drill
 *   npx tsx scripts/crm-migration-drill.mjs --keep      # leave the drill DB for inspection
 *
 * Safety guards (all hard failures, never warnings):
 *   - the drill database name must match /^om_drill_/ and must differ from the
 *     database in .env;
 *   - a --cli-checkout whose .env points anywhere but the drill database aborts;
 *   - the production database is fingerprinted before and after and must match.
 *
 * Requires: sudo -n -u postgres (to create/drop the scratch database), psql,
 * pg_dump. Exit code 1 if any phase fails.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const SNAPSHOT_TYPE_MAP = {
  'timestamp with time zone': 'timestamptz(6)',
  integer: 'int',
}

/**
 * Partial UNIQUE indexes that only exist as hand-written SQL in the migration.
 *
 * MikroORM 7.2.5 cannot express a `WHERE` clause on `@Index`/`@Unique` (its
 * `IndexOptions` has no such field), so these can never show up in the entity
 * snapshot and a naive drift comparison reports them as "unexpected". They are
 * not unexpected — they are the invariants that keep "one active binding per
 * employee", "one CRM write per candidate" and "one suppression per address"
 * true when the released/retired rows must keep their history.
 *
 * Every entry is asserted: it must exist, be UNIQUE, be non-primary, cover
 * exactly these columns and carry exactly this predicate. A hand-written index
 * that is not listed here fails the drill, so the exception list cannot silently
 * grow. `yarn mercato db generate` was verified against the applied schema and
 * reports "leadgen: no changes", so routine generation does not drop them.
 */
const PARTIAL_UNIQUE_INDEXES = [
  {
    table: 'leadgen_bot_bindings',
    name: 'leadgen_bot_bindings_active_unique',
    columns: 'tenant_id,organization_id,channel_id,external_identity',
    predicate: `state = 'active'`,
  },
  {
    table: 'leadgen_candidates',
    name: 'leadgen_candidates_crm_entity_unique',
    columns: 'tenant_id,organization_id,crm_entity_id',
    predicate: 'crm_entity_id is not null',
  },
  {
    table: 'leadgen_employee_bindings',
    name: 'leadgen_employee_bindings_active_unique',
    columns: 'tenant_id,organization_id,employee_id',
    predicate: `state = 'active'`,
  },
  {
    table: 'leadgen_suppressions',
    name: 'leadgen_suppressions_active_unique',
    columns: 'tenant_id,email_hash',
    predicate: 'released_at is null',
  },
]

const allowedIndexFor = (table, keyName) =>
  PARTIAL_UNIQUE_INDEXES.find((i) => i.table === table && i.name === keyName) ?? null

function normalizePredicate(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/::[a-z_ ]+/g, '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      out[key] = true
    } else {
      out[key] = next
      i++
    }
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const repo = path.resolve(args.repo ?? process.cwd())
const migrationsDir = path.resolve(
  args['migrations-dir'] ?? path.join(repo, 'src/modules/leadgen/migrations'),
)
const snapshotPath = path.resolve(
  args.snapshot ?? path.join(migrationsDir, '.snapshot-open-mercato.json'),
)
const dbName = String(args.db ?? 'om_drill_leadgen')
const cliCheckout = args['cli-checkout'] ? path.resolve(args['cli-checkout']) : null
const keep = args.keep === true
const outDir = path.resolve(args.out ?? path.join(repo, 'docs/crm-platform/verify'))

const phases = []
const failedPhases = []
const log = (msg) => console.log(msg)
function record(phase, ok, detail) {
  phases.push({ phase, ok, detail })
  // A phase that reports FAIL must fail the run. Relying on each call site to throw
  // is how a "gate" ends up green while its own output says FAIL.
  if (!ok) failedPhases.push(`${phase}: ${detail}`)
  log(`${ok ? 'PASS' : 'FAIL'}  ${phase}  ${detail}`)
}

class DrillError extends Error {}

function fail(phase, detail) {
  record(phase, false, detail)
  throw new DrillError(`${phase}: ${detail}`)
}

function readEnvUrl(envPath) {
  if (!fs.existsSync(envPath)) return null
  const m = fs.readFileSync(envPath, 'utf8').match(/^DATABASE_URL=(.+)$/m)
  if (!m) return null
  return m[1].trim().replace(/^["']|["']$/g, '')
}

function dbNameOf(url) {
  try {
    return new URL(url).pathname.replace(/^\//, '')
  } catch {
    return '?'
  }
}

function urlWithDatabase(url, db) {
  const u = new URL(url)
  u.pathname = `/${db}`
  return u.toString()
}

const mask = (url) => String(url).replace(/:[^:@/]*@/, ':***@')

function sudoPsql(db, sql, { tuplesOnly = true } = {}) {
  const argv = ['-n', '-u', 'postgres', 'psql', '-d', db, '-v', 'ON_ERROR_STOP=1', '-X']
  if (tuplesOnly) argv.push('-tA')
  argv.push('-c', sql)
  const r = spawnSync('sudo', argv, { encoding: 'utf8' })
  if (r.status !== 0) {
    throw new DrillError(`psql failed (${db}): ${(r.stderr || r.stdout || '').trim().slice(0, 400)}`)
  }
  return (r.stdout || '').trim()
}

function sudoPsqlFile(db, file) {
  return spawnSync('sudo', ['-n', '-u', 'postgres', 'psql', '-q', '-d', db, '-v', 'ON_ERROR_STOP=1', '-X', '-f', file], {
    encoding: 'utf8',
  })
}

function prodFingerprint(url) {
  const q = `select
      (select count(*) from information_schema.tables where table_schema='public')::text || '|' ||
      (select count(*) from information_schema.tables where table_schema='public' and table_name like 'leadgen%')::text || '|' ||
      (select count(*) from mikro_orm_migrations_leadgen)::text || '|' ||
      (select count(*) from information_schema.tables where table_schema='public' and table_name like 'mikro_orm_migrations%')::text`
  const r = spawnSync('psql', [url, '-tAc', q], { encoding: 'utf8' })
  if (r.status !== 0) throw new DrillError(`cannot fingerprint production: ${(r.stderr || '').trim().slice(0, 300)}`)
  return r.stdout.trim()
}

function loadMigrations() {
  if (!fs.existsSync(migrationsDir)) throw new DrillError(`migrations directory not found: ${migrationsDir}`)
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^Migration\d+.*\.ts$/.test(f))
    .sort()
  if (files.length === 0) throw new DrillError(`no Migration*.ts in ${migrationsDir}`)
  return files.map((f) => path.join(migrationsDir, f))
}

async function migrationSql(file, direction) {
  const mod = await import(pathToFileURL(file).href)
  const Cls = Object.values(mod).find((v) => typeof v === 'function' && /^Migration\d+/.test(v.name))
  if (!Cls) throw new DrillError(`no migration class exported by ${path.basename(file)}`)
  const instance = new Cls(undefined, undefined)
  const fn = instance[direction]
  if (typeof fn !== 'function') throw new DrillError(`${path.basename(file)} has no ${direction}()`)
  await fn.call(instance)
  return instance.getQueries().slice()
}

/** `array_agg(attname)` comes back as a real array for text[] but as the raw
 *  `{a,b}` literal for other array types (name[] among them), so normalise both. */
function toArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  const body = value.replace(/^\{/, '').replace(/\}$/, '')
  if (body === '') return []
  return body.split(',').map((s) => s.replace(/^"(.*)"$/, '$1'))
}

function normalizeDefault(value) {
  if (value === null || value === undefined) return null
  return String(value).replace(/::[a-z_ ]+(\[\])?$/i, '').replace(/^'(.*)'$/, '$1')
}

function pgTypeToSnapshot(t) {
  return SNAPSHOT_TYPE_MAP[t] ?? t
}

/** Row count of every module migration table: "did the CLI touch another module" is a DB fact, not a log parse. */
async function bookkeepingCounts(client) {
  const tables = await client.query(
    `select table_name from information_schema.tables
      where table_schema='public' and table_name like 'mikro_orm_migrations\\_%' order by 1`,
  )
  const out = {}
  for (const { table_name: name } of tables.rows) {
    const r = await client.query(`select count(*)::int as n from "${name}"`)
    out[name] = r.rows[0].n
  }
  return out
}

async function describeLeadgen(client) {
  const tables = await client.query(
    `select c.relname as name
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and c.relname like 'leadgen%'
      order by 1`,
  )
  const out = new Map()
  for (const { name } of tables.rows) {
    const cols = await client.query(
      `select a.attname as name,
              format_type(a.atttypid, a.atttypmod) as type,
              not a.attnotnull as nullable,
              pg_get_expr(d.adbin, d.adrelid) as default_expr
         from pg_attribute a
         join pg_class c on c.oid=a.attrelid
         join pg_namespace n on n.oid=c.relnamespace
         left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
        where n.nspname='public' and c.relname=$1 and a.attnum>0 and not a.attisdropped
        order by a.attnum`,
      [name],
    )
    const idx = await client.query(
      `select i.relname as key_name, ix.indisprimary as primary, ix.indisunique as unique,
              pg_get_expr(ix.indpred, ix.indrelid) as predicate,
              (select array_agg(a.attname order by k.ord)
                 from unnest(ix.indkey) with ordinality k(attnum, ord)
                 join pg_attribute a on a.attrelid=c.oid and a.attnum=k.attnum) as columns
         from pg_index ix
         join pg_class i on i.oid=ix.indexrelid
         join pg_class c on c.oid=ix.indrelid
         join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname=$1
        order by 1`,
      [name],
    )
    out.set(name, {
      columns: new Map(
        cols.rows.map((r) => [
          r.name,
          { type: pgTypeToSnapshot(r.type), nullable: r.nullable, default: normalizeDefault(r.default_expr) },
        ]),
      ),
      indexes: new Map(
        idx.rows.map((r) => [
          r.key_name,
          {
            columns: toArray(r.columns).join(','),
            primary: r.primary,
            unique: r.unique,
            predicate: normalizePredicate(r.predicate),
          },
        ]),
      ),
    })
  }
  return out
}

function compareToSnapshot(snapshot, live) {
  const diffs = []
  const snapTables = new Map(snapshot.tables.map((t) => [t.name, t]))
  for (const name of snapTables.keys()) if (!live.has(name)) diffs.push(`missing table ${name}`)
  for (const name of live.keys()) if (!snapTables.has(name)) diffs.push(`unexpected table ${name}`)
  for (const [name, snap] of snapTables) {
    const got = live.get(name)
    if (!got) continue
    const snapCols = Object.values(snap.columns)
    const snapColNames = new Set(snapCols.map((c) => c.name))
    for (const c of snapCols) {
      const liveCol = got.columns.get(c.name)
      if (!liveCol) {
        diffs.push(`${name}.${c.name}: missing column`)
        continue
      }
      if (liveCol.type !== c.type) diffs.push(`${name}.${c.name}: type ${liveCol.type} != snapshot ${c.type}`)
      if (liveCol.nullable !== c.nullable) diffs.push(`${name}.${c.name}: nullable ${liveCol.nullable} != ${c.nullable}`)
      const snapDefault = normalizeDefault(c.default)
      if (liveCol.default !== snapDefault) {
        diffs.push(`${name}.${c.name}: default ${JSON.stringify(liveCol.default)} != ${JSON.stringify(snapDefault)}`)
      }
    }
    for (const c of got.columns.keys()) if (!snapColNames.has(c)) diffs.push(`${name}.${c}: unexpected column`)
    const snapIdx = new Map((snap.indexes || []).map((i) => [i.keyName, i]))
    for (const [keyName, si] of snapIdx) {
      const li = got.indexes.get(keyName)
      if (!li) {
        diffs.push(`${name}: missing index ${keyName}`)
        continue
      }
      const cols = si.columnNames.join(',')
      if (li.columns !== cols) diffs.push(`${name}.${keyName}: columns ${li.columns} != ${cols}`)
      if (Boolean(li.unique) !== Boolean(si.unique)) diffs.push(`${name}.${keyName}: unique mismatch`)
      if (Boolean(li.primary) !== Boolean(si.primary)) diffs.push(`${name}.${keyName}: primary mismatch`)
    }
    for (const keyName of got.indexes.keys()) {
      if (!snapIdx.has(keyName) && !allowedIndexFor(name, keyName)) diffs.push(`${name}: unexpected index ${keyName}`)
    }
  }
  return diffs
}

/** Assert every declared partial unique index exists with exactly the documented shape. */
function verifyPartialIndexes(live) {
  const diffs = []
  for (const spec of PARTIAL_UNIQUE_INDEXES) {
    const table = live.get(spec.table)
    if (!table) {
      diffs.push(`${spec.table}: table missing, partial index ${spec.name} cannot exist`)
      continue
    }
    const index = table.indexes.get(spec.name)
    if (!index) {
      diffs.push(`${spec.name}: partial unique index missing`)
      continue
    }
    if (!index.unique) diffs.push(`${spec.name}: not UNIQUE`)
    if (index.primary) diffs.push(`${spec.name}: unexpectedly the primary key`)
    if (index.columns !== spec.columns) diffs.push(`${spec.name}: columns ${index.columns} != ${spec.columns}`)
    const expected = normalizePredicate(spec.predicate)
    if (index.predicate !== expected) diffs.push(`${spec.name}: predicate ${JSON.stringify(index.predicate)} != ${JSON.stringify(expected)}`)
  }
  return diffs
}

async function main() {
  const prodUrl = readEnvUrl(path.join(repo, '.env'))
  if (!prodUrl) throw new DrillError(`no DATABASE_URL in ${path.join(repo, '.env')}`)
  const prodDb = dbNameOf(prodUrl)
  if (!/^om_drill_[a-z0-9_]+$/.test(dbName)) {
    throw new DrillError(`refusing database name ${JSON.stringify(dbName)}: must match /^om_drill_[a-z0-9_]+$/`)
  }
  if (dbName === prodDb) throw new DrillError('refusing to run against the production database')
  const drillUrl = urlWithDatabase(prodUrl, dbName)
  record('guards', true, `drill db ${dbName} != prod db ${prodDb}; ${mask(drillUrl)}`)

  if (cliCheckout) {
    const cliEnv = readEnvUrl(path.join(cliCheckout, '.env'))
    if (cliEnv && dbNameOf(cliEnv) !== dbName) {
      throw new DrillError(
        `--cli-checkout .env points at ${dbNameOf(cliEnv)}, refusing: it must be the drill database (${dbName})`,
      )
    }
    record('guards.cli', true, `cli checkout ${cliCheckout} resolves to the drill database`)
  }

  const migrationFiles = loadMigrations()
  record('discovery', true, `${migrationFiles.length} slice(s): ${migrationFiles.map((f) => path.basename(f)).join(', ')}`)
  if (!fs.existsSync(snapshotPath)) throw new DrillError(`snapshot not found: ${snapshotPath}`)
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
  record('discovery.snapshot', true, `${snapshot.tables.length} tables declared by the ORM snapshot`)

  const prodBefore = prodFingerprint(prodUrl)
  const pg = await import('pg')
  const Client = pg.default?.Client ?? pg.Client
  let client = null
  let created = false

  try {
    // ---- phase: clone the production schema into the drill database
    spawnSync('sudo', ['-n', '-u', 'postgres', 'dropdb', '--if-exists', dbName], { encoding: 'utf8' })
    const create = spawnSync('sudo', ['-n', '-u', 'postgres', 'createdb', '-O', 'mercato', dbName], { encoding: 'utf8' })
    if (create.status !== 0) throw new DrillError(`createdb failed: ${(create.stderr || '').trim().slice(0, 300)}`)
    created = true

    const schemaDump = path.join(process.env.TMPDIR ?? '/tmp', `crm-drill-schema-${process.pid}.sql`)
    const dataDump = path.join(process.env.TMPDIR ?? '/tmp', `crm-drill-data-${process.pid}.sql`)
    const dump = spawnSync('pg_dump', [prodUrl, '--schema-only', '--no-owner', '--no-privileges', '--schema=public'], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    })
    if (dump.status !== 0) throw new DrillError(`pg_dump schema failed: ${(dump.stderr || '').trim().slice(0, 300)}`)
    // `public` already exists in the freshly created database; restoring its CREATE fails.
    fs.writeFileSync(schemaDump, dump.stdout.replace(/^CREATE SCHEMA public;\s*$/m, '').replace(/^ALTER SCHEMA public OWNER TO.*$/m, ''))
    // The bookkeeping rows tell the runner which module migrations already ran; without
    // them every module looks pending and the drill would rebuild 300+ unrelated tables.
    const data = spawnSync(
      'pg_dump',
      [prodUrl, '--data-only', '--no-owner', '--inserts', '--table=mikro_orm_migrations_*'],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
    )
    if (data.status !== 0) throw new DrillError(`pg_dump bookkeeping failed: ${(data.stderr || '').trim().slice(0, 300)}`)
    fs.writeFileSync(dataDump, data.stdout)

    const restore = sudoPsqlFile(dbName, schemaDump)
    // A text-search configuration references the unaccent extension, which is outside
    // the public-schema dump; that single object is irrelevant here and is expected.
    const restoreErr = (restore.stderr || '').trim()
    const fatalRestore = restoreErr
      .split('\n')
      .filter((l) => /ERROR|FATAL/.test(l))
      .filter((l) => !/text search dictionary "public\.unaccent"/.test(l))
    if (fatalRestore.length > 0) throw new DrillError(`schema restore failed: ${fatalRestore.slice(0, 2).join(' | ').slice(0, 400)}`)

    const book = sudoPsqlFile(dbName, dataDump)
    if (book.status !== 0) throw new DrillError(`bookkeeping restore failed: ${(book.stderr || '').trim().slice(0, 300)}`)

    const baseline = Number(sudoPsql(dbName, `select count(*) from information_schema.tables where table_schema='public'`))
    record('clone', true, `${baseline} tables cloned from ${prodDb} (schema + migration bookkeeping)`)

    // Ownership stays with postgres after restoring as superuser, so the app role would
    // not even see the bookkeeping tables. Grant instead of reassigning ownership.
    const grant = sudoPsql(
      dbName,
      `GRANT USAGE ON SCHEMA public TO mercato;
       GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mercato;
       GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mercato;
       GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO mercato;`,
    )
    void grant
    record('clone.grants', true, 'app role can read and write the cloned schema')

    client = new Client({ connectionString: drillUrl })
    await client.connect()
    const bookBefore = await bookkeepingCounts(client)

    // ---- phase: apply the slices for real
    if (cliCheckout) {
      const run = spawnSync('yarn', ['mercato', 'db', 'migrate'], {
        cwd: cliCheckout,
        env: { ...process.env, DATABASE_URL: drillUrl },
        encoding: 'utf8',
        timeout: 600_000,
      })
      const combined = `${run.stdout || ''}\n${run.stderr || ''}`
      const applied = combined.match(/leadgen:\s*(\d+)\s+migrations applied/i)
      const failed = combined.match(/Failed:\s*(.+)/i)
      if (failed) throw new DrillError(`CLI migrate failed: ${failed[1].trim().slice(0, 300)}`)
      record(
        'apply.cli',
        Boolean(applied),
        applied ? `real CLI applied ${applied[1]} leadgen migration(s)` : 'CLI reported no applied leadgen migration',
      )
      if (!applied) throw new DrillError('the real CLI did not apply the leadgen slices')
      const bookAfter = await bookkeepingCounts(client)
      const touched = Object.keys(bookAfter).filter((t) => (bookAfter[t] ?? 0) !== (bookBefore[t] ?? 0))
      record(
        'apply.cli.scope',
        touched.length === 1 && touched[0] === 'mikro_orm_migrations_leadgen',
        touched.length === 0
          ? 'the CLI booked no migration at all'
          : `only these module bookkeeping tables changed: ${touched.join(', ')}`,
      )
    } else {
      for (const file of migrationFiles) {
        const sqls = await migrationSql(file, 'up')
        await client.query('begin')
        try {
          for (const sql of sqls) await client.query(sql)
          await client.query('commit')
        } catch (err) {
          await client.query('rollback')
          throw err
        }
        record('apply.sql', true, `${path.basename(file)}: ${sqls.length} statement(s) applied`)
      }
    }

    const tablesAfterUp = Number(
      await client.query(`select count(*)::int as n from information_schema.tables where table_schema='public' and table_name like 'leadgen%'`).then((r) => r.rows[0].n),
    )
    if (tablesAfterUp !== snapshot.tables.length) {
      fail('apply.tables', `${tablesAfterUp} leadgen tables != ${snapshot.tables.length} expected from the snapshot`)
    }
    record('apply.tables', true, `${tablesAfterUp} leadgen tables created, matching the snapshot`)

    const totalAfterUp = Number(
      await client.query(`select count(*)::int as n from information_schema.tables where table_schema='public'`).then((r) => r.rows[0].n),
    )
    if (totalAfterUp !== baseline + tablesAfterUp) {
      fail('apply.scope', `${totalAfterUp} tables total != ${baseline} cloned + ${tablesAfterUp} new`)
    }
    record('apply.scope', true, `total tables ${baseline} -> ${totalAfterUp}, exactly the leadgen slices`)

    if (cliCheckout) {
      const bookRows = Number((await client.query(`select count(*)::int as n from mikro_orm_migrations_leadgen`)).rows[0].n)
      if (bookRows !== migrationFiles.length) fail('apply.bookkeeping', `${bookRows} bookkeeping rows != ${migrationFiles.length}`)
      record('apply.bookkeeping', true, `${bookRows} bookkeeping rows recorded by the runner`)
    }

    // ---- phase: drift against the ORM snapshot (the source the entities generate from)
    const live = await describeLeadgen(client)
    const partialDiffs = verifyPartialIndexes(live)
    if (partialDiffs.length > 0) {
      fail('drift.partial-indexes', `${partialDiffs.length} difference(s): ${partialDiffs.slice(0, 6).join(' | ')}`)
    }
    record(
      'drift.partial-indexes',
      true,
      `${PARTIAL_UNIQUE_INDEXES.length} hand-written partial UNIQUE index(es) present with the documented predicate`,
    )
    const diffs = compareToSnapshot(snapshot, live)
    if (diffs.length > 0) fail('drift', `${diffs.length} difference(s): ${diffs.slice(0, 6).join(' | ')}`)
    record('drift', true, `applied schema matches the ORM snapshot exactly (${snapshot.tables.length} tables, no delta)`)

    // ---- phase: roll back every slice, newest first
    for (const file of [...migrationFiles].reverse()) {
      const sqls = await migrationSql(file, 'down')
      if (sqls.length === 0) throw new DrillError(`${path.basename(file)} has an empty down()`)
      await client.query('begin')
      try {
        for (const sql of sqls) await client.query(sql)
        await client.query('commit')
      } catch (err) {
        await client.query('rollback')
        throw err
      }
      record('down.sql', true, `${path.basename(file)}: ${sqls.length} statement(s) rolled back`)
    }
    const afterDown = Number(
      (await client.query(`select count(*)::int as n from information_schema.tables where table_schema='public' and table_name like 'leadgen%'`)).rows[0].n,
    )
    if (afterDown !== 0) fail('down.result', `${afterDown} leadgen tables survived the rollback`)
    const leftoverSeq = Number(
      (await client.query(`select count(*)::int as n from information_schema.sequences where sequence_schema='public' and sequence_name like 'leadgen%'`)).rows[0].n,
    )
    if (leftoverSeq !== 0) fail('down.sequences', `${leftoverSeq} leadgen sequences survived the rollback`)
    record('down.result', true, 'zero leadgen tables and sequences left behind')

    // ---- phase: re-apply what we just rolled back
    for (const file of migrationFiles) {
      const sqls = await migrationSql(file, 'up')
      await client.query('begin')
      try {
        for (const sql of sqls) await client.query(sql)
        await client.query('commit')
      } catch (err) {
        await client.query('rollback')
        throw err
      }
    }
    const liveAgain = await describeLeadgen(client)
    const rediffs = compareToSnapshot(snapshot, liveAgain)
    if (rediffs.length > 0) fail('reapply', `${rediffs.length} difference(s) after re-apply: ${rediffs.slice(0, 4).join(' | ')}`)
    record('reapply', true, 're-applying after a full rollback reproduces the identical schema')

    // ---- phase: production must be byte-for-byte untouched
    const prodAfter = prodFingerprint(prodUrl)
    if (prodAfter !== prodBefore) fail('prod.guard', `production fingerprint changed: ${prodBefore} -> ${prodAfter}`)
    record('prod.guard', true, `production unchanged (tables|leadgen|bookkeeping|migration-tables = ${prodBefore})`)

    return { prodBefore, prodAfter, baseline, tablesAfterUp }
  } finally {
    if (client) await client.end().catch(() => {})
    for (const f of ['schemaDump', 'dataDump']) void f
    if (created && !keep) {
      spawnSync('sudo', ['-n', '-u', 'postgres', 'dropdb', '--if-exists', dbName], { encoding: 'utf8' })
      log(`dropped drill database ${dbName}`)
    } else if (created && keep) {
      log(`kept drill database ${dbName} (--keep)`)
    }
    for (const f of fs.readdirSync(process.env.TMPDIR ?? '/tmp')) {
      if (f.startsWith('crm-drill-schema-') || f.startsWith('crm-drill-data-')) {
        try {
          fs.unlinkSync(path.join(process.env.TMPDIR ?? '/tmp', f))
        } catch {}
      }
    }
  }
}

function writeReport(summary, failed) {
  fs.mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const file = path.join(outDir, `migration-drill-${stamp}.md`)
  const lines = [
    `# Leadgen migration drill — ${new Date().toISOString()}`,
    '',
    `Drill database: \`${dbName}\` (cloned from production schema, dropped afterwards: ${keep ? 'no, kept' : 'yes'}).`,
    `Migrations: \`${path.relative(repo, migrationsDir) || migrationsDir}\`.`,
    '',
    '| phase | result | detail |',
    '| --- | --- | --- |',
    ...phases.map((p) => `| ${p.phase} | ${p.ok ? 'PASS' : 'FAIL'} | ${p.detail.replace(/\|/g, '\\|')} |`),
    '',
    failed ? `**Result: FAIL** — ${failed}` : '**Result: PASS** — the slices apply, match the entities, roll back and re-apply cleanly.',
    '',
  ]
  fs.writeFileSync(file, lines.join('\n'))
  return file
}

let failed = null
let summary = null
try {
  summary = await main()
} catch (err) {
  failed = err instanceof DrillError ? err.message : `${err?.name ?? 'Error'}: ${err?.message ?? err}`
  log(`\nDRILL FAILED: ${failed}`)
}
// Any phase that recorded FAIL fails the run, even when no exception was thrown.
if (!failed && failedPhases.length > 0) failed = failedPhases.join('; ')
const reportPath = writeReport(summary, failed)
log(`\nreport: ${reportPath}`)
log(failed ? 'RESULT: FAIL' : 'RESULT: PASS')
process.exit(failed ? 1 : 0)
