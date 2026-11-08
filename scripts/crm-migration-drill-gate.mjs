#!/usr/bin/env node
/**
 * Gate wrapper around crm-migration-drill.mjs.
 *
 * The leadgen migrations are still under review, so they are not on main yet. A gate
 * that simply skips whenever the module is absent would stay yellow forever and prove
 * nothing. Instead this materialises the migration files straight out of the review
 * branch (`git show <ref>:src/modules/leadgen/migrations/<file>`) into `.mercato/`,
 * which is already ignored, and drills *those* against the current production schema.
 *
 * That turns the pending migration into something audited on every full run: if a core
 * table changes underneath it, or the branch drifts from the snapshot, this gate fails
 * before anybody approves an apply.
 *
 * Ref resolution order:
 *   1. $CRM_LEADGEN_MIGRATION_REF when set (e.g. a commit sha under review);
 *   2. src/modules/leadgen/migrations on the working tree, when it exists;
 *   3. the review branch feat/leadgen-schema-final;
 *   4. SKIP with the reason printed — never a silent pass.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// Overridable so the SKIP path itself can be exercised (and so a renamed review branch
// does not require editing this file).
const DEFAULT_REF = process.env.CRM_MIGRATION_DRILL_DEFAULT_REF || 'feat/leadgen-schema-final'
const MATERIALISE_ROOT = path.join('.mercato', 'migration-drill')

// An explicit but empty variable is almost always a CI template that failed to
// interpolate. Treating it as "unset" silently drills a branch nobody asked about.
const rawRef = process.env.CRM_LEADGEN_MIGRATION_REF
if (rawRef !== undefined && rawRef.trim() === '') {
  console.error('FAIL CRM_LEADGEN_MIGRATION_REF is set but empty: unset it, or name the ref to drill')
  process.exit(1)
}
const ref = rawRef ? rawRef.trim() : null
const worktreeDir = path.join('src', 'modules', 'leadgen', 'migrations')

function git(args) {
  return spawnSync('git', args, { encoding: 'utf8' })
}

function hasRef(candidate) {
  const r = git(['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`])
  return r.status === 0
}

function listFromRef(candidate) {
  const r = git(['ls-tree', '-r', '--name-only', candidate, '--', 'src/modules/leadgen/migrations'])
  if (r.status !== 0) return []
  return r.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => /^src\/modules\/leadgen\/migrations\/.+$/.test(s))
}

function materialise(candidate, files) {
  const slug = candidate.replace(/[^A-Za-z0-9._-]/g, '_')
  const target = path.join(MATERIALISE_ROOT, slug)
  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(target, { recursive: true })
  for (const file of files) {
    const r = git(['show', `${candidate}:${file}`])
    if (r.status !== 0) {
      console.error(`SKIP 无法从 ${candidate} 读取 ${file}`)
      process.exit(2)
    }
    fs.writeFileSync(path.join(target, path.basename(file)), r.stdout)
  }
  return target
}

let migrationsDir = null
let source = null

if (ref) {
  // An explicit ref must be the thing that gets drilled. Falling back to the default
  // branch here would report a pass for code nobody asked about.
  if (!hasRef(ref)) {
    console.error(`FAIL 无法解析 CRM_LEADGEN_MIGRATION_REF=${ref}`)
    process.exit(1)
  }
  const files = listFromRef(ref)
  if (files.length === 0) {
    console.error(`FAIL ${ref} 的 src/modules/leadgen/migrations 下没有迁移文件`)
    process.exit(1)
  }
  migrationsDir = materialise(ref, files)
  source = `${ref}（${files.length} 个文件）`
} else if (fs.existsSync(worktreeDir)) {
  migrationsDir = worktreeDir
  source = '工作树 src/modules/leadgen/migrations'
} else if (hasRef(DEFAULT_REF) && listFromRef(DEFAULT_REF).length > 0) {
  const files = listFromRef(DEFAULT_REF)
  migrationsDir = materialise(DEFAULT_REF, files)
  source = `${DEFAULT_REF}（${files.length} 个文件）`
}

if (!migrationsDir) {
  console.log(`SKIP leadgen 迁移不在当前分支，且找不到评审分支 ${DEFAULT_REF}`)
  console.log('     设 CRM_LEADGEN_MIGRATION_REF=<sha 或分支> 可指定待评审的迁移版本')
  // 78 = "nothing to prove here", which crm-verify-all reports as SKIP instead of PASS.
  process.exit(78)
}

console.log(`INFO 演练来源：${source}`)
const run = spawnSync(
  'npx',
  ['tsx', 'scripts/crm-migration-drill.mjs', '--migrations-dir', migrationsDir, '--out', 'docs/crm-platform/verify'],
  { stdio: 'inherit', env: process.env },
)
process.exit(run.status ?? 1)
