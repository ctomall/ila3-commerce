#!/usr/bin/env node
/**
 * Contract test for the nav-a11y managed patch.
 *
 * The shell is a prebuilt dependency, so `yarn install` can silently drop the
 * accessibility fix. This asserts the manifest entry, applies the patch to an
 * isolated copy of the installed AppShell.js, and checks the bytes the build
 * must consume:
 *   - aria-current is wired on the main, child and section active branches;
 *   - both sidebar width transitions carry motion-reduce:transition-none;
 *   - a second run is a no-op (the patch is idempotent).
 *
 * Run with `node scripts/patches/__tests__/nav-a11y.test.mjs`.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/patches/manifest.json'), 'utf8'))
const entry = manifest.patches.find((patch) => patch.id === 'nav-a11y')
assert.ok(entry, 'manifest declares the nav-a11y patch')
assert.equal(entry.script, 'scripts/patches/apply-nav-a11y.mjs')
assert.equal(entry.target, 'node_modules/@open-mercato/ui/dist/backend/AppShell.js')
assert.equal(entry.marker, '/* [patched:nav-a11y] */')

const target = path.join(root, entry.target)
assert.ok(fs.existsSync(target), 'installed AppShell.js exists')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-a11y-test-'))
const isolated = path.join(tmp, entry.target)
fs.mkdirSync(path.dirname(isolated), { recursive: true })
fs.copyFileSync(target, isolated)

const apply = () =>
  spawnSync(process.execPath, [path.join(root, entry.script)], {
    cwd: tmp,
    encoding: 'utf8',
  })

try {
  const first = apply()
  assert.equal(first.status, 0, first.stderr || first.stdout)
  const patched = fs.readFileSync(isolated, 'utf8')

  assert.equal((patched.match(/\[patched:nav-a11y\]/g) ?? []).length, 5, 'five markers written')
  assert.equal((patched.match(/"aria-current"/g) ?? []).length, 3, 'three aria-current branches')
  assert.equal((patched.match(/motion-reduce:transition-none/g) ?? []).length, 2, 'two reduced-motion transitions')
  assert.match(patched, /"aria-current": isActive \? "page"/, 'section item uses isActive')
  assert.match(patched, /"aria-current": isParentActive \? "page"/, 'main item uses isParentActive')
  assert.match(patched, /"aria-current": childActive \? "page"/, 'child item uses childActive')
  assert.ok(!patched.includes('transition-[width] duration-200 ease-out`'), 'aside width has no bare transition')
  assert.ok(
    !patched.includes('transition-[grid-template-columns] duration-200 ease-out ${gridColsClass}'),
    'grid width has no bare transition',
  )
  assert.match(
    patched,
    /transition-\[width\] duration-200 ease-out motion-reduce:transition-none`/,
    'aside width carries the reduced-motion variant',
  )
  assert.match(
    patched,
    /transition-\[grid-template-columns\] duration-200 ease-out motion-reduce:transition-none \$\{gridColsClass\}/,
    'grid width carries the reduced-motion variant',
  )

  const second = apply()
  assert.equal(second.status, 0, second.stderr || second.stdout)
  assert.match(second.stdout, /already applied/, 'second run is a no-op')
  assert.equal(fs.readFileSync(isolated, 'utf8'), patched, 're-applying does not change bytes')
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log('nav-a11y contract: ok')
