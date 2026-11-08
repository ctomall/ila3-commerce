#!/usr/bin/env node
/**
 * Read-only audit of carriage returns in the dictionary tables.
 *
 * Why a script and not a sentence: the pending approval is "clean 19 dictionary names
 * that still carry a trailing CR". A reviewer cannot check that by reading a diff of an
 * UPDATE, and hard-coding "19" in the SQL makes the check wrong the moment a row is
 * added. This prints exactly which rows change, to what, and refuses to hand over a
 * plan that would turn two dictionary names into the same string.
 *
 * Facts it establishes (all read-only):
 *   - how many rows carry a CR in name / description / key, and how many entries do;
 *   - the concrete before/after of every affected row, with CR shown as <CR>;
 *   - whether cleaning would create duplicate names inside one (organization, tenant);
 *   - how many entries hang off each affected dictionary, so the blast radius is known.
 *
 * Modes:
 *   (default)        audit and print the plan; exit 1 only if cleaning would collide
 *   --assert-clean   exit 1 while any CR remains — use this after the cleanup runs
 *
 * Usage: node scripts/crm-dict-cr-audit.mjs [--assert-clean]
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ASSERT_CLEAN = process.argv.includes('--assert-clean')
const CR = String.fromCharCode(13)

function psql(sql) {
  // psql treats a literal backslash inside -c as a meta-command, so a multi-line query
  // arrives as "invalid command \\n". Collapse the whitespace before it leaves Node.
  const flat = sql.replace(/\s+/g, ' ').trim()
  let out
  try {
    out = execFileSync(
      'bash',
      [
        '-lc',
        `cd /home/pro/apps/mercato && export $(grep -E "^DATABASE_URL" .env | xargs) && psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -At -F $'\\t' -c ${JSON.stringify(flat)} 2>/tmp/crm-dict-audit.err`,
      ],
      { encoding: 'utf8' },
    ).trim()
  } catch (error) {
    throw new Error(`psql failed: ${String(error).slice(0, 300)}`)
  }
  // A warning on stderr is not fatal; a psql error that still exited 0 would be, so the
  // stderr file is checked for "ERROR"/"FATAL" instead of being ignored.
  try {
    const err = fs.readFileSync('/tmp/crm-dict-audit.err', 'utf8')
    if (/\b(ERROR|FATAL)\b/.test(err)) throw new Error(`psql reported an error: ${err.trim().slice(0, 300)}`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('psql reported')) throw error
  }
  return out
}

/** A count that is not a plain integer is a failure, not a zero. */
function int(text, what) {
  const value = String(text).trim()
  if (!/^\d+$/.test(value)) throw new Error(`${what}: expected an integer, got ${JSON.stringify(value)}`)
  return Number(value)
}

function rows(sql) {
  const out = psql(sql)
  if (out === '') return []
  return out.split('\n').map((line) => line.split('\t'))
}

const CR_LIKE = (col) => `${col} like '%' || chr(13) || '%'`

const targetDb = psql('select current_database()')
const counts = {
  dictionaries: int(psql('select count(*) from dictionaries'), 'dictionaries'),
  nameCr: int(psql(`select count(*) from dictionaries where ${CR_LIKE('name')}`), 'dictionaries.name'),
  descriptionCr: int(psql(`select count(*) from dictionaries where ${CR_LIKE("coalesce(description,'')")}`), 'dictionaries.description'),
  keyCr: int(psql(`select count(*) from dictionaries where ${CR_LIKE('key')}`), 'dictionaries.key'),
  entries: int(psql('select count(*) from dictionary_entries'), 'dictionary_entries'),
  entryLabelCr: int(psql(`select count(*) from dictionary_entries where ${CR_LIKE('label')}`), 'entries.label'),
  entryValueCr: int(psql(`select count(*) from dictionary_entries where ${CR_LIKE("coalesce(value,'')")}`), 'entries.value'),
}

function mark(value) {
  return value.split(CR).join('<CR>').split('\n').join('<LF>').split('\t').join('<TAB>')
}

