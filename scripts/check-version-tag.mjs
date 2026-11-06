#!/usr/bin/env node
/**
 * Release-tag consistency gate.
 *
 * The upgrade page derives the version from `git describe`, so a release tag that
 * disagrees with package.json makes the UI report a version the code is not. This check
 * fails when a vX.Y.Z tag points at HEAD (or when CI builds a tag ref) and its number
 * differs from package.json.
 *
 * No tag at HEAD is fine: ordinary commits are not releases.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = String(pkg.version ?? '').trim()

const git = (args) => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return ''
  }
}

if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`[version-tag] package.json version is not semver: "${version}"`)
  process.exit(1)
}

const tagsAtHead = git(['tag', '--points-at', 'HEAD', '--list', 'v*'])
  .split('\n')
  .map((tag) => tag.trim())
  .filter(Boolean)
const ciTagRef = process.env.GITHUB_REF_TYPE === 'tag' ? (process.env.GITHUB_REF_NAME ?? '').trim() : ''

const candidates = Array.from(new Set([...tagsAtHead, ...(ciTagRef.startsWith('v') ? [ciTagRef] : [])]))
if (candidates.length === 0) {
  console.log(`[version-tag] v${version}: no release tag at HEAD, nothing to compare`)
  process.exit(0)
}

const mismatched = candidates.filter((tag) => tag.replace(/^v/, '') !== version)
if (mismatched.length > 0) {
  console.error(
    `[version-tag] tag ${mismatched.join(', ')} does not match package.json version ${version}. ` +
      'Bump package.json (and the lockfile if it carries the version) or move the tag.',
  )
  process.exit(1)
}

console.log(`[version-tag] v${version} matches ${candidates.join(', ')}`)
