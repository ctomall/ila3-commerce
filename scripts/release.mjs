#!/usr/bin/env node
/**
 * Release helper: bump the version, commit, tag and push.
 *
 * The upgrade surface derives versions from tags, so a release has to be a single
 * atomic step — otherwise package.json, the tag and the pushed refs drift apart.
 *
 * Usage: node scripts/release.mjs [patch|minor|major] [--dry-run]
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const bump = (process.argv.find((arg) => ['patch', 'minor', 'major'].includes(arg)) ?? 'patch')
const dryRun = process.argv.includes('--dry-run')

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', ...options }).trim()
}
function log(message) {
  console.log(`[release] ${message}`)
}

const pkgPath = path.join(root, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const current = String(pkg.version)
const [major, minor, patch] = current.split('.').map((part) => Number.parseInt(part, 10))
const next =
  bump === 'major'
    ? `${major + 1}.0.0`
    : bump === 'minor'
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`

// Preconditions: a release from a dirty tree or a diverged branch is not reproducible.
const dirty = git(['status', '--porcelain'])
if (dirty && !dryRun) {
  console.error('[release] working tree is dirty; commit or stash first')
  process.exit(1)
}
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
if (branch !== 'main' && !dryRun) {
  console.error(`[release] refusing to release from branch ${branch}`)
  process.exit(1)
}
const tagName = `v${next}`
if (git(['tag', '--list', tagName])) {
  console.error(`[release] tag ${tagName} already exists`)
  process.exit(1)
}

log(`${current} -> ${next} (${tagName})${dryRun ? ' [dry run]' : ''}`)
if (dryRun) {
  log('would bump package.json, commit "chore(release): ' + tagName + '", tag and push')
  process.exit(0)
}

pkg.version = next
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

// The lockfile carries the root version too; keep it in sync when present.
const lockPath = path.join(root, 'yarn.lock')
if (fs.existsSync(lockPath)) {
  const lock = fs.readFileSync(lockPath, 'utf8')
  const updated = lock.replace(/("open-mercato@workspace:[^"]*"|__metadata:\n  version: )([^\n]*)/, (match) => match)
  if (updated !== lock) fs.writeFileSync(lockPath, updated)
}

git(['add', 'package.json'])
git(['commit', '-m', `chore(release): ${tagName}`])
git(['tag', '-a', tagName, '-m', `ILA3 Commerce ${next}`])
git(['push', 'origin', 'HEAD:main'])
git(['push', 'origin', tagName])
log(`released ${tagName}; CI will build the artifact for it`)
