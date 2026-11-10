/**
 * Migration preflight for the upgrade pipeline.
 *
 * The deploy executor swaps a symlink and restarts the app; it never runs
 * migrations. Shipping a release whose migrations never applied would make the
 * new code hit missing tables at runtime (fail-closed 503s), so the pipeline has
 * to refuse a cutover it cannot migrate safely.
 *
 * What this checks: every migration the release would need is an EXPAND
 * operation (create table / add column / create index / add constraint), which
 * an old process can keep running against. Destructive DDL (DROP, type changes,
 * renames, TRUNCATE, DELETE, SET NOT NULL) and unrecognised statements are
 * refused unless the caller explicitly allows them for a drill.
 *
 * It is intentionally a static classifier, not a database diff: it runs before
 * any migration is applied, needs no database connection, and its verdict is
 * reproducible from the release bytes alone.
 */
import fs from 'node:fs'
import path from 'node:path'

const DESTRUCTIVE_PATTERNS = [
  { re: /^\s*drop\s+table\b/i, reason: 'drop table' },
  { re: /^\s*drop\s+column\b/i, reason: 'drop column' },
  { re: /^\s*alter\s+table\b[\s\S]*?\bdrop\s+column\b/i, reason: 'alter table drop column' },
  { re: /^\s*alter\s+table\b[\s\S]*?\balter\s+column\b[\s\S]*?\btype\b/i, reason: 'column type change' },
  { re: /^\s*alter\s+table\b[\s\S]*?\brename\s+(to|column)\b/i, reason: 'rename' },
  { re: /^\s*alter\s+table\b[\s\S]*?\bset\s+not\s+null\b/i, reason: 'set not null without backfill' },
  { re: /^\s*truncate\b/i, reason: 'truncate' },
  { re: /^\s*delete\s+from\b/i, reason: 'delete rows' },
]

const EXPAND_PATTERNS = [
  /^\s*create\s+table\b/i,
  // Postgres accepts `add [column] "x" type`; the optional keyword was missing, so an
  // additive column came back "unclassified" (2026-11-10).
  /^\s*alter\s+table\b[\s\S]*?\badd\s+(column\s+)?"?\w+"?\s/i,
  /^\s*create\s+(unique\s+)?index\b/i,
  /^\s*alter\s+table\b[\s\S]*?\badd\s+constraint\b/i,
  /^\s*create\s+extension\b/i,
  /^\s*comment\s+on\b/i,
  /^\s*insert\s+into\b/i,
]

export function splitStatements(sql) {
  const withoutComments = String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*--.*$/gm, ' ')
  return withoutComments
    .split(';')
    .map((piece) => piece.trim())
    .filter(Boolean)
}

export function classifySql(sql) {
  const statements = splitStatements(sql)
  const reasons = []
  let destructive = 0
  let expand = 0
  let unknown = 0
  for (const statement of statements) {
    const destructiveHit = DESTRUCTIVE_PATTERNS.find((entry) => entry.re.test(statement))
    if (destructiveHit) {
      destructive++
      reasons.push(`destructive: ${destructiveHit.reason}`)
      continue
    }
    if (EXPAND_PATTERNS.some((re) => re.test(statement))) {
      expand++
      continue
    }
    unknown++
    reasons.push(`unclassified: ${statement.slice(0, 80).replace(/\s+/g, ' ')}`)
  }
  const kind = destructive > 0 ? 'destructive' : unknown > 0 ? 'unknown' : 'expand'
  return { kind, statements: statements.length, expand, destructive, unknown, reasons }
}

/**
 * Body of `up()` only.
 *
 * The guard exists to stop irreversible FORWARD changes. `down()` is the sanctioned
 * rollback path, and a migration that adds a column almost always drops it in `down()`;
 * scanning the whole file classified that rollback as a destructive forward change and
 * refused the release (2026-11-10, communications payload_hash: up() was a single
 * additive statement, down() dropped the same column).
 */
