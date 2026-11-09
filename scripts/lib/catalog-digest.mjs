/**
 * Structural fingerprint of one schema, for the restore drill.
 *
 * Round 25's drill compared `information_schema.tables` counts and six `count(*)`
 * probes. That passes when a restore loses every index, every foreign key and every
 * sequence — the schema survives in name only, and the first write after a real
 * recovery walks into a missing constraint. Row counts are not enough, and neither is
 * a table count: both survive holes.
 *
 * This module answers "is the restored schema the same schema" by hashing the facts a
 * restore is supposed to reproduce:
 *
 *   columns      name, ordinal, type, length, nullability, default
 *   indexes      name + full definition (so a changed predicate changes the digest)
 *   constraints  name + type + table + `pg_get_constraintdef` (PK/FK/UNIQUE/CHECK)
 *   sequences    every sequence in the schema
 *   triggers     user triggers and their definitions
 *   views        view name + definition
 *
 * Determinism matters more than completeness here: every query ends with `order by`, so
 * two databases with the same schema produce the same lines in the same order. Anything
 * psql cannot order is not included.
 *
 * The caller supplies `psql(db, sql)` because the drill runs psql as the postgres user
 * while the self-test may run it elsewhere. Identifiers are validated, never trusted:
 * both the schema and the table names in `rowDigest` must match /^[a-z0-9_]+$/.
 */
import { createHash } from 'node:crypto'

const IDENT = /^[a-z0-9_]+$/

function assertIdent(value, what) {
  if (!IDENT.test(String(value))) throw new Error(`refusing ${what} ${JSON.stringify(value)}: must match /^[a-z0-9_]+$/`)
  return String(value)
}

const KINDS = ['columns', 'indexes', 'constraints', 'sequences', 'triggers', 'views']

const QUERIES = {
  columns: (s) => `
    select table_name || '|' || column_name || '|' || rn || '|' || data_type
        || '|' || coalesce(character_maximum_length::text, '') || '|' || is_nullable
        || '|' || coalesce(column_default, '')
    from (
      select table_name, column_name, data_type, character_maximum_length, is_nullable, column_default,
             row_number() over (partition by table_name order by ordinal_position) as rn
      from information_schema.columns
      where table_schema = '${s}'
    ) c
    order by 1`,
  indexes: (s) => `
    select indexname || '|' || indexdef
    from pg_indexes
    where schemaname = '${s}'
    order by 1`,
  // Structured, not deparsed text. A CHECK round-tripped through pg_dump comes back in a
  // different but equivalent shape — `ANY ((ARRAY[...])::text[])` becomes
  // `ANY (ARRAY[(...)::text, ...])` — so comparing `pg_get_constraintdef` text reports a
  // difference that does not exist. Compare what a constraint *is*: kind, table, the
  // column set in order, the foreign target and its actions. The predicate text of a
  // CHECK is deliberately not compared; its presence and name are.
  constraints: (s) => `
    select c.conname || '|' || c.contype::text || '|' || coalesce(t.relname, '')
        || '|' || coalesce((
             select string_agg(a.attname, ',' order by k.ord)
             from unnest(c.conkey) with ordinality as k(attnum, ord)
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum), '')
        || '|' || coalesce(fc.relname, '')
        || '|' || coalesce((
             select string_agg(a.attname, ',' order by k.ord)
             from unnest(c.confkey) with ordinality as k(attnum, ord)
             join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum), '')
        || '|' || c.confdeltype::text || '|' || c.confupdtype::text
        || '|' || case when c.condeferrable then 'deferrable' else '-' end
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    left join pg_class t on t.oid = c.conrelid
    left join pg_class fc on fc.oid = c.confrelid
    where n.nspname = '${s}'
    order by 1`,
  sequences: (s) => `
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'S' and n.nspname = '${s}'
    order by 1`,
  triggers: (s) => `
    select t.tgname || '|' || c.relname || '|' || pg_get_triggerdef(t.oid)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = '${s}' and not t.tgisinternal
    order by 1`,
  views: (s) => `
    select table_name || '|' || coalesce(view_definition, '')
    from information_schema.views
    where table_schema = '${s}'
    order by 1`,
}

