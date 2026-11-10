import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {classifySql, extractSqlFromTs, preflightMigrations, scanMigrations} from './migration-preflight.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function tempRelease(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ila3-migration-preflight-'))
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(root, relative)
    fs.mkdirSync(path.dirname(full), {recursive: true})
    fs.writeFileSync(full, contents)
  }
  return root
}

function tsMigration(sql) {
  return `import { Migration } from '@mikro-orm/migrations'
export class M extends Migration {
  override up(): void { this.addSql(\`${sql}\`) }
}`
}

test('expand-only migration passes', () => {
  const root = tempRelease({
    'src/modules/demo/migrations/Migration1.ts': tsMigration(
      'create table "demo_items" ("id" uuid not null); create index "demo_idx" on "demo_items" ("id");',
    ),
  })
  const result = preflightMigrations({releaseDir: root})
  assert.equal(result.ok, true)
  assert.equal(result.scanned, 1)
  assert.equal(result.expand, 1)
  assert.equal(result.destructive, 0)
})

test('drop table is refused', () => {
  const root = tempRelease({
    'src/modules/demo/migrations/Migration2.ts': tsMigration('drop table "demo_items";'),
  })
  const result = preflightMigrations({releaseDir: root})
  assert.equal(result.ok, false)
  assert.equal(result.destructive, 1)
  assert.match(result.blocker, /Migration2/)
})

test('column type change is refused', () => {
  const verdict = classifySql('alter table "demo" alter column "amount" type numeric(12,2);')
  assert.equal(verdict.kind, 'destructive')
  assert.match(verdict.reasons.join(' '), /type change/)
})

test('unknown statement blocks unless explicitly allowed', () => {
  const root = tempRelease({
    'src/modules/demo/migrations/Migration3.ts': tsMigration('grant all on "demo" to public;'),
  })
  const refused = preflightMigrations({releaseDir: root})
  assert.equal(refused.ok, false)
  assert.equal(refused.unknown, 1)
  const allowed = preflightMigrations({releaseDir: root, allowDestructive: true})
  assert.equal(allowed.ok, false, 'allow-destructive must never whitelist unknown statements')
})

test('allow-destructive admits destructive DDL for a drill', () => {
  const root = tempRelease({
    'src/modules/demo/migrations/Migration4.ts': tsMigration('drop table "demo_items";'),
  })
  assert.equal(preflightMigrations({releaseDir: root}).ok, false)
  assert.equal(preflightMigrations({releaseDir: root, allowDestructive: true}).ok, true)
})

test('release without migrations passes with zero scans', () => {
  const root = tempRelease({'README.md': 'no migrations here'})
  const result = preflightMigrations({releaseDir: root})
  assert.equal(result.ok, true)
  assert.equal(result.scanned, 0)
})

test('missing release directory fails closed', () => {
  const result = preflightMigrations({releaseDir: '/nonexistent/release/for/test'})
  assert.equal(result.ok, false)
  assert.match(result.reason, /missing/)
})

test('this repository communications migration classifies as expand', () => {
  const items = scanMigrations(REPO)
  const ours = items.find((item) => item.file.includes('communications/migrations/'))
  assert.ok(ours, 'expected the communications migration to be discovered')
  assert.equal(ours.kind, 'expand', `reasons: ${ours.reasons.join('; ')}`)
})

test('only migrations absent from the baseline are pending', () => {
  const baseline = tempRelease({
    'src/modules/demo/migrations/Migration1.ts': tsMigration('drop table "legacy";'),
  })
  const release = tempRelease({
    'src/modules/demo/migrations/Migration1.ts': tsMigration('drop table "legacy";'),
    'src/modules/demo/migrations/Migration2.ts': tsMigration('create table "next_one" ("id" uuid);'),
  })
  const result = preflightMigrations({releaseDir: release, baselineDir: baseline})
  assert.equal(result.ok, true, 'historical migration must not be re-judged')
  assert.equal(result.scanned, 1)
  assert.equal(result.baseline, 1)
})


test('CLI exits 0 for an expand-only release', () => {
  const root = tempRelease({
    'src/modules/demo/migrations/Migration1.ts': tsMigration('create table "ok" ("id" uuid);'),
  })
  const run = spawnSync(process.execPath, [path.join(REPO, 'scripts/auto-deploy/migration-preflight.mjs'), '--release-dir', root], {encoding: 'utf8'})
  assert.equal(run.status, 0, run.stderr)
  assert.equal(JSON.parse(run.stdout).ok, true)
})

test('CLI exits 1 for a destructive release so the deploy stage refuses', () => {
  const root = tempRelease({
    'src/modules/demo/migrations/Migration1.ts': tsMigration('drop table "legacy";'),
  })
  const run = spawnSync(process.execPath, [path.join(REPO, 'scripts/auto-deploy/migration-preflight.mjs'), '--release-dir', root], {encoding: 'utf8'})
  assert.equal(run.status, 1)
  const parsed = JSON.parse(run.stdout)
  assert.equal(parsed.ok, false)
  assert.equal(parsed.blocker.endsWith('Migration1.ts'), true)
})

test('a rollback drop in down() is not a forward destructive change', () => {
  const source = [
    "export class Migration20261110081559_communications extends Migration {",
    "  override name = 'Migration20261110081559';",
    '  override up(): void | Promise<void> {',
    '    this.addSql(`alter table "communications_send_requests" add "payload_hash" text null;`);',
    '  }',
    '  override down(): void | Promise<void> {',
    '    this.addSql(`alter table "communications_send_requests" drop column "payload_hash";`);',
    '  }',
    '}',
  ].join('\n')
  const sql = extractSqlFromTs(source)
  assert.equal(sql.includes('drop column'), false, 'down() must not be scanned')
  assert.equal(classifySql(sql).kind, 'expand')
})