function extractUpBody(source) {
  const start = /up\s*\([^)]*\)[^{]*\{/.exec(source)
  if (!start) return null
  const open = start.index + start[0].length - 1
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  return source.slice(open + 1)
}

export function extractSqlFromTs(source) {
  const upBody = extractUpBody(source)
  const scanTarget = upBody === null ? source : upBody
  const parts = []
  const template = /this\.addSql\(\s*`([\s\S]*?)`\s*[,)]/g
  let match
  while ((match = template.exec(scanTarget)) !== null) parts.push(match[1])
  const quoted = /this\.addSql\(\s*'([\s\S]*?)'\s*[,)]/g
  while ((match = quoted.exec(scanTarget)) !== null) parts.push(match[1])
  return parts.join(';\n')
}

/** Every migration file the release carries, with its classified SQL. */
export function scanMigrations(appDir) {
  const roots = []
  const modulesDir = path.join(appDir, 'src', 'modules')
  if (fs.existsSync(modulesDir)) {
    for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const migrations = path.join(modulesDir, entry.name, 'migrations')
      if (fs.existsSync(migrations)) roots.push(migrations)
    }
  }
  const packageMigrations = path.join(appDir, 'node_modules', '@open-mercato', 'core', 'dist', 'modules')
  if (fs.existsSync(packageMigrations)) {
    for (const entry of fs.readdirSync(packageMigrations, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const migrations = path.join(packageMigrations, entry.name, 'migrations')
      if (fs.existsSync(migrations)) roots.push(migrations)
    }
  }

  const items = []
  for (const root of roots) {
    for (const file of fs.readdirSync(root)) {
      const full = path.join(root, file)
      if (!fs.statSync(full).isFile()) continue
      if (!/\.(ts|js|sql)$/.test(file)) continue
      const source = fs.readFileSync(full, 'utf8')
      const sql = file.endsWith('.sql') ? source : extractSqlFromTs(source)
      if (!sql.trim()) continue
      const verdict = classifySql(sql)
      items.push({
        file: path.relative(appDir, full),
        kind: verdict.kind,
        statements: verdict.statements,
        reasons: verdict.reasons,
      })
    }
  }
  return items
}

export function preflightMigrations({releaseDir, baselineDir = null, allowDestructive = false} = {}) {
  if (!releaseDir || !fs.existsSync(releaseDir)) {
    return {ok: false, reason: 'release directory missing', items: [], scanned: 0}
  }
  // Only migrations this release ADDS are pending. Comparing by relative path
  // against the release currently serving avoids asking the database for its
  // applied list (the pipeline must run before any migration is applied) and
  // keeps historical destructive migrations from blocking every future deploy.
  const baseline = baselineDir && fs.existsSync(baselineDir) ? scanMigrations(baselineDir) : []
  const known = new Set(baseline.map((item) => item.file))
  const items = scanMigrations(releaseDir).filter((item) => !known.has(item.file))
  const destructive = items.filter((item) => item.kind === 'destructive')
  const unknown = items.filter((item) => item.kind === 'unknown')
  const expand = items.filter((item) => item.kind === 'expand')
  const blocking = allowDestructive ? unknown : [...destructive, ...unknown]
  return {
    ok: blocking.length === 0,
    allowDestructive: Boolean(allowDestructive),
    scanned: items.length,
    baseline: baselineDir ? baseline.length : null,
    expand: expand.length,
    destructive: destructive.length,
    unknown: unknown.length,
    blocker: blocking.length ? blocking[0].file : null,
    items,
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2)
  const arg = (name, fallback = null) => {
    const index = args.indexOf(name)
    return index >= 0 ? args[index + 1] ?? fallback : fallback
  }
  const releaseDir = arg('--release-dir', process.cwd())
  const result = preflightMigrations({
    releaseDir,
    baselineDir: arg('--baseline-dir', null),
    allowDestructive: args.includes('--allow-destructive'),
  })
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.ok ? 0 : 1)
}