/**
 * Read every structural fact for one schema.
 *
 * Lines are schema-name-normalised: PostgreSQL writes the schema into definitions
 * (`nextval('a.t_id_seq'::regclass)`, `CREATE INDEX … ON a.t`), so the same DDL in two
 * differently named schemas produces different text. Left alone, that makes every
 * comparison red regardless of the restore, and the comparator's own negative control
 * proves the point — it was the first thing to fail when this module was wired in.
 *
 * The replacement is a word-boundary match on the schema identifier, applied identically
 * to both sides, so a same-name comparison is unaffected and a cross-schema one becomes
 * meaningful.
 *
 * @param {(sql: string) => string} psql returns newline-separated rows, empty string for none
 * @param {{ schema?: string }} options
 */
export function catalogFacts(psql, { schema = 'public' } = {}) {
  const s = assertIdent(schema, 'schema')
  const scrub = new RegExp(`\\b${s}\\b`, 'g')
  const facts = {}
  for (const kind of KINDS) {
    const out = psql(QUERIES[kind](s))
    facts[kind] =
      out === ''
        ? []
        : out
            .split('\n')
            .map((line) => line.trimEnd().replace(scrub, '<schema>'))
            .filter((line) => line !== '')
  }
  return facts
}

/** sha256 over every kind, in a fixed order, so the digest is comparable across runs. */
export function factsDigest(facts) {
  const hash = createHash('sha256')
  for (const kind of KINDS) {
    hash.update(`## ${kind}\n`)
    for (const line of facts[kind]) hash.update(`${line}\n`)
  }
  return { digest: hash.digest('hex'), counts: Object.fromEntries(KINDS.map((k) => [k, facts[k].length])) }
}

/**
 * Per-kind set difference. `missing` = in the source but not in the restore (data lost),
 * `extra` = in the restore but not in the source (something appeared), both sorted.
 * Lines are shown, not just counts: "3 indexes differ" is not actionable, the index
 * names are.
 */
export function diffFacts(source, restored) {
  const diffs = {}
  let total = 0
  for (const kind of KINDS) {
    const a = new Set(source[kind] ?? [])
    const b = new Set(restored[kind] ?? [])
    const missing = [...a].filter((line) => !b.has(line)).sort()
    const extra = [...b].filter((line) => !a.has(line)).sort()
    if (missing.length || extra.length) {
      diffs[kind] = { missing, extra }
      total += missing.length + extra.length
    }
  }
  return { total, diffs }
}

/** One readable sentence per differing kind, capped so a report stays a report. */
export function describeDiff(diffs, limit = 3) {
  const parts = []
  for (const [kind, { missing, extra }] of Object.entries(diffs)) {
    const bits = []
    if (missing.length) bits.push(`缺少 ${missing.length}（${missing.slice(0, limit).join(' ; ')}）`)
    if (extra.length) bits.push(`多出 ${extra.length}（${extra.slice(0, limit).join(' ; ')}）`)
    parts.push(`${kind}: ${bits.join('，')}`)
  }
  return parts.join(' | ')
}

/**
 * Content fingerprint of one table: row count plus an order-independent hash of every
 * row rendered as text.
 *
 * A dump/restore is byte-preserving, so a full-row digest is legitimate here — it would
 * not be if either side were re-serialised through the application. Small tables only:
 * the caller decides, and `rowDigest` refuses tables above `maxRows` rather than
 * silently sampling (a sample would turn "identical" into a guess).
 */
export function rowDigest(psql, table, { maxRows = 200000 } = {}) {
  const t = assertIdent(table, 'table')
  const value = psql(`select count(*) from ${t}`)
  if (!/^\d+$/.test(value)) throw new Error(`expected an integer row count from ${t}, got ${JSON.stringify(value)}`)
  const rows = Number(value)
  if (rows > maxRows) {
    return { table: t, rows, digest: null, skipped: `超过 ${maxRows} 行，不做整表摘要（不采样，避免把猜测当结论）` }
  }
  const body = psql(
    `select coalesce(md5(string_agg(h, '' order by h)), '-') from (select md5(t::text) as h from ${t} t) s`,
  )
  if (!/^[0-9a-f]{32}$/.test(body)) throw new Error(`unexpected row digest from ${t}: ${JSON.stringify(body)}`)
  return { table: t, rows, digest: body, skipped: null }
}

export { KINDS }
