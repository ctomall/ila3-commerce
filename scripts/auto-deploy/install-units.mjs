/**
 * Install (or just compare) the systemd units for the release path from this repo.
 *
 * The units used to live only in /etc: nobody could review a change, and the app's
 * TimeoutStopSec stayed at 30s while a graceful drain needs longer, so systemd
 * SIGKILLed the app mid-shutdown (2026-11-09 23:53). `deploy/systemd/` is the
 * source of truth now; --check reports drift and --apply installs it.
 *
 * Default is --check (read-only). --apply needs passwordless sudo and reloads
 * systemd; it never touches units outside the four release-path ones.
 */
import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const UNIT_DIR = path.join(REPO, 'deploy', 'systemd')
export const ETC_DIR = '/etc/systemd/system'

export const UNITS = [
  'ila3-auto-deploy-app.service',
  'ila3-auto-deploy.service',
  'ila3-auto-deploy.timer',
  'ila3-self-update.service',
]

/**
 * Compare the *semantics* of two unit files: comments and blank lines are
 * documentation, so only directives count as drift.
 */
export function normalizeUnit(text) {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && !line.trimStart().startsWith('#'))
}

export function compareUnit(expected, actual) {
  if (actual === null) return {status: 'missing', lines: []}
  const expectedLines = normalizeUnit(expected)
  const actualLines = normalizeUnit(actual)
  if (expectedLines.join('\n') === actualLines.join('\n')) return {status: 'same', lines: []}
  const lines = []
  const max = Math.max(expectedLines.length, actualLines.length)
  for (let i = 0; i < max && lines.length < 6; i += 1) {
    if (expectedLines[i] !== actualLines[i]) {
      lines.push(`line ${i + 1}: repo="${expectedLines[i] ?? '(absent)'}" etc="${actualLines[i] ?? '(absent)'}"`)
    }
  }
  return {status: 'drift', lines}
}

function readOrNull(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function hadDropIn(unit) {
  const dir = path.join(ETC_DIR, `${unit}.d`)
  try {
    return fs.readdirSync(dir).filter((name) => name.endsWith('.conf'))
  } catch {
    return []
  }
}

function sudoOk() {
  const probe = spawnSync('sudo', ['-n', 'true'], {encoding: 'utf8'})
  return probe.status === 0
}

function applyUnit(unit, contents) {
  const target = path.join(ETC_DIR, unit)
  const write = spawnSync('sudo', ['-n', 'tee', target], {input: contents, encoding: 'utf8'})
  if (write.status !== 0) throw new Error(`cannot write ${target}: ${(write.stderr || '').trim()}`)
  return target
}

function main() {
  const apply = process.argv.includes('--apply')
  const report = []
  for (const unit of UNITS) {
    const expected = readOrNull(path.join(UNIT_DIR, unit))
    if (expected === null) throw new Error(`missing repo unit ${unit}`)
    const actual = readOrNull(path.join(ETC_DIR, unit))
    const comparison = compareUnit(expected, actual)
    report.push({unit, ...comparison, dropIns: hadDropIn(unit)})
  }

  const effective = (unit) => {
    const show = spawnSync('systemctl', ['show', '-p', 'ExecStart', '-p', 'TimeoutStopUSec', unit], {encoding: 'utf8'})
    const text = show.stdout || ''
    const argv = /argv\[\]=(.*?) ;/.exec(text)?.[1] ?? '(none)'
    const timeout = /TimeoutStopUSec=(.*)/.exec(text)?.[1]?.trim() ?? '(default)'
    return `exec=${argv} timeout-stop=${timeout}`
  }
  for (const row of report) {
    console.log(`${row.status.toUpperCase().padEnd(7)} ${row.unit}${row.dropIns.length ? ` (drop-ins: ${row.dropIns.join(', ')})` : ''}`)
    for (const line of row.lines) console.log(`        ${line}`)
    console.log(`        effective: ${effective(row.unit)}`)
  }

  const drift = report.filter((row) => row.status !== 'same')
  if (!apply) {
    console.log(drift.length ? `\n${drift.length} unit(s) differ; run with --apply (sudo) to install` : '\nall units match the repo')
    process.exit(drift.length ? 1 : 0)
  }

  if (!sudoOk()) {
    console.error('--apply needs passwordless sudo (sudo -n true failed)')
    process.exit(2)
  }
  for (const row of drift) {
    const target = applyUnit(row.unit, readOrNull(path.join(UNIT_DIR, row.unit)))
    console.log(`written ${target}`)
  }
  // The repo units already carry RequiresMountsFor and the unified ExecStart, so the two
  // hand-written drop-ins become redundant once the base files are installed. Move them
  // aside instead of deleting, so a rollback is one `mv` away.
  for (const stale of ['ila3-auto-deploy-app.service.d/10-nvme-mounts.conf',
    'ila3-auto-deploy.service.d/10-nvme-mounts.conf',
    'ila3-auto-deploy.service.d/20-unified-entry.conf',
    'ila3-self-update.service.d/20-unified-entry.conf']) {
    const source = path.join(ETC_DIR, stale)
    if (!fs.existsSync(source)) continue
    const moved = spawnSync('sudo', ['-n', 'mv', source, `${source}.bak`], {encoding: 'utf8'})
    console.log(moved.status === 0 ? `retired ${stale} -> .bak` : `could not retire ${stale}: ${(moved.stderr || '').trim()}`)
  }
  const reload = spawnSync('sudo', ['-n', 'systemctl', 'daemon-reload'], {encoding: 'utf8'})
  if (reload.status !== 0) throw new Error(`daemon-reload failed: ${(reload.stderr || '').trim()}`)
  for (const unit of ['ila3-auto-deploy.timer', 'ila3-auto-deploy-app.service']) {
    spawnSync('systemctl', ['enable', '--now', unit], {encoding: 'utf8'})
  }
  console.log('daemon-reload done; timer + app enabled')
  process.exit(0)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
