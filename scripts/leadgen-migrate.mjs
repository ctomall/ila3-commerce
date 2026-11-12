#!/usr/bin/env node
/**
 * Apply ONLY the leadgen migrations (4 slices) to one database.
 *
 * Why not `yarn db:migrate`: that CLI walks every module's pending migrations. At
 * the time M5 was approved, the communications module had two pending files whose
 * tables already existed, so the global command aborted before reaching leadgen.
 * This script uses the same MikroORM migrator, scoped to the leadgen module (own
 * ledger table `mikro_orm_migrations_leadgen`), so no other module is touched.
 *
 * Guards:
 *   - prints the target database and the pending list;
 *   - `--dry-run` stops before writing;
 *   - a non-production database is fine; the production database requires BOTH
 *     `--allow-production` and ILA3_ALLOW_PRODUCTION=1;
 *   - after applying, verifies the ledger rows and the leadgen table count.
 *
 * Usage:
 *   npx tsx scripts/leadgen-migrate.mjs --dry-run
 *   ILA3_ALLOW_PRODUCTION=1 npx tsx scripts/leadgen-migrate.mjs --allow-production
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver } from '@mikro-orm/postgresql'
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const MIGRATIONS = path.join(ROOT, 'src', 'modules', 'leadgen', 'migrations')
const TABLE = 'mikro_orm_migrations_leadgen'
const dryRun = process.argv.includes('--dry-run')
const allowProduction = process.argv.includes('--allow-production')

// .env is the app's resolved configuration; the deploy service reads the same file.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const dotenv = await import('dotenv').catch(() => null)
if (!process.env.DATABASE_URL) {
  const envPath = path.join(ROOT, '.env')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const match = line.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/)
      if (match) process.env.DATABASE_URL = match[1].replace(/^["']|["']$/g, '')
    }
  }
}
if (!process.env.DATABASE_URL) {
  console.error('FAIL DATABASE_URL is not set')
  process.exit(1)
}
const dbName = (() => {
  try {
    return new URL(process.env.DATABASE_URL).pathname.replace(/^\//, '')
  } catch {
    return '<unparsable>'
  }
})()
const isProduction = dbName === 'open_mercato'
if (isProduction && (!allowProduction || process.env.ILA3_ALLOW_PRODUCTION !== '1')) {
  console.error(`FAIL refusing production (${dbName}): pass --allow-production and ILA3_ALLOW_PRODUCTION=1`)
  process.exit(1)
}

const files = fs.readdirSync(MIGRATIONS).filter((file) => /^Migration.*\.(ts|js)$/.test(file) && !file.endsWith('.d.ts')).sort()
if (!files.length) {
  console.error(`FAIL no migration files in ${MIGRATIONS}`)
  process.exit(1)
}

const orm = await MikroORM.init({
  driver: PostgreSqlDriver,
  clientUrl: process.env.DATABASE_URL,
  entities: [],
  discovery: { warnWhenNoEntities: false },
  metadataProvider: ReflectMetadataProvider,
  migrations: {
    path: MIGRATIONS,
    glob: '!(*.d).{ts,js}',
    tableName: TABLE,
    snapshot: false,
    dropTables: false,
    transactional: true,
  },
  pool: { min: 1, max: 2 },
})

try {
  const pending = await orm.migrator.getPending()
  const names = pending.map((entry) => (typeof entry === 'string' ? entry : entry.name ?? entry.fileName))
  console.log(JSON.stringify({ database: dbName, production: isProduction, dryRun, pending: names }, null, 2))
  if (dryRun) {
    console.log('[leadgen-migrate] dry run: nothing applied')
  } else if (!names.length) {
    console.log('[leadgen-migrate] no pending migrations')
  } else {
    await orm.migrator.up()
    console.log(`[leadgen-migrate] applied ${names.length} migration(s)`)
  }
  const connection = orm.em.getConnection()
  const tables = await connection.execute(
    "select table_name from information_schema.tables where table_schema = current_schema() and table_name like 'leadgen\\_%' order by 1",
  )
  const ledger = await connection.execute(`select name from "${TABLE}" order by id`)
  console.log(
    JSON.stringify(
      { leadgenTables: tables.map((row) => row.table_name), ledger: ledger.map((row) => row.name) },
      null,
      2,
    ),
  )
} finally {
  await orm.close(true)
}
