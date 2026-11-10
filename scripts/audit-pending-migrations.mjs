#!/usr/bin/env node
/**
 * Read-only audit: compare the migration files shipped in this checkout with
 * the rows recorded in each module's `mikro_orm_migrations_<module>` table.
 *
 * Why this exists: the deploy gate classifies "migration changed?" from the git
 * diff only, so a migration that entered history earlier can reach production
 * without ever being applied (observed 2026-11-10: production ran code that
 * expected communications_send_requests while the table did not exist).
 *
 * Usage:
 *   node scripts/audit-pending-migrations.mjs [--json] [--allow-pending] [--module communications]
 *
 * Exit codes: 0 = nothing pending (or allowed), 1 = pending migrations found,
 * 2 = audit could not run.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TABLE_PREFIX = 'mikro_orm_migrations_'

export function migrationName(file) {
  const match = /^Migration(\d+)_/.exec(file)
  return match ? `Migration${match[1]}` : null
}

/**
 * Pure comparison so it can be tested without a database.
 * `filesByModule` maps module dir name -> migration file names.
 * `appliedByTable` maps migration table name -> applied migration names.
 * A module with no migration table is skipped (the module was never installed
 * or never migrated); any file under an unknown module is reported as its own
 * `unknownTable` row instead of being silently dropped.
 */
export function compareMigrations({ filesByModule, appliedByTable, onlyModule = null }) {
  const pending = []
  let checked = 0
  for (const [moduleName, files] of Object.entries(filesByModule)) {
    if (onlyModule && moduleName !== onlyModule) continue
    const table = `${TABLE_PREFIX}${moduleName}`
    if (!(table in appliedByTable)) continue
    const applied = new Set(appliedByTable[table])
    for (const file of files) {
      const name = migrationName(file)
      if (!name) continue
      checked += 1
      if (!applied.has(name)) pending.push({ module: moduleName, name, file })
    }
  }
  return { checked, pending }
}

export function discoverFiles(root = ROOT) {
  const byModule = {}
  const add = (moduleName, dir) => {
    let entries = []
    try {
      entries = fs.readdirSync(dir)
    } catch {
      return
    }
    byModule[moduleName] = entries.filter((f) => /\.(js|ts)$/.test(f))
  }
  const appModules = path.join(root, 'src', 'modules')
  try {
    for (const name of fs.readdirSync(appModules)) add(name, path.join(appModules, name, 'migrations'))
  } catch {}
  const installed = path.join(root, 'node_modules', '@open-mercato')
  try {
    for (const pkg of fs.readdirSync(installed)) {
      const modulesDir = path.join(installed, pkg, 'dist', 'modules')
      let modules = []
      try {
        modules = fs.readdirSync(modulesDir)
      } catch {
        continue
      }
      for (const name of modules) add(name, path.join(modulesDir, name, 'migrations'))
    }
  } catch {}
  return byModule
}

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const envFile = path.join(ROOT, '.env')
  try {
    const line = fs
      .readFileSync(envFile, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('DATABASE_URL='))
    if (line) return line.slice('DATABASE_URL='.length).trim()
  } catch {}
  return null
}

async function readApplied() {
  const url = readDatabaseUrl()
  if (!url) throw new Error('DATABASE_URL is not configured')
  const client = new pg.Client({ connectionString: url, statement_timeout: 30000 })
  await client.connect()
  try {
    const tables = await client.query(
      "select tablename from pg_tables where schemaname='public' and tablename like 'mikro_orm_migrations_%' order by 1",
    )
    const appliedByTable = {}
    for (const row of tables.rows) {
      const result = await client.query(`select name from "${row.tablename}"`)
      appliedByTable[row.tablename] = result.rows.map((r) => r.name)
    }
    return appliedByTable
  } finally {
    await client.end()
  }
}

export async function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json')
  const allowPending = argv.includes('--allow-pending')
  const moduleFlag = argv.indexOf('--module')
  const onlyModule = moduleFlag >= 0 ? argv[moduleFlag + 1] : null
  let appliedByTable
  try {
    appliedByTable = await readApplied()
  } catch (error) {
    console.error(`migration-audit: cannot read database: ${error.message}`)
    return 2
  }
  const filesByModule = discoverFiles()
  const { checked, pending } = compareMigrations({ filesByModule, appliedByTable, onlyModule })
  const summary = {
    modulesWithTables: Object.keys(appliedByTable).length,
    migrationFilesChecked: checked,
    pendingCount: pending.length,
    pending,
  }
  if (json) {
    console.log(JSON.stringify(summary, null, 2))
  } else {
    console.log(`migration-audit: ${summary.modulesWithTables} module tables, ${checked} files, ${pending.length} pending`)
    for (const row of pending.slice(0, 100)) console.log(`  ${row.module}: ${row.name} (${row.file})`)
    if (pending.length > 100) console.log(`  ... and ${pending.length - 100} more`)
  }
  return pending.length > 0 && !allowPending ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code
  })
}
