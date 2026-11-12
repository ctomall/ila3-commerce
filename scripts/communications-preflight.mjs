#!/usr/bin/env node
/**
 * Pre-release preflight for the communications workbench slice (S100).
 *
 * Runs the gates this work actually depends on and — because several agents share
 * this checkout — attributes typecheck failures instead of blaming this slice for
 * someone else's in-flight code:
 *
 *   node scripts/communications-preflight.mjs                 # generate + typecheck + tests + realdb
 *   node scripts/communications-preflight.mjs --with-lint     # add eslint .
 *   node scripts/communications-preflight.mjs --skip-generate --skip-typecheck
 *   node scripts/communications-preflight.mjs --owned src/modules/communications --owned scripts
 *
 * Exit codes:
 *   0  every gate passed
 *   1  a gate failed inside the owned scope (this slice's regression)
 *   2  no owned-scope failure, but the repository gate is blocked by files outside
 *      the owned scope (another agent's uncommitted work) — do not ship, but do not
 *      misreport it as this slice breaking
 *   3  harness error (tool missing, unfinished step)
 *
 * Read-only with respect to the repository and the database: it never commits,
 * never resets, never removes files, and the real-DB step uses its own disposable
 * cluster (scripts/realdb-suite.mjs).
 */
import { spawnSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'

const argv = process.argv.slice(2)
const has = (flag) => argv.includes(flag)
const valuesOf = (flag) => {
  const out = []
  argv.forEach((value, index) => {
    if (value === flag && argv[index + 1]) out.push(argv[index + 1])
  })
  return out
}

const owned = valuesOf('--owned')
const ownedPrefixes = owned.length ? owned : ['src/modules/communications']
const skipGenerate = has('--skip-generate')
const skipTypecheck = has('--skip-typecheck')
const withLint = has('--with-lint')

function step(name, command, args, options = {}) {
  const started = performance.now()
  const result = spawnSync(command, args, { encoding: 'utf8', env: process.env, timeout: 900_000 })
  const elapsedMs = Math.round(performance.now() - started)
  return {
    name,
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    elapsedMs,
  }
}

/**
 * Parser self-check. The attribution logic is the whole point of this script, and
 * it only runs when the repository is already broken — which is exactly when it
 * must not be wrong. Exercised by `preflight-attribution.test.ts`.
 */
function selfTestAttribution() {
  const sample = [
    'src/modules/communications/lib/a.ts(10,5): error TS2322: owned one',
    'src/modules/communications/api/b.ts(3,1): error TS2554: owned two',
    'src/modules/leadgen/services/c.ts(7,9): error TS2345: foreign one',
    'not a diagnostic line',
    'src/app/api/leadgen/sends/route.ts(74,85): error TS2339: foreign two',
  ].join('\n')
  const parsed = classifyTypecheck(sample)
  const ok = parsed.owned.length === 2 && parsed.foreign.length === 2
  console.log(`[preflight] attribution self-check ${ok ? 'PASS' : 'FAIL'} (owned=${parsed.owned.length} foreign=${parsed.foreign.length})`)
  const empty = classifyTypecheck('')
  const emptyOk = empty.owned.length === 0 && empty.foreign.length === 0
  console.log(`[preflight] empty-input self-check ${emptyOk ? 'PASS' : 'FAIL'}`)
  process.exitCode = ok && emptyOk ? 0 : 3
}

const results = []

if (has('--check-attribution')) {
  selfTestAttribution()
  // Optional self-check exits here; the gate run below never executes.
  process.exit(process.exitCode ?? 0)
}

console.log('[preflight] communications slice')
console.log(`[preflight] owned scope: ${ownedPrefixes.join(', ')}`)

if (!skipGenerate) results.push(step('generate', 'yarn', ['generate']))
if (!skipTypecheck) results.push(step('typecheck', 'yarn', ['typecheck']))
if (withLint) results.push(step('lint', 'yarn', ['lint']))
results.push(
  step('module-tests', process.execPath, [
    'node_modules/jest/bin/jest.js',
    '--config',
    'jest.config.cjs',
    '--runInBand',
    'src/modules/communications',
  ]),
)
results.push(step('realdb', process.execPath, ['scripts/realdb-suite.mjs']))

function isOwnedPath(file) {
  return ownedPrefixes.some((prefix) => file === prefix || file.startsWith(`${prefix}/`))
}

/** Parse `tsc` diagnostics into owned/foreign buckets. */
function classifyTypecheck(text) {
  const errors = []
  const pattern = /^(\S+?\.(?:ts|tsx|mts|cts))\((\d+),\d+\): error (TS\d+): (.*)$/gm
  let match
  while ((match = pattern.exec(text)) !== null) {
    errors.push({ file: match[1], line: Number(match[2]), code: match[3], message: match[4] })
  }
  return {
    owned: errors.filter((error) => isOwnedPath(error.file)),
    foreign: errors.filter((error) => !isOwnedPath(error.file)),
  }
}

let exitCode = 0
const typecheckResult = results.find((result) => result.name === 'typecheck')
let attribution = null
if (typecheckResult && !typecheckResult.ok) {
  attribution = classifyTypecheck(`${typecheckResult.stdout}\n${typecheckResult.stderr}`)
  if (attribution.owned.length > 0) exitCode = Math.max(exitCode, 1)
  else if (attribution.foreign.length > 0) exitCode = Math.max(exitCode, 2)
  else exitCode = Math.max(exitCode, 1)
}

for (const result of results) {
  // Typecheck is attributed above; every other failed gate is this slice's problem.
  if (!result.ok && result.name !== 'typecheck') exitCode = Math.max(exitCode, 1)
}

console.log('\n[preflight] steps')
for (const result of results) {
  const label = result.name === 'typecheck' && !result.ok && attribution ? 'SPLIT' : result.ok ? 'PASS' : 'FAIL'
  console.log(`  ${label.padEnd(5)} ${result.name.padEnd(13)} ${result.elapsedMs}ms`)
  if (!result.ok && result.name !== 'typecheck') {
    const detail = `${result.stderr || ''}\n${result.stdout || ''}`.trim().split('\n').slice(-12).join('\n    ')
    if (detail) console.log(`    ${detail}`)
  }
}

if (attribution) {
  console.log('\n[preflight] typecheck attribution')
  console.log(`  owned-scope errors:  ${attribution.owned.length}`)
  console.log(`  outside scope:       ${attribution.foreign.length}`)
  for (const error of attribution.owned.slice(0, 20)) {
    console.log(`  OWNED ${error.file}:${error.line} ${error.code} ${error.message}`)
  }
  const foreignFiles = [...new Set(attribution.foreign.map((error) => error.file))]
  if (foreignFiles.length) {
    console.log(`  foreign files (not this slice): ${foreignFiles.slice(0, 8).join(', ')}${foreignFiles.length > 8 ? ` …+${foreignFiles.length - 8}` : ''}`)
  }
}

console.log('\n[preflight] result')
if (exitCode === 0) {
  console.log('  PASS — every gate green in the owned scope')
} else if (exitCode === 1) {
  console.log('  FAIL — owned-scope gate failed; fix before shipping')
} else if (exitCode === 2) {
  console.log('  BLOCKED — repository gate fails only on files outside the owned scope (another change in flight)')
  console.log('  Do not ship; re-run once that work lands or use the owned-scope result as the slice evidence.')
} else {
  console.log('  HARNESS ERROR')
}
process.exitCode = exitCode
