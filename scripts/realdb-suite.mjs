#!/usr/bin/env node
/**
 * One-shot disposable-Postgres harness for the communications real-DB suites.
 *
 * The four real-DB proofs (reconciliation, customer link, internal-note read, send
 * ledger) each need a live database, and running them by hand means remembering
 * initdb/ports/cleanup every time. This script owns that lifecycle:
 *
 *   1. initdb into a fresh temp dir (trust auth, 127.0.0.1 only),
 *   2. one throwaway database per suite (a suite that drops its table cannot
 *      damage the next one),
 *   3. `jest` per suite with P6_REALDB_URL injected,
 *   4. stop the cluster and remove the data dir in a `finally` — also on failure.
 *
 *   node scripts/realdb-suite.mjs                 # all suites, then clean up
 *   node scripts/realdb-suite.mjs --keep          # leave the cluster running
 *   node scripts/realdb-suite.mjs --only ledger   # one suite (substring match)
 *
 * It prints a PASS/FAIL line per suite and exits non-zero if any failed, so it can
 * be used as a pre-release check. It is NOT wired into CI: that needs an
 * environment-provided P6_REALDB_URL and a decision about running Postgres in the
 * pipeline. Nothing here touches the production cluster.
 */
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SUITES = [
  {
    name: 'reconciliation',
    test: 'src/modules/communications/__tests__/product-reconciliation-realdb.test.ts',
  },
  {
    name: 'customer-link',
    test: 'src/modules/communications/__tests__/customer-link-realdb.test.ts',
  },
  {
    name: 'internal-notes',
    test: 'src/modules/communications/__tests__/internal-notes-realdb.test.ts',
  },
  {
    name: 'send-ledger',
    test: 'src/modules/communications/__tests__/send-ledger-realdb.test.ts',
  },
]

const keep = process.argv.includes('--keep')
const onlyIndex = process.argv.indexOf('--only')
const only = onlyIndex === -1 ? null : process.argv[onlyIndex + 1]
const suites = only ? SUITES.filter((suite) => suite.name.includes(only)) : SUITES
if (suites.length === 0) {
  console.error(`--only "${only}" matched no suite (available: ${SUITES.map((s) => s.name).join(', ')})`)
  process.exit(2)
}

function pgBinDir() {
  const explicit = process.env.REALDB_PG_BIN
  if (explicit) return explicit
  const roots = ['/usr/lib/postgresql', '/usr/pgsql', '/opt/homebrew/opt/postgresql/bin']
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    const candidates = root.endsWith('/bin')
      ? [root]
      : fs.readdirSync(root).map((entry) => path.join(root, entry, 'bin')).filter((dir) => fs.existsSync(dir))
    const usable = candidates.filter(
      (dir) => fs.existsSync(path.join(dir, 'initdb')) && fs.existsSync(path.join(dir, 'pg_ctl')) && fs.existsSync(path.join(dir, 'createdb')),
    )
    if (usable.length) return usable.sort().at(-1)
  }
  throw new Error('no PostgreSQL binaries found; set REALDB_PG_BIN to a bin directory with initdb/pg_ctl/createdb')
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close(() => (port ? resolve(port) : reject(new Error('could not allocate a port'))))
    })
  })
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options })
}

const bin = pgBinDir()
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'realdb-suite-'))
const port = await freePort()
let started = false
const results = []

try {
  const initdb = run(path.join(bin, 'initdb'), ['-D', dataDir, '-U', 'postgres', '--auth=trust'])
  if (initdb.status !== 0) throw new Error(`initdb failed: ${(initdb.stderr || '').trim()}`)

  const start = run(path.join(bin, 'pg_ctl'), [
    '-D',
    dataDir,
    '-o',
    `-p ${port} -k ${dataDir} -c listen_addresses=127.0.0.1`,
    '-l',
    path.join(dataDir, 'server.log'),
    'start',
  ])
  if (start.status !== 0) throw new Error(`pg_ctl start failed: ${(start.stderr || start.stdout || '').trim()}`)
  started = true

  console.log(`[realdb] cluster ready on 127.0.0.1:${port} (data: ${dataDir})`)
  let failed = 0

  for (const suite of suites) {
    const dbName = `crm_${suite.name.replace(/[^a-z0-9]+/gi, '_')}`
    const created = run(path.join(bin, 'createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', dbName])
    if (created.status !== 0) {
      results.push({ suite: suite.name, ok: false, detail: `createdb failed: ${(created.stderr || '').trim()}` })
      failed += 1
      continue
    }
    const url = `postgresql://postgres@127.0.0.1:${port}/${dbName}`
    const jestRun = run(
      process.execPath,
      ['node_modules/jest/bin/jest.js', '--config', 'jest.config.cjs', '--runInBand', suite.test],
      { env: { ...process.env, P6_REALDB_URL: url }, timeout: 300_000 },
    )
    const ok = jestRun.status === 0
    if (!ok) failed += 1
    results.push({
      suite: suite.name,
      ok,
      detail: ok ? 'passed' : (jestRun.stderr || jestRun.stdout || '').trim().split('\n').slice(-6).join(' | '),
    })
  }

  console.log('\n[realdb] summary')
  for (const result of results) {
    console.log(`  ${result.ok ? 'PASS' : 'FAIL'} ${result.suite}${result.ok ? '' : ` — ${result.detail}`}`)
  }
  process.exitCode = failed > 0 ? 1 : 0
} catch (error) {
  console.error(`[realdb] harness error: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 3
} finally {
  if (started && !keep) {
    run(path.join(bin, 'pg_ctl'), ['-D', dataDir, 'stop', '-m', 'fast'])
    fs.rmSync(dataDir, { recursive: true, force: true })
    console.log('[realdb] cluster stopped and data dir removed')
  } else if (started) {
    console.log(`[realdb] keeping cluster: ${dataDir} (port ${port}) — stop with: ${path.join(bin, 'pg_ctl')} -D ${dataDir} stop`)
  } else {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
}