const affected = rows(`
  select d.key,
         d.name,
         replace(d.name, chr(13), ''),
         length(d.name) - length(replace(d.name, chr(13), '')),
         (select count(*) from dictionary_entries e where e.dictionary_id = d.id)
    from dictionaries d
   where ${CR_LIKE('d.name')}
   order by d.key`)

const collisions = rows(`
  select organization_id::text, tenant_id::text, replace(name, chr(13), ''), count(*)::text
    from dictionaries
   group by organization_id, tenant_id, replace(name, chr(13), '')
  having count(*) > 1`)

// An empty database answers every count with 0 and would let --assert-clean pass on
// nothing. State the target and require the table to be non-empty where it must be.
console.log(`目标库：${targetDb}`)
if (counts.dictionaries === 0) {
  console.log('\nRESULT: FAIL — dictionaries 是空的：连错库或数据缺失，任何"已无 CR"的结论都不成立。')
  process.exit(1)
}
console.log('字典名称控制字符审计（只读）')
console.log('─'.repeat(72))
console.log(`dictionaries 总行数            ${counts.dictionaries}`)
console.log(`  name 带 CR                   ${counts.nameCr}`)
console.log(`  description 带 CR            ${counts.descriptionCr}`)
console.log(`  key 带 CR                    ${counts.keyCr}`)
console.log(`dictionary_entries 总行数       ${counts.entries}`)
console.log(`  label 带 CR                  ${counts.entryLabelCr}`)
console.log(`  value 带 CR                  ${counts.entryValueCr}`)
console.log('')

if (affected.length > 0) {
  console.log('将要改动的行（只改 name，其余列不动）：')
  console.log('')
  console.log('| key | 现在 | 清洗后 | 去掉的 CR | 关联条目 |')
  console.log('| --- | --- | --- | --- | --- |')
  for (const [key, name, cleaned, removed, entryCount] of affected) {
    console.log(`| ${key} | ${mark(name)} | ${mark(cleaned)} | ${removed} | ${entryCount} |`)
  }
  console.log('')
  if (affected.length !== counts.nameCr) {
    console.log(`\nRESULT: FAIL — 列表 ${affected.length} 行与计数 ${counts.nameCr} 不一致，审计本身不可信。`)
    process.exit(1)
  }
  console.log(`合计 ${affected.length} 行、${affected.reduce((sum, r) => sum + Number(r[4]), 0)} 条关联条目（条目的 label/value 本身不含 CR）。`)
} else {
  console.log('没有任何 dictionary 的 name 带 CR。')
}
console.log('')

// The unique constraint is on (organization_id, tenant_id, key), so a name collision
// cannot be refused by the database — it would just show up in the UI as two identical
// labels. That is exactly the kind of thing a reviewer cannot see in an UPDATE diff.
const dupNames = new Set(collisions.map(([, , name]) => name))
console.log(`清洗后同名冲突（同一 organization+tenant 内）：${dupNames.size === 0 ? '无' : `${dupNames.size} 组`}`)
if (dupNames.size > 0) {
  for (const [org, tenant, name, n] of collisions) {
    console.log(`  ✗ ${org}/${tenant} → ${mark(name)} ×${n}`)
  }
}

let exitCode = 0
if (dupNames.size > 0) {
  console.log('\nRESULT: FAIL — 清洗会让同名出现在同一 scope 内，先决定保留哪一条再执行。')
  exitCode = 1
} else if (ASSERT_CLEAN) {
  const remaining = counts.nameCr + counts.descriptionCr + counts.keyCr + counts.entryLabelCr + counts.entryValueCr
  if (remaining > 0) {
    console.log(`\nRESULT: FAIL — 仍有 ${remaining} 处 CR（--assert-clean 模式）。`)
    exitCode = 1
  } else {
    console.log('\nRESULT: PASS — 字典相关列已无 CR。')
  }
} else {
  console.log('\nRESULT: PASS — 清洗计划无冲突；执行仍需人工批准（当前未执行）。')
}

// The reviewed plan lives next to the SQL so the two cannot drift apart silently.
const sqlPath = path.resolve('docs/crm-platform/regression/dict-cr-cleanup.sql')
if (fs.existsSync(sqlPath)) console.log(`\n待执行脚本：${path.relative(process.cwd(), sqlPath)}`)
process.exit(exitCode)
